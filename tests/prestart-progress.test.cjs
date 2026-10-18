const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const challenge={id:39,title:'Test',status:'registration_open',start_date:new Date(Date.now()+3600000),starting_balance:10,target_balance:15,deposit_mode:'min_limit',type:'real'};
let progress=[],completed;
function mock(path,exports){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../src/database/db',{db:{transaction:async f=>f(),query:async(sql,args)=>{
 if(sql.includes('COUNT(*)'))return {rows:[{cnt:3}]};
 if(sql.startsWith('SELECT * FROM trading_challenges'))return {rows:[challenge]};
 if(sql.includes('SELECT id, account_number'))return {rows:[1,2,3].map(id=>({id,account_number:String(id),account_type:'real'}))};
 if(sql.includes('INSERT INTO wp_pull_batches'))return {rows:[{id:999}]};
 if(sql.includes('SET successful=$1'))progress.push([...args]);
 if(sql.includes('SET completed_at'))completed=args;
 return {rows:[]};
}}});
mock('../src/services/vpsService',{vpsService:{verifyConnection:async account=>{
 if(account==='2')return {success:false};if(account==='3')throw Error('test timeout');
 return {success:true,status:'connected',balance:10};
}}});
mock('../src/services/wpEvaluationEngine',{evaluationEngine:{rulesForAccount:async()=>({})}});
const {TradingScheduler}=require('../src/scheduler/tradingScheduler');
test('pre-start progress advances after success, rejected verification and exception',async()=>{
 await new TradingScheduler({}).checkPreStartSnapshot(challenge);
 assert.deepEqual(progress,[[1,0,999],[1,1,999],[1,2,999]]);
 assert.deepEqual(completed,[1,2,999]);
});
