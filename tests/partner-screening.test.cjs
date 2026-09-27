const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const mock=(path,exports)=>{const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports};};
let calls=[],integration=true,notices=[],sent=[],failEmail=false;
const query=async(sql,args=[])=>{calls.push({sql,args});
 if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};
 if(sql.includes('FROM partner_notice_outbox'))return {rows:notices};
 return {rows:[]};};
mock('../src/database/db',{db:{query,getClient:async()=>({query,release(){}})}});
class Broker{constructor(credentials){this.credentials=credentials;}}
const globalBroker={global:true};
mock('../src/services/exnessService',{ExnessService:Broker,exnessService:globalBroker});
mock('../src/services/hostService',{hostService:{getBrokerCredentials:async(id)=>integration?{hostId:id}:null}});
mock('../src/services/tradingChallengeService',{tradingChallengeService:{}});
mock('../src/services/emailService',{emailService:{sendGeneric:async(...args)=>{sent.push(args);return !failEmail;}}});
const {classifyPartner,screeningSlot,brokerForChallenge,inspectPartner,inspectParticipants,deliverPartnerNotices}=require('../src/services/partnerScreening');
test('host credentials are isolated and missing integration never falls back',async()=>{
 integration=true;assert.equal((await brokerForChallenge({host_id:72})).credentials.hostId,72);
 assert.equal(await brokerForChallenge({}),globalBroker);integration=false;
 assert.equal(await brokerForChallenge({host_id:72}),null);integration=true;
});
test('unknown and unconfirmed departure never clear a warning or disqualify',()=>{
 for(const s of ['','OTHER',undefined])assert.equal(classifyPartner(s,false),'check_failed');
 assert.equal(classifyPartner('LEFT'),'check_failed');assert.equal(classifyPartner('LEFT',false),'not_allocated');
 assert.equal(classifyPartner('LEFT',true),'allocated');assert.equal(classifyPartner('CHANGING',true),'changing');
 assert.equal(classifyPartner('ACTIVE',false),'check_failed');assert.equal(classifyPartner('ACTIVE',true),'allocated');assert.equal(classifyPartner('INACTIVE',true),'allocated');
});
test('missed five-minute window catches up to latest due slot, including restart after midnight',()=>{
 assert.equal(screeningSlot('2026-09-27','10:42'),'2026-09-27:day');
 assert.equal(screeningSlot('2026-09-27','23:55'),'2026-09-27:night');
 assert.equal(screeningSlot('2026-09-28','07:01'),'2026-09-27:night');
});
test('manual and automatic evidence uses current host identity and explicit status',async()=>{
 const broker={checkAllocation:async()=>({affiliation:false,client_uid:'new'}),getFullUuid:async uid=>{assert.equal(uid,'new');return 'full';},getKycStatus:async()=>({client_status:'LEFT'})};
 assert.equal((await inspectPartner(broker,{id:1,email:'test@example.invalid',client_uid:'stale'})).status,'not_allocated');
 assert.equal((await inspectPartner(broker,{id:2})).status,'no_email');
});
test('checks are bounded to three concurrent participants and retain order',async()=>{
 let active=0,max=0;
 const broker={checkAllocation:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));return {affiliation:true,client_uid:'uid'};},getFullUuid:async()=> 'uuid',getKycStatus:async()=>{active--;return {client_status:'ACTIVE'};}};
 const result=await inspectParticipants(broker,Array.from({length:7},(_,id)=>({id,email:'test@example.invalid'})));
 assert.equal(max,3);assert.deepEqual(result.map(r=>r.id),[0,1,2,3,4,5,6]);
});
test('host participant notices go to participant email, failed delivery is retried durably',async()=>{
 calls=[];sent=[];failEmail=true;notices=[{id:9,registration_id:1,challenge_id:2,kind:'changing',partner_status:'CHANGING',host_id:3,has_broker_integration:true,source:'winnerpip',email:'participant@example.invalid',message:'Notice <test>'}];
 await deliverPartnerNotices({sendMessage(){throw new Error('Must not send hosted report to Telegram');}});
 assert.equal(sent[0][0],'participant@example.invalid');assert.equal(sent[0][3],'partner-notice-9');assert.match(sent[0][2],/&lt;test&gt;/);
 assert(calls.some(c=>c.sql.includes('attempts=attempts+1')));assert(!calls.some(c=>c.sql.includes('sent_at=NOW(),error=NULL')));
 failEmail=false;calls=[];await deliverPartnerNotices({});assert(calls.some(c=>c.sql.includes('sent_at=NOW(),error=NULL')));
});
test('removed integration and cleared warnings suppress obsolete pending notices',async()=>{
 calls=[];sent=[];notices=[{id:1,host_id:3,has_broker_integration:false},{id:2,kind:'changing',partner_status:null}];
 await deliverPartnerNotices({});assert.equal(sent.length,0);assert.equal(calls.filter(c=>c.sql.includes("error='Superseded'")).length,2);
});
