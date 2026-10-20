require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const dbPath=require.resolve('../src/database/db');
let calls=[];
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:async(sql)=>{calls.push(sql);return {rows:calls.length===1?[{challenge_id:39,failures:0}]:calls.length===2?[{pull_batch_id:963,recovered:11}]:[{pull_batch_id:963,credentials:1}]};}}}};
const {annotatePullRecovery}=require('../src/services/pullRecoveryReport');
test('recovered accounts and credentials are not unresolved pull failures',async()=>{
 const b={id:963,challenge_id:39,failed:12,completed_at:new Date()};await annotatePullRecovery([b]);
 assert.equal(b.recovered,11);assert.equal(b.credentialFailures,1);assert.equal(b.remainingFailed,0);assert.equal(b.failed,12);
 assert.match(calls[0],/COALESCE\(pull_status,''\) NOT IN/);
});
