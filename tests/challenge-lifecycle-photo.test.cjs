const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
let completed=false,receipts=new Set(),calls=[],fail=true;
const event={id:1,destination:'active',payload:{id:39,title:'Sprint 1',timezone:'Africa/Nairobi',end_date:'2026-10-23T20:59:00Z'}};
const query=async(sql,args=[])=>{
 if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};
 if(sql.includes('SELECT * FROM challenge_lifecycle_events'))return {rows:completed?[]:[event]};
 if(sql.includes('SELECT 1 FROM challenge_lifecycle_deliveries'))return {rows:receipts.has(args[1])?[{}]:[]};
 if(sql.startsWith('INSERT INTO challenge_lifecycle_deliveries'))receipts.add(args[1]);
 if(sql.includes('completed_at=NOW()'))completed=true;
 return {rows:[]};
};
mock('../src/database/db',{db:{query,getClient:async()=>({query,release(){}})}});
mock('../src/config',{config:{mainChannelId:'main',challengeChannelId:'challenge',adminUserId:1}});
const {deliverLifecycleEvents}=require('../src/services/challengeLifecycle');
const telegram={sendPhoto:async(channel,photo,options)=>{if(channel==='challenge'&&fail)throw Error('Temporary failure');calls.push({channel,photo,options});return {message_id:1};},sendMessage:async(channel,text)=>{calls.push({channel,text});return {message_id:2};}};
test('start sends existing photo once per channel; failed channel retries without duplicating main photo',async()=>{
 await deliverLifecycleEvents(telegram);assert.equal(calls.length,1);assert.equal(calls[0].channel,'main');assert.match(calls[0].photo.source,/Challenge Start.png$/);assert.match(calls[0].options.caption,/Sprint 1/);assert.match(calls[0].options.caption,/winnerpip.com/);assert(calls[0].options.caption.length<1024);
 fail=false;await deliverLifecycleEvents(telegram);assert.deepEqual(calls.map(c=>c.channel),['main','challenge',1]);assert(completed);
 await deliverLifecycleEvents(telegram);assert.equal(calls.length,3);
});
