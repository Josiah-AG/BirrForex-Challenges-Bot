const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {db}=require('../src/database/db');
const eligibility=require('../src/services/registrationEligibility');
const {vpsService}=require('../src/services/vpsService');
const {tradingChallengeService:service}=require('../src/services/tradingChallengeService');
const {tradingRegistrationHandler:handler}=require('../src/bot/tradingRegistrationHandler');
const original={id:1,challenge_id:39,user_id:123,status:'registered',account_type:'demo'};
let rows,failInsert,failVerify,events;
function reset(){rows=[{...original}];failInsert=false;failVerify=false;events=[];}
vpsService.verifyConnection=async()=>{events.push('verify');if(failVerify)throw Error('verification failed');return {currency:'USD',balance:100};};
eligibility.validateHostAllocation=async()=>{};
eligibility.validateVerifiedRegistration=async()=>{};
db.transaction=async fn=>{const before=structuredClone(rows);try{return await fn()}catch(e){rows=before;throw e}};
db.query=async(sql,args)=>{
 if(sql.includes('SELECT id FROM wp_current_registrations'))return {rows:rows.filter(r=>r.id===args[0]&&r.challenge_id===args[1]&&r.user_id===args[2]&&r.status!=='removed')};
 if(sql.startsWith('UPDATE trading_registrations')){events.push('remove');rows[0].status='removed';}
 if(sql.startsWith('INSERT INTO trading_registrations')){events.push('insert');if(failInsert)throw Error('duplicate account');const r={id:2,status:'registered'};rows.push(r);return {rows:[r]};}
 return {rows:[]};
};
const data={challenge_id:39,user_id:123,username:'test',account_type:'real',email:'test@example.com',account_number:'123456',mt5_server:'test',investor_password:'test',client_uid:null,replacement_registration_id:1};
test('replacement verification failure keeps original active',async()=>{reset();failVerify=true;await assert.rejects(service.registerUser(data));assert.equal(rows[0].status,'registered');assert.deepEqual(events,['verify']);});
test('failed final insert rolls back removal',async()=>{reset();failInsert=true;await assert.rejects(service.registerUser(data));assert.deepEqual(rows,[original]);});
test('verified replacement commits old removal and new registration together',async()=>{reset();await service.registerUser(data);assert.deepEqual(events,['verify','remove','insert']);assert.equal(rows[0].status,'removed');assert.equal(rows[1].status,'registered');});
test('stale or wrong-owner replacement cannot remove original',async()=>{reset();await assert.rejects(service.registerUser({...data,user_id:456}));assert.deepEqual(rows,[original]);});
test('starting category switch does not remove registration',async()=>{reset();service.getRegistration=async()=>original;service.getChallengeById=async()=>({id:39,type:'hybrid',status:'registration_open'});service.deleteRegistration=async()=>{throw Error('must not remove early')};await handler.handleCallback({from:{id:123},answerCbQuery:async()=>{},reply:async()=>{}},'tc_switch_confirm_39');assert.deepEqual(rows,[original]);});
