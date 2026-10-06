require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
let query,clientQuery;
const dbPath=require.resolve('../src/database/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:(...a)=>query(...a),transaction:async f=>f(),getClient:async()=>({query:(...a)=>clientQuery(...a),release(){}})}}};
const configPath=require.resolve('../src/config');
require.cache[configPath]={id:configPath,filename:configPath,loaded:true,exports:{config:{}}};
const {VpsPullScheduler}=require('../src/scheduler/vpsPullScheduler');
const make=()=>Object.create(VpsPullScheduler.prototype);
const tick=()=>new Promise(r=>setImmediate(r));
test('drain is single-flight and starts the next queued job without a cron wait',async()=>{
 const s=make(),runs=[],jobs=[{id:1,challenge_id:38},{id:2,challenge_id:39}];let unlock;let locks=0;
 clientQuery=async sql=>{if(sql.includes('try_advisory'))locks++;return {rows:[{locked:true}]}};
 query=async sql=>({rows:sql.includes('SELECT j.*')?(jobs.length?[jobs.shift()]:[]):[]});
 s.runPullCycleForChallenge=async id=>{runs.push(id);if(runs.length===1)await new Promise(r=>unlock=r)};
 const first=s.drainPullJobs();await tick();await s.drainPullJobs();assert.deepEqual(runs,[38]);assert.equal(locks,1);
 unlock();await first;await tick();assert.deepEqual(runs,[38,39]);
});
test('background history recovery yields between accounts to a newly queued pull',async()=>{
 process.env.VPS_VERIFIED_HISTORY='true';const s=make();let pending=false,retried=0,woken=0;
 clientQuery=async()=>({rows:[{locked:true}]});
 query=async sql=>({rows:sql.includes('SELECT r.id,r.challenge_id')?[{id:1,challenge_id:38},{id:2,challenge_id:38}]:[]});
 s.hasPendingPullJobs=async()=>pending;s.refreshTerminalInventory=async()=>{};
 s.retrySingleAccountUnlocked=async()=>{retried++;pending=true;return {success:false,errorCode:'history_incomplete'}};
 s.drainPullJobs=async()=>{woken++};await s.retryIncompleteHistory();assert.equal(retried,1);assert.equal(woken,1);
});
test('batch progress persists successes and failures before all workers finish',async()=>{
 const s=make();let release;const writes=[];
 query=async(sql,args)=>{if(sql.includes('SET successful'))writes.push(args);return {rows:[]}};
 s.terminalWorker=async(t,c,b,results)=>{if(t.id===2)await new Promise(r=>release=r);results.results.push({success:t.id===1})};
 const run=s.runSharedQueueWorkers([{id:1},{id:2}],{},42);
 await new Promise(r=>setTimeout(r,1150));assert(writes.some(([ok,bad,id])=>ok===1&&bad===0&&id===42));
 release();await run;assert.deepEqual(writes.at(-1),[1,1,42]);
});
test('a busy coordinator is respected and a later wake starts the queued job',async()=>{
 const s=make();let available=false,runs=0,job={id:4,challenge_id:38};
 clientQuery=async()=>({rows:[{locked:available}]});
 query=async sql=>{if(sql.includes('SELECT j.*')){const rows=job?[job]:[];job=null;return {rows}}return {rows:[]}};
 s.runPullCycleForChallenge=async()=>{runs++};
 await s.drainPullJobs();assert.equal(runs,0);assert.equal(s.drainingPullJobs,false);
 available=true;await s.drainPullJobs();await tick();assert.equal(runs,1);
});

test('incomplete history retries once on an independent terminal and publishes only one result',async()=>{
 const s=new VpsPullScheduler({});const terminals=[1,2].map(id=>({id,isHealthy:true,totalProcessed:0,totalSuccess:0,totalFailed:0,consecutiveFailures:0}));
 s.terminals=terminals;const account={registrationId:7,accountNumber:'123'};
 s.sharedQueue.load([account]);const results={results:[]},seen=[];
 let firstFailed;const failed=new Promise(r=>firstFailed=r);
 s.pullSingleAccount=async(a,id)=>{seen.push(id);if(seen.length===1){firstFailed();return {success:false,errorCode:'history_incomplete'}}return {success:true}};
 const t1=s.terminalWorker(terminals[0],{},1,results);await failed;
 await new Promise(r=>setImmediate(r));
 await Promise.all([t1,s.terminalWorker(terminals[1],{},1,results)]);
 assert.deepEqual(seen,[1,2]);assert.deepEqual(results.results,[{success:true}]);
 assert.equal(account.excludedTerminalId,undefined);assert.equal(s.sharedQueue.isEmpty,true);
});
test('repeat incomplete history is bounded and stays failed, single-terminal pool is not looped',async()=>{
 for(const count of [1,2]){
  const s=new VpsPullScheduler({});s.terminals=Array.from({length:count},(_,i)=>({id:i+1,isHealthy:true,totalProcessed:0,totalSuccess:0,totalFailed:0,consecutiveFailures:0}));
  s.sharedQueue.load([{registrationId:8,accountNumber:'456'}]);let calls=0;const results={results:[]};
  s.pullSingleAccount=async()=>{calls++;return {success:false,errorCode:'history_incomplete'}};
  await Promise.all(s.terminals.map(t=>s.terminalWorker(t,{},1,results)));
  assert.equal(calls,count);assert.equal(results.results.length,1);assert.equal(results.results[0].success,false);
 }
});
test('successful history never gets an additional request',async()=>{
 const s=new VpsPullScheduler({});s.terminals=[{id:1,isHealthy:true,totalProcessed:0,totalSuccess:0,totalFailed:0,consecutiveFailures:0}];
 s.sharedQueue.load([{registrationId:9,accountNumber:'789'}]);let calls=0;const results={results:[]};
 s.pullSingleAccount=async()=>{calls++;return {success:true}};
 await s.terminalWorker(s.terminals[0],{},1,results);assert.equal(calls,1);
});
