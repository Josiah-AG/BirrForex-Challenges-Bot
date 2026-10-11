const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {dailyDrawdown}=require('../src/utils/dailyDrawdown');
const trade=(ticket,profit,time='2026-10-20T08:00:00Z',extra={})=>({ticket,profit,close_time:time,...extra});
const op=(amount,op_type,time='2026-10-20T07:00:00Z')=>({amount,op_type,op_time:time});
test('separate commission, swap, fees and tax trigger loss cap as real broker costs',()=>{
 for(const type of ['commission','swap','fee','tax']){
 const r=dailyDrawdown([trade(1,2)],[op(-11,type)],100,'UTC',10,null);assert(r.flagged.has(1));assert.equal(r.breaches.get('2026-10-20').cap,10);
 }
});
test('withdrawal/reset is not trading loss, but affects next-day opening balance',()=>{
 let r=dailyDrawdown([trade(1,2)],[op(-90,'withdrawal')],100,'UTC',null,10);assert.equal(r.breaches.size,0);
 r=dailyDrawdown([trade(1,-2,'2026-10-21T08:00:00Z'),trade(2,1,'2026-10-21T09:00:00Z')],[op(-90,'withdrawal')],100,'UTC',null,10);assert.equal(r.breaches.get('2026-10-21').cap,1);assert(r.flagged.has(2));
});
test('cent money scales consistently and attached costs are included',()=>{
 const standard=dailyDrawdown([trade(1,-5,undefined,{commission:-3,swap:-3}),trade(2,1,'2026-10-20T09:00:00Z')],[],100,'UTC',null,10);
 const cent=dailyDrawdown([trade(1,-500,undefined,{commission:-300,swap:-300}),trade(2,100,'2026-10-20T09:00:00Z')],[],10000,'UTC',null,10);
 assert.deepEqual([...standard.flagged],[...cent.flagged]);assert.equal(cent.breaches.get('2026-10-20').cap,standard.breaches.get('2026-10-20').cap*100);
});
