const {test}=require('node:test');const assert=require('node:assert/strict');
const m=require('../dist/utils/commercialMetrics');
const start='2026-10-01T00:00:00Z',end='2026-10-08T00:00:00Z',now=Date.parse('2026-10-06T12:00:00Z'),pull='2026-10-06T08:00:00Z';
test('normal coverage freezes; DQ and blown accounts advance through Exness, capped at end',()=>{
 assert.equal(m.commercialCutoff(start,end,now,pull,false,false),Date.parse(pull));
 assert.equal(m.commercialCutoff(start,end,now,null,false,false),null);
 assert.equal(m.commercialCutoff(start,end,now,pull,true,false),now);
 assert.equal(m.commercialCutoff(start,end,Date.parse('2026-10-10'),null,true,false),Date.parse(end));
 assert.equal(m.commercialCutoff(start,end,Date.parse('2026-10-10'),null,false,true),Date.parse(end));
});
test('order eligibility uses close time, not late reward credit date',()=>{
 assert.equal(m.eligibleCommercialOrder({close_date:pull,date:'2026-10-20'},Date.parse(start),now),true);
 assert.equal(m.eligibleCommercialOrder({close_date:'2026-10-07'},Date.parse(start),now),false);
 assert.equal(m.eligibleCommercialOrder({close_date:pull},Date.parse(start),null),false);
});
test('native cent lots convert once; broker-normalized lots remain unchanged',()=>{
 assert.equal(m.normalizedTradeLots(.5,true),.005);assert.equal(m.normalizedTradeLots(.5,false),.5);
 const s=m.commercialSummary([{state:'confirmed',lots:.005,revenue:.056,volumeUSD:14,symbol:'XAUUSD'}]);assert.equal(s.lots,.005);assert.equal(s.confirmed,.056);
});
test('estimates need prior matching account, symbol and type and never future rates',()=>{
 const o={client_account:'123',symbol:'XAUUSD',client_account_type:'Pro',volume_lots:.01,reward_usd:.196,close_date:'2026-10-04'};
 assert.equal(m.historicalRate([o],'123','XAUUSD','Pro',now),19.6);
 assert.equal(m.historicalRate([o],'123','XAUUSD','Zero',now),null);
 assert.equal(m.historicalRate([o],'456','XAUUSD','Pro',now),null);
 assert.equal(m.historicalRate([o],'123','XAUUSD','Pro',Date.parse('2026-10-03')),null);
});
test('pending is distinct from zero reward and confirmation replaces estimates',()=>{
 const estimated={state:'estimated',revenue:.2,lots:.1,volumeUSD:null,symbol:'GBPUSD'};
 const pending={state:'pending',revenue:0,lots:.2,volumeUSD:null,symbol:'GBPUSD'};
 let summary=m.commercialSummary([estimated,pending]);assert.equal(summary.total,.2);assert.equal(summary.pending,1);assert.equal(summary.volumePending,2);
 summary=m.commercialSummary([{...estimated,state:'confirmed',revenue:.18,volumeUSD:1000},pending]);assert.equal(summary.total,.18);assert.equal(summary.estimated,0);assert.equal(summary.confirmed,.18);
});

test('multiple partner reward records do not double-count traded volume',()=>{
 const t={activityKey:'123|mt5:456',lots:1,volumeUSD:1000,state:'confirmed',symbol:'XAUUSD',revenue:2};
 const s=m.commercialSummary([t,{...t,revenue:1}]);assert.equal(s.confirmed,3);assert.equal(s.lots,1);assert.equal(s.volumeUSD,1000);assert.equal(s.transactions,1);
});
