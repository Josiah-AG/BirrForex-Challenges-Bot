const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let status='registration_open',queries=[];
const dbPath=require.resolve('../src/database/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{transaction:async f=>f(),query:async(sql,args)=>{queries.push({sql,args});if(sql.startsWith('SELECT *'))return {rows:[{id:39,status}]};return {rows:[]};}}}};
const validation=require.resolve('../src/utils/configValidation');
require.cache[validation]={id:validation,filename:validation,loaded:true,exports:{ConfigurationError:Error,validateChallenge(){}}};
const {transitionChallenge}=require('../src/services/challengeState');
test('credential deadline is applied atomically at actual challenge start only',async()=>{
 queries=[];assert.equal(await transitionChallenge(39,'active'),true);
 const dq=queries.find(q=>q.sql.includes('UPDATE trading_registrations'));
 assert(dq);assert.match(dq.sql,/start_date<=NOW\(\)/);assert.match(dq.sql,/invalid_credentials/);assert.match(dq.sql,/status IS DISTINCT FROM 'removed'/);assert.deepEqual(dq.args,[39]);
 status='active';queries=[];assert.equal(await transitionChallenge(39,'active'),false);assert(!queries.some(q=>q.sql.includes('UPDATE trading_registrations')));
});

test('ending queues an immediate full-history pull without waiting for a schedule slot',async()=>{
 status='active';queries=[];
 assert.equal(await transitionChallenge(39,'reviewing'),true);
 const job=queries.find(q=>q.sql.includes('INSERT INTO challenge_pull_jobs'));
 assert.match(job.sql,/full_history/);
 assert.deepEqual(job.args,[39,'lifecycle:reviewing',true]);
 status='reviewing';queries=[];
 assert.equal(await transitionChallenge(39,'reviewing'),false);
 assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO challenge_pull_jobs')).length,0);
});
