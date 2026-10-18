const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let queries=[];const id=require.resolve('../src/database/db');require.cache[id]={id,filename:id,loaded:true,exports:{db:{query:async(sql,args)=>{queries.push({sql,args});return {rows:[]};}}}};
const {recordPrestartSnapshotFailure:fail}=require('../src/services/prestartSnapshotRetry');
test('credential failures pause using the existing durable notice state',async()=>{
 queries=[];await fail(39,{id:5,investor_password:'test'},true);
 assert.equal(queries.length,1);assert.match(queries[0].sql,/pull_status='invalid_credentials'/);assert.match(queries[0].sql,/credential_failure_detected_at=COALESCE/);assert.match(queries[0].sql,/investor_password=\$3/);assert.doesNotMatch(queries[0].sql,/prestart_retry_attempts\+1/);
});
test('temporary failures persist increasing bounded cooldowns without marking credentials bad',async()=>{
 queries=[];await fail(39,{id:5,investor_password:'test'},false);
 assert.match(queries[0].sql,/prestart_retry_attempts=prestart_retry_attempts\+1/);assert.match(queries[0].sql,/LEAST\(30,2\*POWER/);assert.doesNotMatch(queries[0].sql,/pull_status=/);
});
