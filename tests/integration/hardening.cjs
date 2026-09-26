// Synthetic database only. Never accept a remote database URL here.
const assert=require('node:assert/strict');
const url=process.env.TEST_DATABASE_URL;
if(!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('TEST_DATABASE_URL must be a local synthetic database');
process.env.DATABASE_URL=url;process.env.NODE_ENV='test';process.env.VPS_VERIFIED_HISTORY='true';
require('ts-node/register/transpile-only');
const {db}=require('../../src/database/db');
const gate=require('../../src/services/challengeGatekeeper');
const {leaderboardService}=require('../../src/services/leaderboardService');
const {transitionChallenge}=require('../../src/services/challengeState');
const {migrateHardening}=require('../../src/database/hardeningMigration');
const keys=['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'];
const rules={stop_loss_required:false,weekend_trading:true,only_cent_account:false,allow_professional:false,rules_enabled:Object.fromEntries(keys.map(k=>[k,false]))};
const fixture={title:'SYNTHETIC hardening '+Date.now(),type:'demo',start_date:'2099-01-01',end_date:'2099-02-01',starting_balance:100,target_balance:0,target_enabled:false,rules};
(async()=>{
 await migrateHardening();
 await require("../../src/database/pullIntegrityMigration").migratePullIntegrity();
 // Failure after challenge insertion rolls back both the challenge and its rules.
 const ruleWriter=require('../../src/services/wpEvaluationEngine').evaluationEngine;
 const saveRules=ruleWriter.saveRules;ruleWriter.saveRules=async()=>{throw new Error('synthetic rule save failure');};
 try{await assert.rejects(()=>gate.executeCreate({...fixture,title:'SYNTHETIC atomic rollback'}),/rule save failure/);}finally{ruleWriter.saveRules=saveRules;}
 assert.equal(Number((await db.query("SELECT count(*) AS n FROM trading_challenges WHERE title='SYNTHETIC atomic rollback'")).rows[0].n),0);
 const token=await gate.queueCreate(fixture);
 const decisions=await Promise.all([gate.decide(token,true),gate.decide(token,true)]);
 assert.equal(decisions.filter(Boolean).length,1,'approval executes once');
 const id=decisions.find(Boolean).result.challenge.id;
 assert.equal(await gate.getPending(token),undefined);
 await transitionChallenge(id,'registration_open');
 const localDays=await db.query("SELECT COUNT(DISTINCT DATE(close_time AT TIME ZONE 'UTC' AT TIME ZONE (SELECT COALESCE(timezone,'Africa/Nairobi') FROM trading_challenges WHERE id=$1))) AS n FROM (VALUES (TIMESTAMP '2026-09-25 20:30:00'),(TIMESTAMP '2026-09-25 21:30:00')) t(close_time)",[id]);
 assert.equal(Number(localDays.rows[0].n),2,'management report groups by configured local day');

 const create=(acct,nick,email,uid)=>db.query(`INSERT INTO trading_registrations(challenge_id,user_id,email,nickname,account_number,account_type,connection_verified,investor_password) VALUES($1,$2,$3,$4,$5,'demo',true,'synthetic') RETURNING id`,[id,uid,email,nick,acct]);
 const attempts=await Promise.allSettled([create('123456','Alpha','a@test.invalid',-1),create('123 456','Beta','b@test.invalid',-2)]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1,'concurrent canonical duplicate rejected');
 const first=attempts.find(x=>x.status==='fulfilled').value.rows[0].id;
 const second=(await create('654321','Gamma','c@test.invalid',-3)).rows[0].id;
 for(const [reg,bal]of [[first,110],[second,120]])await db.query(`INSERT INTO wp_leaderboard_staging(challenge_id,registration_id,account_number,user_id,nickname,account_type,adjusted_balance,normalized_balance,is_qualified) SELECT $1,$2,account_number,user_id,nickname,'demo',$3,$3,true FROM trading_registrations WHERE id=$2`,[id,reg,bal]);
 await leaderboardService.flushStagingToLive(id,first);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM wp_leaderboard WHERE challenge_id=$1',[id])).rows[0].n),1);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM wp_leaderboard_staging WHERE challenge_id=$1',[id])).rows[0].n),1);
 await leaderboardService.flushStagingToLive(id,second);
 await db.query("UPDATE trading_challenges SET deposit_mode='max_limit',target_percent=10 WHERE id=$1",[id]);
 await leaderboardService.updateRankings(id);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM wp_leaderboard WHERE challenge_id=$1 AND rank IS NOT NULL',[id])).rows[0].n),2);

 // Invalid settings must leave the saved challenge untouched.
 const {updateChallengeSettings}=require('../../src/services/challengeSettings');
 await assert.rejects(()=>updateChallengeSettings(id,{title:'should rollback',end_date:'2000-01-01'}));
 assert.equal((await db.query('SELECT title FROM trading_challenges WHERE id=$1',[id])).rows[0].title,fixture.title);
 await assert.rejects(()=>updateChallengeSettings(id,{unrecognized_setting:true}));
 const {evaluationEngine}=require('../../src/services/wpEvaluationEngine');
 await evaluationEngine.saveRules(id,{...rules,max_lot_size:.3},'config_demo');
 await evaluationEngine.saveRules(id,{...rules,max_lot_size:.8},'config_real');
 const switched=await updateChallengeSettings(id,{type:'hybrid',split_category_settings:true,demo_starting_balance:100,demo_target_balance:0,demo_deposit_mode:'fixed',demo_target_enabled:false,demo_allow_below_start:false,real_starting_balance:200,real_target_balance:0,real_deposit_mode:'min_limit',real_target_percent:15,real_target_enabled:false,real_allow_below_start:true});
 assert.equal(switched.real_deposit_mode,'min_limit');
 assert.equal((await evaluationEngine.rulesForAccount(id,'demo')).max_lot_size,.3);
 assert.equal((await evaluationEngine.rulesForAccount(id,'real')).max_lot_size,.8);
 await updateChallengeSettings(id,{type:'demo',split_category_settings:false});
 // Invalid rule writes are rejected without changing the existing configuration.
 await assert.rejects(()=>evaluationEngine.saveRules(id,{...rules,max_lot_size:-1},'config'));
 assert.notEqual(Number((await evaluationEngine.rulesForAccount(id,'demo')).max_lot_size),-1);
 // Removed identities can register again while their raw financial history is retained.
 const archived=(await create('777001','Archive','archive@test.invalid',-77)).rows[0].id;
 await db.query("INSERT INTO wp_balance_ops(challenge_id,registration_id,account_number,deal_ticket,op_time,amount,op_type) VALUES($1,$2,'777001',777001,NOW(),100,'deposit')",[id,archived]);
 await assert.rejects(()=>db.query("UPDATE trading_registrations SET account_number='777002' WHERE id=$1",[archived]),/history/);
 const {tradingChallengeService}=require('../../src/services/tradingChallengeService');
 await tradingChallengeService.deleteRegistration(archived);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM wp_balance_ops WHERE registration_id=$1',[archived])).rows[0].n),1);
 await create('777001','Archive','archive@test.invalid',-77);
 await transitionChallenge(id,'active');
 await assert.rejects(()=>transitionChallenge(id,'registration_open'));

 // Durable lifecycle transition is recorded once; repeat deliveries do not resend acknowledged recipients.
 assert.equal(await transitionChallenge(id,'active'),false);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM challenge_lifecycle_events WHERE challenge_id=$1',[id])).rows[0].n),1);
 delete process.env.RESEND_API_KEY;
 const {deliverLifecycleEvents}=require('../../src/services/challengeLifecycle');let deliveries=0;
 const telegram={sendMessage:async()=>{deliveries++;return {message_id:deliveries};}};
 await deliverLifecycleEvents(telegram);const delivered=deliveries;await deliverLifecycleEvents(telegram);assert.equal(deliveries,delivered);
 // A partial pull publishes only the successful registration, leaving another operation's staging untouched.
 const {VpsPullScheduler}=require('../../src/scheduler/vpsPullScheduler');
 const scheduler=new VpsPullScheduler({bot:{telegram}});
 require("axios").get=async()=>({data:{terminals:2,healthy_terminals:[1,2]}});
 for(const method of ['setRouterChallengePullState','clearRouterCredentialCache','inlineReconcile','resolveNullOpenTimes','reconcileUnexplainedBalances','delay','updateOhlcCandles','postEvalSlRetry','savePullTerminalStats','bulkUpdatePullStatus','reportCandleFailures','drainQueue'])scheduler[method]=async()=>{};
 const accounts=[first,second].map(registrationId=>({registrationId,accountNumber:String(registrationId),userId:registrationId}));
 scheduler.getAccountsToPull=async()=>accounts;
 scheduler.runSharedQueueWorkers=async()=>[{...accounts[0],success:true,tradesCount:1},{...accounts[1],success:false,errorCode:'timeout'}];
 const stage=async(reg,bal)=>db.query(`INSERT INTO wp_leaderboard_staging(challenge_id,registration_id,account_number,user_id,nickname,account_type,adjusted_balance,normalized_balance,is_qualified) SELECT $1,$2,account_number,user_id,nickname,'demo',$3,$3,true FROM trading_registrations WHERE id=$2 ON CONFLICT(challenge_id,registration_id) DO UPDATE SET adjusted_balance=$3,normalized_balance=$3`,[id,reg,bal]);
 await stage(second,999);
 scheduler.evaluateAllAccounts=async(_id,selected)=>{assert.deepEqual(selected.map(a=>a.registrationId),[first]);await stage(first,130);return selected;};
 await scheduler.runPullCycleForChallenge(id);
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard WHERE registration_id=$1',[first])).rows[0].adjusted_balance),130);
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard WHERE registration_id=$1',[second])).rows[0].adjusted_balance),120);
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard_staging WHERE registration_id=$1',[second])).rows[0].adjusted_balance),999);
 const worker=scheduler.runSharedQueueWorkers;
 scheduler.runSharedQueueWorkers=async()=>{scheduler.cancelRequested=true;return [];};
 await assert.rejects(()=>scheduler.runPullCycleForChallenge(id),{code:'PULL_CANCELLED'});
 scheduler.runSharedQueueWorkers=worker;
 const terminals=scheduler.terminals;require('axios').get=async()=>({data:{terminals:2,healthy_terminals:[]}});
 await assert.rejects(()=>scheduler.runPullCycleForChallenge(id),/No VPS terminals/);
 scheduler.terminals=terminals;require('axios').get=async()=>({data:{terminals:2,healthy_terminals:[1,2]}});
 scheduler.evaluateAllAccounts=async()=>{await stage(first,777);throw new Error('synthetic evaluation failure');};
 await assert.rejects(()=>scheduler.runPullCycleForChallenge(id),/synthetic evaluation failure/);
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard WHERE registration_id=$1',[first])).rows[0].adjusted_balance),130);
 // Raw balance ingestion never changes live withdrawal state.
 await scheduler.storeBalanceOps(id,first,String(first),[{ticket:123,time:'2099-01-02',amount:-20,op_type:'withdrawal'}],0);
 assert.equal(Number((await db.query('SELECT total_withdrawn FROM wp_leaderboard WHERE registration_id=$1',[first])).rows[0].total_withdrawn),0);
 // A verified password and its durable recovery request are committed together.
 const {saveVerifiedCredential}=require('../../src/services/credentialRecovery');
 await saveVerifiedCredential(first,id,'synthetic-replacement','user');
 assert.equal((await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[first])).rows[0].state,'pending');
 await assert.rejects(()=>saveVerifiedCredential(archived,id,'must-not-save','user'),/removed/);
 // Recovery persists while a full worker owns the lease, then resumes and publishes only its account.
 scheduler.notifyAccountRecovered=async()=>{};
 scheduler.retrySingleAccount=async(_reg,_id,_override,evaluate)=>{if(evaluate)await stage(first,140);return {success:true,evaluated:evaluate};};
 const held=await db.getClient();await held.query('SELECT pg_advisory_lock(26092604,0)');
 assert.equal(await scheduler.recoverAccountAfterCredentialFix(first,id),null);
 assert.equal((await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[first])).rows[0].state,'pending');
 await held.query('SELECT pg_advisory_unlock(26092604,0)');held.release();
 await scheduler.processCredentialRecovery(first);
 assert.equal((await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[first])).rows[0].state,'completed');
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard WHERE registration_id=$1',[first])).rows[0].adjusted_balance),140);
 await db.query('UPDATE trading_challenges SET leaderboard_locked_at=NOW() WHERE id=$1',[id]);
 await scheduler.recoverAccountAfterCredentialFix(first,id);
 assert.equal((await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[first])).rows[0].state,'awaiting_admin');
 assert.equal(Number((await db.query('SELECT adjusted_balance FROM wp_leaderboard WHERE registration_id=$1',[first])).rows[0].adjusted_balance),140);

 await assert.rejects(()=>leaderboardService.flushStagingToLive(id,first),/locked/);
 await leaderboardService.updateRankings(id,false,true);
 assert.equal(Number((await db.query('SELECT count(*) AS n FROM challenge_result_snapshots WHERE challenge_id=$1',[id])).rows[0].n),1);
 // A manual DQ arriving after the automatic-recovery read must not be cleared.
 const manualRules={...rules,min_active_days:1,rules_enabled:{...rules.rules_enabled,min_active_days:true}};
 await db.query("UPDATE wp_challenge_rules SET parameters=$2 WHERE challenge_id=$1 AND rule_code='config'",[id,JSON.stringify(manualRules)]);
 await db.query("UPDATE trading_registrations SET disqualified=true,disqualified_source='min_active_days',disqualified_reason='automatic' WHERE id=$1",[first]);
 const originalQuery=db.query.bind(db);let raced=false;
 const notifyDq=evaluationEngine.notifyDqByEmail;evaluationEngine.notifyDqByEmail=async()=>{};
 db.query=async(sql,args)=>{
   const result=await originalQuery(sql,args);
   if(!raced && sql.includes('SELECT disqualified, disqualified_reason, disqualified_source') && args?.[0]===first){
     raced=true;await originalQuery("UPDATE trading_registrations SET disqualified=true,disqualified_source='manual',disqualified_reason='manual decision wins' WHERE id=$1",[first]);
   }
   return result;
 };
 try{await evaluationEngine.evaluateSingleAccount(id,first,true);}finally{db.query=originalQuery;evaluationEngine.notifyDqByEmail=notifyDq;}
 assert(raced);const manual=(await db.query('SELECT disqualified,disqualified_source FROM trading_registrations WHERE id=$1',[first])).rows[0];
 assert.equal(manual.disqualified,true);assert.equal(manual.disqualified_source,'manual');
 // A successful password repair arriving after the expiry scan wins over auto-DQ.
 await db.query("UPDATE trading_registrations SET disqualified=false,disqualified_source=NULL,pull_status='password_changed',credential_failure_detected_at=NOW()-INTERVAL '25 hours' WHERE id=$1",[second]);
 const activeChallenges=tradingChallengeService.getActiveChallenges;
 tradingChallengeService.getActiveChallenges=async()=>[{id,status:'active',title:'Synthetic grace race'}];
 let passwordRace=false;const deliveredBeforeGrace=deliveries;
 db.query=async(sql,args)=>{const result=await originalQuery(sql,args);
   if(!passwordRace && sql.includes('AND credential_failure_detected_at <')){
     passwordRace=true;await originalQuery("UPDATE trading_registrations SET pull_status='success',credential_failure_detected_at=NULL WHERE id=$1",[second]);
   }return result;
 };
 try{await scheduler.checkDisqualifications();}finally{db.query=originalQuery;tradingChallengeService.getActiveChallenges=activeChallenges;}
 assert(passwordRace);assert.equal((await db.query('SELECT disqualified FROM trading_registrations WHERE id=$1',[second])).rows[0].disqualified,false);
 assert.equal(deliveries,deliveredBeforeGrace,'no incorrect credential DQ notification');

 await db.query("UPDATE trading_challenges SET status='completed',leaderboard_locked_at=NULL WHERE id=$1",[id]);
 await assert.rejects(()=>evaluationEngine.evaluateSingleAccount(id,first),/locked/);
 await assert.rejects(()=>leaderboardService.flushStagingToLive(id,first),/locked/);
 console.log('PASS: failure-isolated publication, deferred durable recovery, locked recovery, independent settings, repeat-safe lifecycle delivery; durable one-time approval, concurrent duplicates, scoped publication, real growth SQL, transitions, final lock and explicit override');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.close());
