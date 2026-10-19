const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let response;function mock(p,exports){const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../src/config',{config:{vpsApiUrl:'http://test',vpsApiKey:'test'}});
mock('../src/services/workloadAxios',{__esModule:true,default:{get:async()=>({data:{terminals:1,healthy_terminals:[1]}}),post:async()=>({data:response})}});
const {vpsService}=require('../src/services/vpsService');
test('wrong login or server cannot be accepted as a starting balance',async()=>{for(const r of [{login:456,server:'Exness-MT5Trial9'},{login:123,server:'other'}]){response={success:true,balance:100,...r};assert.equal((await vpsService.verifyConnection('123','Exness-MT5Trial9','test')).success,false);}});
test('matching account and server retain broker balance and units',async()=>{response={success:true,login:123,server:'Exness-MT5Trial9',balance:1000,currency:'USC'};const r=await vpsService.verifyConnection('123','Exness-MT5Trial9','test');assert.equal(r.success,true);assert.equal(r.balance,1000);assert.equal(r.currency,'USC');});
