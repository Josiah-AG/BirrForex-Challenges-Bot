const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {rechargeDepositsForRegistration:check}=require('../src/utils/approvedLateFunding');
const start=Date.parse('2026-10-05T06:00:00Z');
const first={ticket:'123',profit:'10000',time:'2026-10-05T17:00:00Z'};
const reg={funding_origin:'approved_late_initial_deposit:123',registered_at:'2026-10-06T10:00:00Z',registration_balance:'10000'};
test('ordinary participants retain all post-start deposits',()=>{assert.deepEqual(check([first],{...reg,funding_origin:null},start),[first]);});
test('only specifically approved initial funding is exempt; subsequent top-ups remain',()=>{const topup={...first,ticket:'124',profit:1};assert.deepEqual(check([first],reg,start),[]);assert.deepEqual(check([first,topup],reg,start),[topup]);});
test('missing or altered funding evidence fails closed',()=>{for(const deposits of [[],[{...first,ticket:124}],[{...first,profit:9999}],[{...first,time:'2026-10-04T00:00:00Z'}],[{...first,time:'2026-10-07T00:00:00Z'}]])assert.throws(()=>check(deposits,reg,start),/evidence/);assert.throws(()=>check([first],{...reg,registered_at:'2026-10-04T00:00:00Z'},start),/evidence/);});
test('verified setup withdrawal reconciles initial funding without permitting later top-ups',()=>{
 const funded={...first,profit:'10009'};
 const withdrawal={profit:'-9',time:'2026-10-05T17:01:00Z'};
 const topup={...first,ticket:'999',profit:20,time:'2026-10-07T00:00:00Z'};
 assert.deepEqual(check([funded,topup],reg,start,[withdrawal]),[topup]);
 assert.throws(()=>check([funded],reg,start,[]),/evidence/);
 for(const bad of [{...withdrawal,profit:-8},{...withdrawal,profit:9},{...withdrawal,time:'2026-10-07T00:00:00Z'},{...withdrawal,time:'2026-10-05T16:00:00Z'}])assert.throws(()=>check([funded],reg,start,[bad]),/evidence/);
});
