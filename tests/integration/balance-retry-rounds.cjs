const assert=require('node:assert/strict');
const url=process.env.TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Local synthetic database required');
process.env.TZ='UTC';process.env.PGOPTIONS='-c timezone=UTC';process.env.DATABASE_URL=url;process.env.NODE_ENV='test';require('ts-node/register/transpile-only');
const {db}=require('../../src/database/db');
const {vpsService}=require('../../src/services/vpsService');
const {emailService}=require('../../src/services/emailService');
const {runBalanceWarningCheck:run}=require('../../src/services/prestartBalanceChecks');
let calls=0,mail=[],delivery=false,repaired=false;
vpsService.verifyConnection=async(account)=>{calls++;return repaired?{success:true,status:'connected',balance:100}:{success:false,status:account==='990000'?'invalid_credentials':'timeout'};};
emailService.sendGeneric=async(...args)=>{mail.push(args);return delivery;};
(async()=>{
 await require('../../src/database/hardeningMigration').migrateHardening();
 const rules={stop_loss_required:false,weekend_trading:true,only_cent_account:false,allow_professional:false,rules_enabled:Object.fromEntries(['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'].map(k=>[k,false]))};
 const {challenge}=await require('../../src/services/challengeGatekeeper').executeCreate({title:'SYNTHETIC retries '+Date.now(),type:'demo',start_date:new Date(Date.now()+4*3600000).toISOString(),end_date:new Date(Date.now()+86400000).toISOString(),starting_balance:100,target_balance:0,target_enabled:false,rules});
 const id=challenge.id;await require('../../src/services/challengeState').transitionChallenge(id,'registration_open');
 let credentialId;
 for(let i=0;i<21;i++){
  const r=await db.query(`INSERT INTO trading_registrations(challenge_id,user_id,email,nickname,account_number,account_type,connection_verified,connection_verified_at,investor_password,source) VALUES($1,$2,$4,$3,$3,'demo',true,NOW(),'SYNTHETIC','winnerpip') RETURNING id`,[id,-990000-i,String(990000+i),`test${i}@example.invalid`]);
  if(!i)credentialId=r.rows[0].id;
 }
 await run(id,null);assert.equal(calls,21);assert.equal(mail.length,1);
 assert.equal((await db.query('SELECT pull_status FROM trading_registrations WHERE id=$1',[credentialId])).rows[0].pull_status,'password_changed');
 const failures=await require('../../src/services/leaderboardService').leaderboardService.getFailedAccounts(id);
 assert.ok(failures.some(r=>r.id===credentialId||r.registration_id===credentialId));
 await run(id,null);assert.equal(calls,21);assert.equal(mail.length,1);
 for(let i=0;i<2;i++){
  await db.query("UPDATE prestart_balance_rounds SET finished_at=NOW()-INTERVAL '6 minutes' WHERE challenge_id=$1",[id]);
  await db.query("UPDATE prestart_balance_checks SET notice_attempted_at=NOW()-INTERVAL '6 minutes' WHERE challenge_id=$1",[id]);delivery=true;
  await run(id,null);assert.equal(calls,21+(i+1)*20);
 }
 assert.equal(mail.length,2);assert.equal(mail[0][3],mail[1][3]);
 await db.query("UPDATE prestart_balance_rounds SET finished_at=NOW()-INTERVAL '6 minutes' WHERE challenge_id=$1",[id]);
 await run(id,null);assert.equal(calls,61);
 const batches=(await db.query('SELECT * FROM wp_pull_batches WHERE challenge_id=$1',[id])).rows;
 assert.equal(batches.length,1);assert.equal(batches[0].failed,21);
 // A successful user credential update starts targeted recovery immediately.
 repaired=true;
 const {VpsPullScheduler}=require('../../src/scheduler/vpsPullScheduler');
 const scheduler=new VpsPullScheduler({bot:{telegram:{sendMessage:async()=>{throw Error('Unexpected Telegram send');}}}});
 global.__vpsPullScheduler=scheduler;
 await require('../../src/services/credentialRecovery').saveVerifiedCredential(credentialId,id,'REPAIRED','user');
 for(let i=0;i<100;i++){
  const state=(await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[credentialId])).rows[0]?.state;
  if(state==='completed')break;
  await new Promise(r=>setTimeout(r,20));
 }
 assert.equal((await db.query('SELECT state FROM credential_recovery_jobs WHERE registration_id=$1',[credentialId])).rows[0].state,'completed');
 assert.equal(calls,62);
 const r=(await db.query('SELECT pull_status,last_known_balance FROM trading_registrations WHERE id=$1',[credentialId])).rows[0];
 assert.equal(r.pull_status,'success');assert.equal(Number(r.last_known_balance),100);
 await run(id,null);assert.equal(calls,62);
 console.log('PASS: 21 accounts, credential exclusion/list, independent email retries, two whole-batch retry rounds, one history row, immediate credential repair. No external sends.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.close());
