// Real PostgreSQL transactions with synthetic accounts and a mocked broker response.
const assert=require('node:assert/strict');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local synthetic database required');
process.env.DATABASE_URL=url;process.env.NODE_ENV='test';process.env.VPS_VERIFIED_HISTORY='true';
require('ts-node/register/transpile-only');
const {db}=require('../../src/database/db'),{migratePullIntegrity}=require('../../src/database/pullIntegrityMigration');
const {VpsPullScheduler}=require('../../src/scheduler/vpsPullScheduler');
const {leaderboardService}=require('../../src/services/leaderboardService');
const {checkpointPullJournal}=require('../../src/services/pullRollbackJournal');
const {rollback}=require('../../scripts/rollback-pull-history.cjs');
const axios=require('axios');
(async()=>{try{
 await migratePullIntegrity();await migratePullIntegrity();
 const challenge=(await db.query("INSERT INTO trading_challenges(title,type,status,start_date,end_date,starting_balance,target_balance) VALUES('SYNTHETIC pull history','demo','registration_open','2099-01-01','2099-12-31',100,200) RETURNING *")).rows[0];
 const reg=(await db.query("INSERT INTO trading_registrations(challenge_id,user_id,email,account_number,account_type,connection_verified,registered_at,registration_balance) VALUES($1,-987654,'pull@test.invalid','987654','demo',true,'2025-12-31',100) RETURNING id",[challenge.id])).rows[0].id;
 await db.query("UPDATE trading_challenges SET status='active',start_date='2026-01-01',end_date='2026-12-31' WHERE id=$1",[challenge.id]);challenge.status='active';challenge.start_date='2026-01-01';
 const account={registrationId:reg,accountNumber:'987654',server:'Broker',investorPassword:'synthetic',userId:-987654,username:null,isPriority:false,lastPullAt:null};
 const scheduler=new VpsPullScheduler({});
 const cutoff='2026-09-25T12:00:00Z';
 const data={terminal_used:1,success:true,protocol_version:2,complete:true,account:'987654',server:'Broker',balance:110,equity:110,ledger_expected:110,ledger_tolerance:.01,source_cutoff:cutoff,history_digest:'a'.repeat(64),history_count:3,
 trades:[{ticket:2,position_id:77,symbol:'EURUSD',type:'Buy',volume:1,open_time:'2026-09-25T10:00:00Z',close_time:'2026-09-25T11:00:00Z',open_price:1,close_price:1.1,profit:10,commission:0,swap:0}],
 deals:[{ticket:2,position_id:77,type:1,entry:1,time:'2026-09-25T11:00:00Z',time_msc:1790334000000,symbol:'EURUSD',volume:1,price:1.1,profit:10,commission:0,swap:0,fee:0}],
 balance_ops:[{ticket:99,time:'2020-01-01T00:00:00Z',amount:-100,op_type:'withdrawal'}],closing_tickets:[2]};
 axios.post=async(_,req)=>({data:{...structuredClone(data),request_id:req.request_id}});
 const result=await scheduler.pullVerifiedAccount(account,1,challenge);assert.equal(result.success,true,result.errorMessage);
 assert.equal((await db.query('SELECT * FROM wp_trades WHERE registration_id=$1',[reg])).rows.length,1);
 assert.equal((await db.query('SELECT * FROM wp_visible_trades WHERE registration_id=$1',[reg])).rows.length,0,'unpublished raw import stays invisible');
 assert.equal((await db.query('SELECT * FROM wp_balance_ops WHERE registration_id=$1',[reg])).rows.length,0,'old withdrawal is outside challenge');
 await scheduler.bulkUpdatePullStatus([result]);
 assert.equal((await db.query('SELECT last_pull_at FROM trading_registrations WHERE id=$1',[reg])).rows[0].last_pull_at.toISOString(),new Date(cutoff).toISOString(),'source cursor survives status update');
 const engine=require('../../src/services/wpEvaluationEngine').evaluationEngine;
 const originalEvaluate=engine.evaluateSingleAccount;
 scheduler.categoryRules=async()=>[];
 engine.evaluateSingleAccount=async()=>{await db.query('UPDATE wp_trades SET profit=999 WHERE registration_id=$1',[reg]);throw Error('synthetic evaluation failure');};
 try{
  assert.deepEqual(await scheduler.evaluateAllAccounts(challenge.id,[account]),[]);
  assert.equal(Number((await db.query('SELECT profit FROM wp_trades WHERE registration_id=$1',[reg])).rows[0].profit),10,'failed evaluation rolls back trade mutations');
  assert.equal((await db.query('SELECT history_sync_state FROM trading_registrations WHERE id=$1',[reg])).rows[0].history_sync_state,'evaluation_failed');
 }finally{engine.evaluateSingleAccount=originalEvaluate;}
 const repeat=await scheduler.pullVerifiedAccount(account,1,challenge);
 assert.equal(repeat.success,true);assert.equal(repeat.tradesCount,0,'repeated import does not count existing trades as new');
 const stage=()=>db.query(`INSERT INTO wp_leaderboard_staging(challenge_id,registration_id,account_number,user_id,account_type,current_balance,adjusted_balance,normalized_balance) VALUES($1,$2,'987654',-987654,'demo',110,110,110) ON CONFLICT(challenge_id,registration_id) DO UPDATE SET current_balance=110`,[challenge.id,reg]);
 await stage();await leaderboardService.flushStagingToLive(challenge.id,reg);
 assert.equal((await db.query('SELECT * FROM wp_visible_trades WHERE registration_id=$1',[reg])).rows.length,1);
 assert.equal((await db.query('SELECT history_sync_state FROM trading_registrations WHERE id=$1',[reg])).rows[0].history_sync_state,'published');
 // An error from history must leave previously published balances/trades intact.
 axios.post=async()=>({data:{success:false,message:'history unavailable'}});
 const failed=await scheduler.pullVerifiedAccount(account,1,challenge);assert.equal(failed.errorCode,'history_incomplete');
 assert.equal((await db.query('SELECT current_balance FROM wp_leaderboard WHERE registration_id=$1',[reg])).rows[0].current_balance,'110.00');
 // Failure after trade persistence must roll back its whole transaction.
 axios.post=async(_,req)=>({data:{...structuredClone(data),request_id:req.request_id,trades:[{...data.trades[0],profit:20}]}});
 const saved=scheduler.saveDeals;scheduler.saveDeals=async()=>{throw Error('synthetic persistence failure');};
 const bad=await scheduler.pullVerifiedAccount(account,1,challenge);assert.equal(bad.success,false);scheduler.saveDeals=saved;
 assert.equal(Number((await db.query('SELECT profit FROM wp_trades WHERE registration_id=$1',[reg])).rows[0].profit),10);
 await checkpointPullJournal(reg);
 const client=await db.getClient();try{
  const preview=await rollback(client,false,reg);assert.equal(preview.accounts,1);assert.ok(preview.changedRows>0);
  await db.query("UPDATE trading_registrations SET last_known_balance=999 WHERE id=$1",[reg]);
  await assert.rejects(()=>rollback(client,true,reg),/conflict/);
  await db.query("UPDATE trading_registrations SET last_known_balance=110 WHERE id=$1",[reg]);
  const restored=await rollback(client,true,reg);assert.equal(restored.applied,true);
  assert.equal((await db.query('SELECT * FROM wp_trades WHERE registration_id=$1',[reg])).rows.length,0,'rollback removes only newly imported synthetic rows');
 }finally{client.release();}
 console.log('PASS: migration, source cutoff, atomic ingestion, visible publication, signed ops scope, recovery state, conflict-safe rollback');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
