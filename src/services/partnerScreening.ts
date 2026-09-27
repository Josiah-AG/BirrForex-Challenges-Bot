import { db } from '../database/db';
import { ExnessService, exnessService } from './exnessService';
import { hostService } from './hostService';
import { tradingChallengeService } from './tradingChallengeService';
import { emailService } from './emailService';

export function screeningSlot(date: string, time: string): string {
  const hour = Number(time.split(':')[0]);
  if (hour >= 22) return `${date}:night`;
  if (hour >= 10) return `${date}:day`;
  return `${new Date(Date.parse(date + 'T12:00:00Z') - 86400000).toISOString().slice(0,10)}:night`;
}
export function classifyPartner(status: string, affiliation?: boolean): string {
  if (status === 'CHANGING') return 'changing';
  if (status === 'LEFT') return affiliation === false ? 'not_allocated' : affiliation === true ? 'allocated' : 'check_failed';
  return ['ACTIVE','INACTIVE'].includes(status) && affiliation === true ? 'allocated' : 'check_failed';
}
export async function brokerForChallenge(challenge: any): Promise<ExnessService | null> {
  if (!challenge.host_id) return exnessService;
  const credentials = await hostService.getBrokerCredentials(challenge.host_id);
  return credentials ? new ExnessService(credentials) : null;
}
const sleep = (ms:number) => new Promise(resolve => setTimeout(resolve,ms));
export async function inspectPartner(broker: ExnessService, reg: any): Promise<any> {
  const base = {id:reg.id,nickname:reg.nickname,email:reg.email,accountNumber:reg.account_number,accountType:reg.account_type,disqualified:reg.disqualified};
  if (!reg.email) return {...base,status:'no_email'};
  // Always re-establish identity against the current host integration, not a stale UID.
  for (let attempt=0;attempt<2;attempt++) {
    const alloc = await broker.checkAllocation(reg.email);
    if (alloc && typeof alloc.affiliation === 'boolean') {
      const uid = alloc.client_uid || reg.client_uid;
      const uuid = uid ? await broker.getFullUuid(uid) : null;
      const info = uuid ? await broker.getKycStatus(uuid) : null;
      if (info) return {...base,clientUid:uid,status:classifyPartner(info.client_status,alloc.affiliation),brokerStatus:info.client_status,allocated:alloc.affiliation};
    }
    if (!attempt) await sleep(1000);
  }
  return {...base,status:'check_failed'};
}
export async function inspectParticipants(broker:ExnessService, participants:any[], consume?:(result:any)=>Promise<void>):Promise<any[]> {
  const results:any[] = new Array(participants.length); let index=0;
  // Bounded concurrency; no shared MT5 terminal usage.
  await Promise.all(Array.from({length:Math.min(3,participants.length)},async()=>{
    while(index<participants.length) {
      const i=index++; const r=await inspectPartner(broker,participants[i]);
      results[i]=r; if(consume) await consume(r); await sleep(500);
    }
  }));
  return results;
}
export async function runPartnerScreening(challenge:any,slot:string):Promise<void> {
  const lease=await db.getClient(); let locked=false;
  try {
    locked=(await lease.query('SELECT pg_try_advisory_lock(26092710,$1) AS locked',[challenge.id])).rows[0].locked;
    if(!locked)return;
    const fresh=(await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challenge.id])).rows[0];
    if(!fresh || fresh.status!=='active')return;
    const broker=await brokerForChallenge(fresh); if(!broker)return;
    const prior=await db.query("SELECT 1 FROM partner_screening_runs WHERE challenge_id=$1 AND slot=$2 AND (state='complete' OR (state='partial' AND updated_at>NOW()-INTERVAL '10 minutes'))",[challenge.id,slot]);
    if(prior.rows.length)return;
    await db.query(`INSERT INTO partner_screening_runs(challenge_id,slot) VALUES($1,$2) ON CONFLICT(challenge_id,slot) DO UPDATE SET state='running',updated_at=NOW()`,[challenge.id,slot]);
    const previous=(await db.query('SELECT results FROM partner_screening_runs WHERE challenge_id=$1 AND slot=$2',[challenge.id,slot])).rows[0]?.results || [];
    const verified=previous.filter((r:any)=>['allocated','changing','not_allocated'].includes(r.status));
    const done=new Set(verified.map((r:any)=>r.id));
    const participants=(await tradingChallengeService.getActiveRegistrations(challenge.id)).filter((r:any)=>!done.has(r.id));
    const checked=await inspectParticipants(broker,participants,async r=>{
      if(!['changing','not_allocated','allocated'].includes(r.status))return;
      const tx=await db.getClient();
      try {
        await tx.query('BEGIN');
        if(fresh.host_id && !(await tx.query('SELECT 1 FROM hosts WHERE id=$1 AND has_broker_integration=true',[fresh.host_id])).rows.length){await tx.query('COMMIT');return;}
        const reg=(await tx.query('SELECT * FROM trading_registrations WHERE id=$1 FOR UPDATE',[r.id])).rows[0];
        if(!reg || reg.disqualified || reg.status==='removed'){await tx.query('COMMIT');return;}
        const changed=(r.status==='changing' && !reg.partner_warned_at) || r.status==='not_allocated' || (r.status==='allocated' && ['ACTIVE','INACTIVE'].includes(r.brokerStatus) && reg.partner_warned_at);
        if(changed) await tx.query('INSERT INTO partner_screening_changes(registration_id,slot,previous_state,new_status) VALUES($1,$2,$3,$4)',[r.id,slot,JSON.stringify({partner_status:reg.partner_status,partner_warned_at:reg.partner_warned_at,disqualified:reg.disqualified,disqualified_at:reg.disqualified_at,disqualified_source:reg.disqualified_source,disqualified_reason:reg.disqualified_reason}),r.status]);
        let message='';
        if(r.status==='changing' && !reg.partner_warned_at){
          await tx.query("UPDATE trading_registrations SET partner_status='CHANGING',partner_warned_at=NOW() WHERE id=$1",[r.id]);
          message=`A partner change request was detected for ${fresh.title}. Your account must remain under the challenge host’s required partnership. Cancel the request to remain eligible. An approved departure may lead to disqualification. Contact your challenge host for help.`;
        }else if(r.status==='not_allocated'){
          await tx.query("UPDATE trading_registrations SET disqualified=true,disqualified_at=NOW(),disqualified_source='partner_departure',disqualified_reason='Account left the required broker partnership',partner_status='LEFT' WHERE id=$1",[r.id]);
          message=`Your registration for ${fresh.title} has been disqualified because Exness confirmed that your account left the required broker partnership. Contact your challenge host if you believe this is incorrect.`;
        }else if(r.status==='allocated' && ['ACTIVE','INACTIVE'].includes(r.brokerStatus)){
          r.warningCleared=Boolean(reg.partner_warned_at);
          await tx.query('UPDATE trading_registrations SET partner_status=NULL,partner_warned_at=NULL WHERE id=$1',[r.id]);
        }
        if(message){
          // Delay Telegram night notices until 08:00 in the challenge timezone.
          const delayed=slot.endsWith(':night') && (!reg.source || reg.source==='telegram');
          await tx.query(`INSERT INTO partner_notice_outbox(registration_id,challenge_id,kind,message,available_at)
            VALUES($1,$2,$3,$4,CASE WHEN $5 THEN GREATEST(NOW(),(($6::date+1)+time '08:00') AT TIME ZONE $7) ELSE NOW() END)`,
            [r.id,challenge.id,r.status,message,delayed,slot.slice(0,10),fresh.timezone || 'Africa/Addis_Ababa']);
        }
        await tx.query('COMMIT');
      }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
    });
    const results=[...verified,...checked];
    const count=(status:string,type?:string)=>results.filter(r=>r.status===status && (!type || r.accountType===type)).length;
    await tradingChallengeService.saveScreeningResult(challenge.id,slot.slice(0,10),{
      total_screened:results.length,all_good:count('allocated'),changing_real:count('changing','real'),changing_demo:count('changing','demo'),left_real:count('not_allocated','real'),left_demo:count('not_allocated','demo'),warnings_cleared:results.filter(r=>r.warningCleared).length,missed:count('check_failed')+count('no_email'),uids_backfilled:0,
      changingUsers:results.filter(r=>r.status==='changing'),leftUsers:results.filter(r=>r.status==='not_allocated'),clearedUsers:results.filter(r=>r.warningCleared)
    },slot.endsWith(':night')?'night':'day');
    await db.query("UPDATE partner_screening_runs SET state=$4,results=$3,updated_at=NOW() WHERE challenge_id=$1 AND slot=$2",[challenge.id,slot,JSON.stringify(results),results.some((r:any)=>['check_failed','no_email'].includes(r.status))?'partial':'complete']);

  } finally {if(locked)await lease.query('SELECT pg_advisory_unlock(26092710,$1)',[challenge.id]);lease.release();}
}
export async function deliverPartnerNotices(telegram:any):Promise<void>{
  const lease=await db.getClient();let locked=false;
  try{
    locked=(await lease.query('SELECT pg_try_advisory_lock(26092711,0) AS locked')).rows[0].locked;if(!locked)return;
    const rows=(await db.query(`SELECT o.*,r.source,r.user_id,r.email,r.partner_status,r.status AS registration_status,c.host_id,h.has_broker_integration
      FROM partner_notice_outbox o JOIN trading_registrations r ON r.id=o.registration_id JOIN trading_challenges c ON c.id=o.challenge_id LEFT JOIN hosts h ON h.id=c.host_id
      WHERE o.sent_at IS NULL AND o.available_at<=NOW() ORDER BY o.id LIMIT 25`)).rows;
    for(const r of rows){try{
      if(r.registration_status==='removed' || (r.host_id && !r.has_broker_integration) || (r.kind==='changing' && r.partner_status!=='CHANGING')){
        await db.query("UPDATE partner_notice_outbox SET sent_at=NOW(),error='Superseded' WHERE id=$1",[r.id]);continue;
      }
      if(r.source==='winnerpip' || r.source==='csv'){
        if(!r.email || !await emailService.sendGeneric(r.email,'Challenge partnership notice',`<p>${escapeHtml(r.message)}</p>`, `partner-notice-${r.id}`))throw new Error('Email delivery failed');
      }else if(r.source==='discord'){
        await db.query(`INSERT INTO discord_dm_queue(discord_user_id,registration_id,challenge_id,notification_type,message_title,message_body) VALUES($1,$2,$3,'partnership','Challenge partnership notice',$4)`,[String(r.user_id),r.registration_id,r.challenge_id,r.message]);
      }else await telegram.sendMessage(r.user_id,r.message);
      await db.query('UPDATE partner_notice_outbox SET sent_at=NOW(),error=NULL WHERE id=$1',[r.id]);
    }catch(e){await db.query("UPDATE partner_notice_outbox SET attempts=attempts+1,error=$2,available_at=NOW()+INTERVAL '10 minutes' WHERE id=$1",[r.id,(e as Error).message]);}}
  }finally{if(locked)await lease.query('SELECT pg_advisory_unlock(26092711,0)');lease.release();}
}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
