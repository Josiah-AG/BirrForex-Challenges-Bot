require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const dbPath=require.resolve('../src/database/db');
const responses=[
 [{id:1,challenge_id:39,completed_at:new Date(),successful:100,failed:8,new_trades_found:20},
  {id:2,challenge_id:39,completed_at:new Date(),successful:10,failed:2,new_trades_found:5}],
 [{challenge_id:39,failures:2}],
 [{pull_batch_id:1,recovered:7}],
 [{pull_batch_id:1,credentials:1}],
];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:async()=>({rows:responses.shift()})}}};
const {getPullActivitySummary}=require('../src/services/pullRecoveryReport');
test('overview adds verified recoveries and excludes credentials without hiding unresolved failures',async()=>{
 assert.deepEqual(await getPullActivitySummary(39),{pulls_today:2,total_success:117,total_failed:2,reconciled:7,credential_failures:1,new_trades:25});
 assert.equal(responses.length,0);
});
