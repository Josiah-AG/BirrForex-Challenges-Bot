import crypto from 'crypto';
import { db } from '../database/db';
import { vpsService } from './vpsService';
import { evaluationEngine } from './wpEvaluationEngine';
import { emailService } from './emailService';
import { resolveCategoryBalances } from '../utils/categorySettings';
import { accountUnitMultiplier } from '../utils/accountUnits';
import { balanceCheckTimes, startingBalanceProblem } from '../utils/startingBalancePolicy';
import { getLocalTime } from '../utils/timezone';
const running=new Set<number>();
function limiter(limit:number) {
  let active=0;const waiting:Array<()=>void>=[];
  return async()=>{
    await new Promise<void>(resolve=>{const start=()=>{active++;resolve();};if(active<limit)start();else waiting.push(start);});
    return ()=>{active--;waiting.shift()?.();};
  };
}
const claimChallenge=limiter(2);
const claimVerification=limiter(3);

const esc=(v:any)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function balanceNotice(challenge:any,reg:any,balance:number,limit:number,finalAt:Date,isFinal:boolean,mode:string):string {
  const tz=challenge.timezone || 'Africa/Addis_Ababa';
  const deadline=new Intl.DateTimeFormat('en-GB',{timeZone:tz,dateStyle:'medium',timeStyle:'short'}).format(finalAt);
  const unit=reg.is_cent?'USC':'USD';
  const action=reg.account_type==='demo'?'Reset your demo account balance':'Adjust your account balance';
  const requirement=mode==='min_limit'?`at least ${unit} ${limit.toFixed(2)}`:mode==='max_limit'?`no more than the permitted maximum (target ${unit} ${limit.toFixed(2)})`:`${unit} ${limit.toFixed(2)}`;
  return `<b>${isFinal?'Final balance notice':'Balance warning'} — ${esc(challenge.title)}</b>\n\nAccount: ${esc(reg.account_number)}\nCurrent balance: ${unit} ${balance.toFixed(2)}\nRequired balance: ${requirement}\n\n${action} to ${requirement} before <b>${esc(deadline)} (${esc(tz)})</b>. ${mode!=='min_limit'?'A balance above the permitted starting amount at the final check will lead to disqualification.':''}`;
}
/** Shared daily, final-reminder and manual checks. VPS failures never imply a changed password. */
export async function runBalanceWarningCheck(challengeId:number,telegram:any,manual=false, registrationId?:number):Promise<any> {
  if(running.has(challengeId))return {running:true};
  running.add(challengeId);
  const releaseChallenge=await claimChallenge();
  let client:any,locked=false;
  const totals={checked:0,warned:0,failed:0,sent:0,credentialFailed:0};
  try {
    client=await db.getClient();
    locked=(await client.query('SELECT pg_try_advisory_lock(26092803,$1) AS locked',[challengeId])).rows[0].locked;
    if(!locked)return {running:true};
    // Keep the database clock and timestamp convention used by the history table.
    const startedAt=(await db.query('SELECT clock_timestamp()::timestamp::text AS started_at')).rows[0].started_at;
    let challenge=(await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId])).rows[0];
    if(!challenge || challenge.status!=='registration_open' || challenge.pre_start_check_started_at)return totals;
    await deliverCredentialNotices(challenge,telegram);
    const count=Number((await db.query('SELECT COUNT(*) AS cnt FROM trading_registrations WHERE challenge_id=$1 AND investor_password IS NOT NULL AND connection_verified=true',[challengeId])).rows[0].cnt);
    let times=balanceCheckTimes(challenge.start_date,count,challenge.pre_start_lead_hours);
    if(Date.now()>=times.finalAt.getTime())return totals;
    const isFinal=Date.now()>=times.warningAt.getTime();
    if(isFinal && !challenge.pre_start_lead_hours){
      challenge=await db.transaction(async()=>{
        const fresh=(await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[challengeId])).rows[0];
        if(!fresh || fresh.status!=='registration_open' || fresh.pre_start_check_started_at || +new Date(fresh.start_date)!==+new Date(challenge.start_date))return null;
        await db.query('UPDATE trading_challenges SET pre_start_lead_hours=COALESCE(pre_start_lead_hours,$2) WHERE id=$1',[challengeId,times.lead]);
        return {...fresh,pre_start_lead_hours:fresh.pre_start_lead_hours || times.lead};
      });
      if(!challenge)return totals;
      times=balanceCheckTimes(challenge.start_date,count,challenge.pre_start_lead_hours);
    }
    const local=getLocalTime(new Date(),challenge.timezone || 'Africa/Addis_Ababa');
    const dailyWindow=local.timeStr.startsWith('02:0');
    const allowNew=manual || !!registrationId || isFinal || dailyWindow;
    const scheduleKey=new Date(challenge.start_date).toISOString();
    let slot=`${scheduleKey}:${times.lead}:${isFinal?'final':'daily:'+local.dateStr}`;
    if(registrationId){
      const verified=(await db.query('SELECT connection_verified_at FROM trading_registrations WHERE id=$1 AND challenge_id=$2',[registrationId,challengeId])).rows[0];
      if(!verified?.connection_verified_at)return totals;
      slot+=`:repair:${registrationId}:${new Date(verified.connection_verified_at).toISOString()}`;
    }
    await db.query('INSERT INTO prestart_balance_rounds(challenge_id,slot) VALUES($1,$2) ON CONFLICT DO NOTHING',[challengeId,slot]);
    const round=(await db.query('SELECT * FROM prestart_balance_rounds WHERE challenge_id=$1 AND slot=$2',[challengeId,slot])).rows[0];
    // The challenge lock serializes whole rounds, including after a process restart.
    // An interrupted round consumes an attempt and waits five minutes on restart.
    if(!manual && (round.attempts>=3 || (round.finished_at && Date.now()-+new Date(round.finished_at)<300000)))return {...totals,exhausted:round.attempts>=3};
    if(allowNew && (round.attempts===0 || manual))await db.query(`INSERT INTO prestart_balance_checks(challenge_id,registration_id,slot)
      SELECT challenge_id,id,$2 FROM trading_registrations WHERE challenge_id=$1 AND disqualified=false AND investor_password IS NOT NULL AND connection_verified=true AND status IS DISTINCT FROM 'removed'
      AND COALESCE(pull_status,'') NOT IN ('password_changed','invalid_credentials')
      AND ($3::integer IS NULL OR id=$3) ON CONFLICT DO NOTHING`,[challengeId,slot,registrationId || null]);
    if(manual)await db.query('UPDATE prestart_balance_rounds SET attempts=0 WHERE challenge_id=$1 AND slot=$2',[challengeId,slot]);
    if(manual)await db.query('UPDATE prestart_balance_checks SET checked_at=NULL,attempted_at=NULL,error=NULL WHERE challenge_id=$1 AND slot=$2',[challengeId,slot]);
    const regs=(await db.query(`SELECT r.id,r.account_number,r.mt5_server,r.investor_password,r.user_id,r.nickname,r.is_cent,r.source,r.account_type,r.lang,r.email,r.pull_status,r.connection_verified_at
      FROM trading_registrations r JOIN prestart_balance_checks b ON b.registration_id=r.id AND b.slot=$2
      WHERE r.challenge_id=$1 AND r.disqualified=false AND r.investor_password IS NOT NULL AND r.connection_verified=true
      AND b.credential_error=false AND COALESCE(r.pull_status,'') NOT IN ('password_changed','invalid_credentials')
      AND r.status IS DISTINCT FROM 'removed'
      AND (b.checked_at IS NULL OR (b.problem IS NOT NULL AND b.notified_at IS NULL))
`,[challengeId,slot])).rows;
    if(!regs.length)return {...totals,completed:true};
    await db.query('UPDATE prestart_balance_rounds SET attempts=attempts+1,finished_at=NOW() WHERE challenge_id=$1 AND slot=$2',[challengeId,slot]);
    let cursor=0;
    const work=async()=>{
      while(cursor<regs.length){
        const reg=regs[cursor++];
        if(Date.now()>=times.finalAt.getTime())return;
        const check=(await db.query('SELECT * FROM prestart_balance_checks WHERE registration_id=$1 AND slot=$2',[reg.id,slot])).rows[0];
        if(!check || (check.checked_at && (!check.problem || check.notified_at)))continue;

        await db.query('UPDATE prestart_balance_checks SET attempted_at=NOW() WHERE registration_id=$1 AND slot=$2',[reg.id,slot]);
        try {
          // Adopt outstanding errors recorded by the old unbounded retry loop without another login.
          if(check.error?.includes('Verification unavailable (invalid_credentials)') && (!reg.connection_verified_at || +new Date(check.attempted_at)>=+new Date(reg.connection_verified_at))){
            await recordCredentialFailure(challengeId,reg,slot);totals.failed++;totals.credentialFailed++;continue;
          }
          const settings=resolveCategoryBalances(challenge,reg.account_type);
          const rules=await evaluationEngine.rulesForAccount(challengeId,reg.account_type);
          const limit=settings.startingBalance*accountUnitMultiplier(challenge,rules,reg.is_cent);
          let balance=Number(check.balance),problem=check.problem;
          if(!check.checked_at || check.error){
            const releaseVerification=await claimVerification();
            let result;
            try {
              if(Date.now()>=times.finalAt.getTime())throw new Error('Final verification window reached');
              result=await vpsService.verifyConnection(reg.account_number,reg.mt5_server,reg.investor_password);
            } finally {releaseVerification();}

            if(result.status==='invalid_credentials'){
              await recordCredentialFailure(challengeId,reg,slot);totals.failed++;totals.credentialFailed++;continue;
            }
            if(!result.success || result.status!=='connected' || !Number.isFinite(result.balance))throw new Error(`Verification unavailable (${result.status}); retry pending`);
            balance=Number(result.balance);
            problem=startingBalanceProblem(balance,limit,settings.depositMode,challenge.starting_balance_policy);
            if(problem==='invalid')throw new Error('Invalid broker balance; retry pending');
          }
          // Approval and final verification share this lock: stale checks cannot update account state.
          const applicable=await db.transaction(async()=>{
            const fresh=(await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[challengeId])).rows[0];
            if(!fresh || fresh.status!=='registration_open' || fresh.pre_start_check_started_at || +new Date(fresh.start_date)!==+new Date(challenge.start_date) || Date.now()>=times.finalAt.getTime() || JSON.stringify(resolveCategoryBalances(fresh,reg.account_type))!==JSON.stringify(settings))return false;
            const saved=await db.query('UPDATE trading_registrations SET last_known_balance=$2,balance_warning=$3 WHERE id=$1 AND disqualified=false AND investor_password=$4 RETURNING id',[reg.id,balance,!!problem,reg.investor_password]);
            if(!saved.rows.length)return false;
            await db.query('UPDATE prestart_balance_checks SET checked_at=COALESCE(checked_at,NOW()),balance=$3,problem=$4,error=NULL WHERE registration_id=$1 AND slot=$2',[reg.id,slot,balance,problem]);
            return true;
          });
          if(!applicable)continue;
          totals.checked++;
          if(!problem)continue;
          totals.warned++;
          if(check.notified_at)continue;
          const message=balanceNotice(challenge,reg,balance,limit,times.finalAt,isFinal,settings.depositMode);
          let sent=false;
          const key=crypto.createHash('sha256').update(`${reg.id}:${slot}`).digest('hex');
          if((challenge.host_id || reg.source==='winnerpip' || reg.source==='csv' || !reg.user_id || reg.source==='discord') && reg.email){
            sent=await emailService.sendGeneric(reg.email,`${isFinal?'Final balance notice':'Balance warning'} — ${challenge.title}`,message.replace(/\n/g,'<br>'),`balance-${key}`);
          }else if(reg.user_id>0 && reg.source!=='discord' && telegram){
            await telegram.sendMessage(reg.user_id,message,{parse_mode:'HTML'});sent=true;
          }
          if(!sent)throw new Error('Notice delivery pending');
          await db.query('UPDATE prestart_balance_checks SET notified_at=NOW(),error=NULL WHERE registration_id=$1 AND slot=$2',[reg.id,slot]);
          totals.sent++;
        }catch(error){
          totals.failed++;
          await db.query('UPDATE prestart_balance_checks SET error=$3 WHERE registration_id=$1 AND slot=$2',[reg.id,slot,(error as Error).message.slice(0,400)]);
        }
      }
    };
    // Bounded concurrency leaves terminals available for registration and other consumers.
    const workers=await Promise.allSettled([work(),work(),work()]);
    const rejected=workers.find(r=>r.status==='rejected');
    if(rejected?.status==='rejected')throw rejected.reason;
    // One history row per daily/final/repair check; retries update its aggregate outcome.
    const summary=(await db.query(`SELECT COUNT(*)::int total,
      COUNT(*) FILTER(WHERE checked_at IS NOT NULL)::int successful,
      COUNT(*) FILTER(WHERE checked_at IS NULL)::int failed,
      COUNT(*) FILTER(WHERE problem IS NOT NULL)::int warned FROM prestart_balance_checks WHERE challenge_id=$1 AND slot=$2`,[challengeId,slot])).rows[0];
    await db.transaction(async()=>{
    if(round.batch_id){
      await db.query(`UPDATE wp_pull_batches SET total_accounts=$2,successful=$3,failed=$4,new_trades_found=$5,completed_at=clock_timestamp() WHERE id=$1`,[round.batch_id,summary.total,summary.successful,summary.failed,summary.warned]);
    }else{
      const batch=(await db.query(`INSERT INTO wp_pull_batches(challenge_id,total_accounts,successful,failed,new_trades_found,status,error_log,started_at,completed_at)
        VALUES($1,$2,$3,$4,$5,'completed',$6,$7::timestamp,clock_timestamp()) RETURNING id`,[challengeId,summary.total,summary.successful,summary.failed,summary.warned,isFinal?'final_balance_warning':'balance_check',startedAt])).rows[0];
      await db.query('UPDATE prestart_balance_rounds SET batch_id=$3 WHERE challenge_id=$1 AND slot=$2',[challengeId,slot,batch.id]);
    }
    });
    await deliverCredentialNotices(challenge,telegram);
    await db.query('UPDATE prestart_balance_rounds SET finished_at=clock_timestamp() WHERE challenge_id=$1 AND slot=$2',[challengeId,slot]);
    return {...totals,running:false};
  }finally{
    try { if(locked)await client.query('SELECT pg_advisory_unlock(26092803,$1)',[challengeId]); }
    finally {client?.release();running.delete(challengeId);releaseChallenge();}
  }
}

/** Credential failure is a separate, durable state, never a five-minute broker retry. */
async function recordCredentialFailure(challengeId:number,reg:any,slot:string) {
  await db.transaction(async()=>{
    const saved=await db.query(`UPDATE trading_registrations SET pull_status='password_changed',
      pull_error='Broker rejected account credentials. Update your investor password or account details.',
      credential_failure_detected_at=COALESCE(credential_failure_detected_at,NOW())
      WHERE id=$1 AND challenge_id=$2 AND investor_password=$3 AND disqualified=false RETURNING id`,[reg.id,challengeId,reg.investor_password]);
    if(!saved.rows.length)return;
    await db.query(`UPDATE prestart_balance_checks SET credential_error=true,error='Credential failure: waiting for account update'
      WHERE registration_id=$1 AND slot=$2`,[reg.id,slot]);
  });
}

async function deliverCredentialNotices(challenge:any,telegram:any) {
  const rows=(await db.query(`SELECT b.registration_id,b.slot,r.email,r.nickname,r.account_number,r.account_type,r.user_id,r.source
    FROM prestart_balance_checks b JOIN trading_registrations r ON r.id=b.registration_id
    WHERE b.challenge_id=$1 AND b.credential_error=true AND b.credential_notified_at IS NULL
    AND r.pull_status IN ('password_changed','invalid_credentials') AND r.disqualified=false
    AND r.status IS DISTINCT FROM 'removed'
    AND (b.notice_attempted_at IS NULL OR b.notice_attempted_at<NOW()-INTERVAL '5 minutes')`,[challenge.id])).rows;
  for(const row of rows){
    await db.query('UPDATE prestart_balance_checks SET notice_attempted_at=NOW() WHERE registration_id=$1 AND slot=$2',[row.registration_id,row.slot]);
    const message=`<b>Account access issue — ${esc(challenge.title)}</b>\n\nWe could not sign in to your MT5 account ${esc(row.account_number)}. Please sign in to your challenge dashboard and update your investor password or correct your account details. ${row.account_type==='demo'?'If your demo account was deleted, use Update account number before the challenge starts. ':''}We will recheck your account after you update it. Please fix this before the challenge starts.\n\nhttps://winnerpip.com/challenge/${challenge.id}`;
    const key='balance-credentials-'+crypto.createHash('sha256').update(`${row.registration_id}:${row.slot}`).digest('hex');
    try{
      let sent=false;
      if((challenge.host_id || row.source==='winnerpip' || row.source==='csv') && row.email){
        sent=await emailService.sendGeneric(row.email,`Action required — Account access issue — ${challenge.title}`,message.replace(/\n/g,'<br>'),key);
      }else if(row.source==='discord'){
        await db.transaction(async()=>{
          await db.query(`INSERT INTO discord_dm_queue(discord_user_id,registration_id,challenge_id,notification_type,message_title,message_body)
            VALUES($1,$2,$3,'password_changed','Account access issue',$4)`,[String(row.user_id),row.registration_id,challenge.id,message.replace(/<[^>]*>/g,'')]);
          await db.query('UPDATE prestart_balance_checks SET credential_notified_at=NOW() WHERE registration_id=$1 AND slot=$2',[row.registration_id,row.slot]);
        });continue;
      }else if(row.user_id>0 && telegram){await telegram.sendMessage(row.user_id,message,{parse_mode:'HTML'});sent=true;}
      if(sent)await db.query('UPDATE prestart_balance_checks SET credential_notified_at=NOW() WHERE registration_id=$1 AND slot=$2',[row.registration_id,row.slot]);
      else console.error('Balance credential notice delivery pending',row.registration_id);
    }catch(error){console.error('Balance credential notice delivery pending',row.registration_id,(error as Error).message);}
  }
}
