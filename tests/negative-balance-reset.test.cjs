require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {negativeBalanceResetTickets:find}=require('../src/utils/negativeBalanceReset');
const at='2026-10-07T00:00:00Z';
const reset={ticket:'2',time:at,deal_type:'2',profit:17.65,comment:'D-NULL'};
test('verified exact reset clears negative balance without treating it as funding',()=>assert.deepEqual([...find([reset],0,at,'published')],['2']));
test('actual deposit, excess funds, unknown history and wrong reset amount remain funding',()=>{for(const [r,b,state] of [[{...reset,comment:'D-trial-USD'},0,'published'],[reset,100,'published'],[reset,0,'pending'],[reset,-1,'verified']])assert.equal(find([r],b,at,state).size,0)});
test('reconstructs balance with later trades, fees and credit correctly',()=>{const later={ticket:'3',time:'2026-10-07T01:00:00Z',deal_type:'1',profit:20,commission:-2,swap:-1,fee:-.5};assert.deepEqual([...find([reset,later],16.5,later.time,'verified')],['2']);assert.equal(find([reset,{...later,fee:0}],16.5,later.time,'verified').size,0)});
test('invalid amounts or cancelled trades cannot exempt deposits',()=>{assert.equal(find([reset,{...reset,ticket:'3',profit:'bad'}],0,at,'verified').size,0);assert.equal(find([reset,{...reset,ticket:'3',deal_type:'13'}],0,at,'verified').size,0)});
