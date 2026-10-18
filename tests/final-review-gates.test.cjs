const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let batches=0,unresolved=false,locked=false,ranked=false,snapshot=false;
const dbPath=require.resolve('../src/database/db');
const db={transaction:async f=>f(),getClient:async()=>({query:async()=>({rows:[{locked:true}]}),release(){}}),query:async sql=>{
 if(sql.startsWith('SELECT leaderboard_locked_at'))return {rows:[{leaderboard_locked_at:null,end_date:new Date()}]};
 if(sql.includes('COUNT(*)'))return {rows:[{cnt:batches}]};
 if(sql.includes('SELECT r.id'))return {rows:unresolved?[{id:1}]:[]};
 if(sql.includes('SET leaderboard_locked_at'))locked=true;
 return {rows:[]};
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db}};
for(const [path,exports] of [
 ['../src/services/leaderboardService',{leaderboardService:{updateRankings:async()=>{ranked=true;}}}],
 ['../src/services/winnerSelection',{snapshotWinnerPipResults:async()=>{snapshot=true;}}]
]){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports};}
const {TradingScheduler}=require('../src/scheduler/tradingScheduler');
const scheduler=new TradingScheduler({bot:{telegram:{sendMessage:async()=>{}}}});
test('finalization requires two successful final batches and no unresolved contenders',async()=>{
 for(const scenario of [[0,false,false],[1,false,false],[2,true,false],[2,false,true]]){
 [batches,unresolved]=scenario;locked=ranked=snapshot=false;
 await scheduler.checkLeaderboardLock({id:38,status:'reviewing',title:'Test'});
 assert.equal(locked,scenario[2]);assert.equal(ranked,scenario[2]);assert.equal(snapshot,scenario[2]);
 }
});
