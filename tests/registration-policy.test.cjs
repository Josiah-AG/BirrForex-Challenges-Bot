const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
let challenge,rules;
const dbPath=require.resolve('../src/database/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:async(sql)=>{
 if(sql.includes('FROM trading_challenges'))return {rows:[challenge]};
 if(sql.includes('FROM hosts'))return {rows:[{active:true,registration_blocked:false}]};
 throw new Error('Unexpected SQL');
}}}};
const enginePath=require.resolve('../src/services/wpEvaluationEngine');
require.cache[enginePath]={id:enginePath,filename:enginePath,loaded:true,exports:{evaluationEngine:{rulesForAccount:async()=>rules}}};
const {validateVerifiedRegistration:validate}=require('../src/services/registrationEligibility');
const reset=()=>{challenge={type:'real',status:'registration_open',start_date:'2099-01-01',registration_mode:'manual',starting_balance:100,target_balance:0,target_enabled:false};rules={only_cent_account:false,allow_professional:false};};
const verified=(changes={})=>({success:true,status:'connected',balance:100,currency:'USD',trade_mode:2,account_subtype:'standard',...changes});
test('every entry path rejects unavailable or incomplete VPS evidence',async()=>{
 reset();
 for(const mode of ['web','native','change','csv'])for(const result of [verified({success:false}),verified({trade_mode:null}),verified({trade_mode:undefined}),verified({currency:''}),verified({balance:NaN}),verified({status:'timeout'})])await assert.rejects(()=>validate(1,'real',result,mode),/VPS verification/);
});
test('currency conversion is identical for web/native/CSV/replacement registration',async()=>{
 for(const mode of ['web','native','change','csv']){
  reset(); await validate(1,'real',verified({balance:10000,currency:'USC'}),mode);
  await assert.rejects(()=>validate(1,'real',verified({balance:10101,currency:'USC'}),mode),/maximum/);
  rules.only_cent_account=true; await validate(1,'real',verified({balance:100,currency:'USC'}),mode);
  await assert.rejects(()=>validate(1,'real',verified({balance:10000,currency:'USC'}),mode),/maximum/);
  challenge.type='hybrid';await validate(1,'real',verified({balance:10000,currency:'USC'}),mode);
 }
});
test('actual account mode, registration window and host-managed mode are enforced',async()=>{
 reset();await assert.rejects(()=>validate(1,'demo',verified()),/category/);
 challenge.start_date='2000-01-01';await assert.rejects(()=>validate(1,'real',verified()),/closed/);
 reset();challenge.host_id=1;challenge.registration_mode='csv';await assert.rejects(()=>validate(1,'real',verified(),'web'),/host-managed/);
 await validate(1,'real',verified(),'csv');
});
