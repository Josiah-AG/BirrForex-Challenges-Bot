require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require.resolve('../src/database/db');let pending=2,latest=[];let queries=[];
require.cache[path]={id:path,filename:path,loaded:true,exports:{db:{query:async(sql)=>{queries.push(sql);return {rows:sql.includes('COUNT(*)')?[{pending,next_retry_at:null}]:latest};}}}};
const {recoveryProgress:p,getRecoveryProgress:get}=require('../src/services/recoveryProgress');
test('progress distinguishes waiting, checking, recovered and credential outcomes',async()=>{
 let s=await get(39);assert.equal(s.state,'waiting');assert.equal(s.checked,0);
 p.begin(39,2);p.checking(39);s=await get(39);assert.equal(s.state,'running');assert.equal(s.total,2);
 p.checked(39,true,false);pending=1;s=await get(39);assert.equal(s.recovered,1);assert.equal(s.state,'waiting');
 p.checking(39);p.checked(39,false,true);p.finish(39);pending=0;s=await get(39);assert.equal(s.state,'complete');assert.equal(s.visible,false);assert.equal(s.checked,2);assert.equal(s.credentialFailures,1);
 assert.match(queries[0],/NOT IN \('password_changed','invalid_credentials'\)/);
});
test('new pull clears old progress and durable pending state works without a round',async()=>{
 latest=[{started_at:new Date(Date.now()+60000),status:'running'}];pending=1;
 let s=await get(39);assert.equal(s.state,'waiting');assert.equal(s.checked,0);assert.equal(s.mainPullRunning,true);
 s=await get(40);assert.equal(s.state,'waiting');assert.equal(s.total,0);
 pending=0;s=await get(40);assert.equal(s.visible,false);
});
