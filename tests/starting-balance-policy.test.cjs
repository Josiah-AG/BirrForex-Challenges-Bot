const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {startingBalanceProblem:p,balanceCheckTimes:t}=require('../src/utils/startingBalancePolicy');
const {accountUnitMultiplier:m}=require('../src/utils/accountUnits');
test('fixed balances allow only decimals above the target, regardless of balance size',()=>{
 for(const target of [1,100,100000]){for(const delta of [0,.1,.99])assert.equal(p(target+delta,target),null);for(const delta of [1,100])assert.equal(p(target+delta,target),'high');assert.equal(p(target-.01,target),'low');}
 assert.equal(p(100.999,100),'high');assert.equal(p(100.1+0.2,100),null);assert.equal(p(NaN,100),'invalid');assert.equal(p(-1,100),'invalid');assert.equal(p(Infinity,100),'invalid');
});
test('explicit max/min modes keep their direction, no percentage discount',()=>{assert.equal(p(99,100,'max_limit'),null);assert.equal(p(100.99,100,'max_limit'),null);assert.equal(p(101,100,'max_limit'),'high');assert.equal(p(99.99,100,'min_limit'),'low');assert.equal(p(10000,100,'min_limit'),null);assert.equal(p(0,100,'fixed'),'low');});
test('account-unit conversion preserves cent-only and hybrid conventions',()=>{for(const [challenge,rules,cent,target] of [[{type:'real'},{only_cent_account:true},true,100],[{type:'hybrid'},{only_cent_account:true},true,10000],[{type:'demo'},{},true,10000],[{type:'demo'},{},false,100]]){const limit=100*m(challenge,rules,cent);assert.equal(limit,target);assert.equal(p(limit+.1,limit),null);assert.equal(p(limit+1,limit),'high');}});
test('existing started challenges retain their previous evaluation policy',()=>{assert.equal(p(100500,100000,'fixed','legacy_percent'),null);assert.equal(p(100500,100000,'fixed'),'high');});
test('warning checks at T-5/T-6, final T-2/T-3, frozen lead survives count changes',()=>{const start=new Date('2099-10-01T12:00:00Z');for(const [count,lead] of [[0,2],[500,2],[501,3],[3000,3]]){const x=t(start,count);assert.equal(+start-+x.finalAt,lead*3600000);assert.equal(+start-+x.warningAt,(lead+3)*3600000);}assert.equal(t(start,501,2).lead,2);assert.equal(t(start,1,3).lead,3);});
