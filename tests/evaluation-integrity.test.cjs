const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {balancesAtEntry,qualifiedPositionCounts}=require('../src/utils/evaluationIntegrity');
const at=n=>`2026-10-19T00:00:${String(n).padStart(2,'0')}Z`;
const t=(ticket,position_id=1)=>({ticket,position_id,open_time:at(10)});
const d=(ticket,time,profit,extra={})=>({ticket,time:at(time),profit,deal_type:2,...extra});
test('risk basis includes withdrawals, dividends, entry fees and later cash movements once',()=>{
 const deals=[d(1,5,-40),d(2,6,5),d(3,10,0,{position_id:1,entry:0,deal_type:0,commission:-2,fee:-1}),d(4,15,10,{deal_type:0}),d(5,20,100)];
 assert.equal(balancesAtEntry([t(4)],deals,172,at(30)).get('1'),65);
});
test('cent ledger retains native cents with identical percentage economics',()=>{
 assert.equal(balancesAtEntry([t(2)], [d(1,5,-4000),d(2,10,0,{position_id:1,entry:0,deal_type:0}),d(3,20,1000)],7000,at(30)).get('1'),6000);
});
test('same-time deal order determines balance before opening, credit is not balance',()=>{
 const deals=[d(1,10,-20),d(2,10,0,{position_id:1,entry:0,deal_type:0}),d(3,10,10),d(4,20,100,{deal_type:3})];
 assert.equal(balancesAtEntry([t(5)],deals,90,at(30)).get('1'),80);
});
test('invalid verified balance and canceled deals fail closed',()=>{
 assert.throws(()=>balancesAtEntry([t(1)],[],NaN,at(30)));
 assert.throws(()=>balancesAtEntry([t(1)],[d(2,20,1,{deal_type:13})],10,at(30)));
});
const deals=[{position_id:1,entry:0,volume:1,time:at(10),ticket:1},{position_id:1,entry:1,volume:.4,time:at(15),ticket:2},{position_id:1,entry:1,volume:.6,time:at(20),ticket:3}];
test('multiple qualified partial closes count as one whole position',()=>assert.deepEqual(qualifiedPositionCounts([t(2),t(3)],new Set(['2','3']),deals),{total:1,qualified:1,flagged:0}));
test('a flagged closing part prevents whole-position qualification',()=>assert.deepEqual(qualifiedPositionCounts([t(2),t(3)],new Set(['2']),deals),{total:1,qualified:0,flagged:1}));
test('open remainder and missing entry evidence cannot fulfil minimum trades',()=>{
 assert.equal(qualifiedPositionCounts([t(2)],new Set(['2']),deals.slice(0,2)).qualified,0);
 assert.equal(qualifiedPositionCounts([t(2)],new Set(['2']),[]).qualified,0);
});
test('a position still open at the deadline cannot become qualified through a later closing deal',()=>{
 const until=at(17);
 assert.equal(qualifiedPositionCounts([t(2)],new Set(['2']),deals.filter(d=>d.time<=until)).qualified,0);
});
