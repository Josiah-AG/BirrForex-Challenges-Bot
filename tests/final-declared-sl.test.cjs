require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {finalDeclaredRisk}=require('../src/utils/finalDeclaredSl');
const t={ticket:'10',position_id:'20',close_time:'2026-10-20T08:02:56.485Z',symbol:'XAUUSDm',trade_type:'Sell',volume:.08,open_price:4131.804,close_price:4122.485,profit:74.55,stop_loss:4143.213,native_sl_tp:{source:'native_closing_deal',ticket:10,position_id:20,time_msc:1792483376485,sl:4131.867,tp:4120.29}};
test('closing SL overrides old wide order risk',()=>assert(Math.abs(finalDeclaredRisk(t,.08)-.504)<.01));
test('absent or mismatched evidence never falls back to old SL',()=>{assert.equal(finalDeclaredRisk({...t,native_sl_tp:null},.08),null);assert.equal(finalDeclaredRisk({...t,ticket:'11'},.08),null)});
test('profit-side and removed stops do not create declared losses',()=>{for(const sl of [4130,0])assert.equal(finalDeclaredRisk({...t,native_sl_tp:{...t.native_sl_tp,sl}},.08),0)});
test('wide final stop still breaches and position exposure scales',()=>{assert(finalDeclaredRisk({...t,native_sl_tp:{...t.native_sl_tp,sl:4145}},.08)>100);assert(Math.abs(finalDeclaredRisk(t,.16)-2*finalDeclaredRisk(t,.08))<1e-8)});
