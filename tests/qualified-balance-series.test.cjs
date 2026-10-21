require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {qualifiedBalanceSeries}=require('../src/utils/qualifiedBalanceSeries');
test('published balance includes penalties and withdrawals',()=>{
 const r=qualifiedBalanceSeries(10000,'start',[{close_time:'trade',profit:358.06,is_qualified:true}],{current_balance:'10358.06',adjusted_balance:'10019.06',total_withdrawn:'710',last_updated:'end'});
 assert.deepEqual(r.series.at(-1),{time:'end',gross:9648.06,adjusted:9309.06,label:'Published balance'});
 assert.match(r.adjustmentNote,/penalties and withdrawals/);
});
test('flagged profits excluded; losses and costs included',()=>{
 const r=qualifiedBalanceSeries(100,'start',[{profit:10,commission:-1,swap:-1,is_qualified:true,close_time:'1'},{profit:20,is_qualified:false,close_time:'2'},{profit:-5,commission:-1,is_qualified:false,close_time:'3'}],null);
 assert.equal(r.series.at(-1).adjusted,102);assert.equal(r.series.at(-1).gross,122);
});
test('zero and negative qualified balances never fall back to gross',()=>{
 for(const adjusted of [0,-20])assert.equal(qualifiedBalanceSeries(100,'start',[],{current_balance:200,adjusted_balance:adjusted,total_withdrawn:0,last_updated:'end'}).series.at(-1).adjusted,adjusted);
});
test('matching published values need no additional adjustment point',()=>{
 const r=qualifiedBalanceSeries(100,'start',[{profit:1,is_qualified:true,close_time:'end'}],{current_balance:101,adjusted_balance:101,last_updated:'end'});
 assert.equal(r.series.length,2);assert.equal(r.adjustmentNote,null);
});
test('risk penalty belongs to its trade and later profits rise normally',()=>{
 const r=qualifiedBalanceSeries(10,'start',[
  {close_time:'first',profit:5,is_qualified:false,evaluation_penalty:'1.125'},
  {close_time:'last',profit:2.97,is_qualified:true,evaluation_penalty:0}
 ],{current_balance:17.97,adjusted_balance:11.85,last_updated:'evaluation'});
 assert.equal(r.series[1].adjusted,8.88);
 assert.equal(r.series[2].adjusted,11.85);
 assert.equal(r.series.length,3);
 assert.equal(r.adjustmentNote,null);
});
test('penalty replaces the trade result rather than double counting a loss',()=>{
 const r=qualifiedBalanceSeries(10,'start',[{close_time:'trade',profit:-2,is_qualified:false,evaluation_penalty:1}],null);
 assert.equal(r.series.at(-1).adjusted,9);assert.equal(r.series.at(-1).gross,8);
});
