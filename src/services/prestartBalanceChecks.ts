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
  return `<b>${isFinal?'Final balance notice':'Balance warning'} — ${esc(challenge.title)}</b>\n\nAccount: ${esc(reg.account_number)}\nCurrent balance: ${unit} ${balance.toFixed(2)}\nRequired balance: ${requirement}\n\n${action} before <b>${esc(deadline)} (${esc(tz)})</b>, when final verification begins. ${mode!=='min_limit'?'Only the decimal portion above the required amount is allowed; a whole-unit excess is not accepted. ':''}Keep your balance within the requirement until the challenge starts. A lower balance triggers a reminder only and will not disqualify you. An excess above the permitted maximum at final verification will disqualify you.`;
}
/** Shared daily, final-reminder and manual checks. VPS failures never imply a changed password. */
export async function runBalanceWarningCheck(challengeId:number,telegram:any,manual=false):Promise<any> {
  if(running.has(challengeId))return {running:true};
  running.add(challengeId);
  const releaseChallenge=await claimChallenge();
  let client:any,locked=false;
  const totals={checked:0,warned:0,failed:0,sent:0};
  try {
    client=await db.getClient();
    locked=(await client.query('SELECT pg_try_advisory_lock(26092803,$1) AS locked',[challengeId])).rows[0].locked;
    if(!locked)return {running:true};
    let challenge=(await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId])).rows[0];
    if(!challenge || challenge.status!=='registration_open' || challenge.pre_start_check_started_at)return totals;
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
    const allowNew=manual || isFinal || dailyWindow;
    const scheduleKey=new Date(challenge.start_date).toISOString();
    const slot=`${scheduleKey}:${times.lead}:${isFinal?'final':'daily:'+local.dateStr}`;
    if(allowNew)await db.query(`INSERT INTO prestart_balance_checks(challenge_id,registration_id,slot)
      SELECT challenge_id,id,$2 FROM trading_registrations WHERE challenge_id=$1 AND disqualified=false AND investor_password IS NOT NULL AND connection_verified=true ON CONFLICT DO NOTHING`,[challengeId,slot]);
    if(manual)await db.query('UPDATE prestart_balance_checks SET checked_at=NULL,attempted_at=NULL,error=NULL WHERE challenge_id=$1 AND slot=$2',[challengeId,slot]);
    const regs=(await db.query(`SELECT r.id,r.account_number,r.mt5_server,r.investor_password,r.user_id,r.nickname,r.is_cent,r.source,r.account_type,r.lang,r.email
      FROM trading_registrations r JOIN prestart_balance_checks b ON b.registration_id=r.id AND b.slot=$2
      WHERE r.challenge_id=$1 AND r.disqualified=false AND r.investor_password IS NOT NULL AND r.connection_verified=true
      AND (b.checked_at IS NULL OR (b.problem IS NOT NULL AND b.notified_at IS NULL))
      AND (b.attempted_at IS NULL OR b.attempted_at<NOW()-INTERVAL '5 minutes')`,[challengeId,slot])).rows;
    let cursor=0;
    const work=async()=>{
      while(cursor<regs.length){
        const reg=regs[cursor++];
        if(Date.now()>=times.finalAt.getTime())return;
        const check=(await db.query('SELECT * FROM prestart_balance_checks WHERE registration_id=$1 AND slot=$2',[reg.id,slot])).rows[0];
        if(!check || (check.checked_at && (!check.problem || check.notified_at)))continue;
        if(check.attempted_at && Date.now()-+new Date(check.attempted_at)<300000)continue;
        await db.query('UPDATE prestart_balance_checks SET attempted_at=NOW() WHERE registration_id=$1 AND slot=$2',[reg.id,slot]);
        try {
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

            if(!result.success || result.status!=='connected' || !Number.isFinite(result.balance))throw new Error(`Verification unavailable (${result.status}); retry pending`);
            balance=Number(result.balance);
            problem=startingBalanceProblem(balance,limit,settings.depositMode,challenge.starting_balance_policy);
            if(problem==='invalid')throw new Error('Invalid broker balance; retry pending');
          }
          // Approval and final verification share this lock: stale checks cannot update account state.
          const applicable=await db.transaction(async()=>{
            const fresh=(await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[challengeId])).rows[0];
            if(!fresh || fresh.status!=='registration_open' || fresh.pre_start_check_started_at || +new Date(fresh.start_date)!==+new Date(challenge.start_date) || Date.now()>=times.finalAt.getTime() || JSON.stringify(resolveCategoryBalances(fresh,reg.account_type))!==JSON.stringify(settings))return false;
            await db.query('UPDATE trading_registrations SET last_known_balance=$2,balance_warning=$3 WHERE id=$1 AND disqualified=false',[reg.id,balance,!!problem]);
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
    if(totals.checked || totals.failed){
      await db.query(`INSERT INTO wp_pull_batches(challenge_id,total_accounts,successful,failed,new_trades_found,status,error_log,completed_at)
        VALUES($1,$2,$3,$4,$5,'completed',$6,NOW())`,[challengeId,totals.checked+totals.failed,totals.checked,totals.failed,totals.warned,isFinal?'final_balance_warning':'balance_check']);
    }
    return {...totals,running:false};
  }finally{
    try { if(locked)await client.query('SELECT pg_advisory_unlock(26092803,$1)',[challengeId]); }
    finally {client?.release();running.delete(challengeId);releaseChallenge();}
  }
}
