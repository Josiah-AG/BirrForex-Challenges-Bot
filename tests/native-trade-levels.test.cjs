require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validatedNativeLevels}=require('../src/utils/nativeTradeLevels');
const trade=()=>({ticket:123,position_id:55,close_time:'2026-10-06T11:36:00Z',stop_loss:null,take_profit:null,native_sl_tp:{source:'native_closing_deal',ticket:123,position_id:55,time_msc:Date.parse('2026-10-06T11:36:00Z'),sl:4100,tp:4300}});
test('closing evidence is retained without changing risk inputs',()=>{const t=trade();assert.equal(validatedNativeLevels(t).sl,4100);assert.equal(t.stop_loss,null);assert.equal(t.take_profit,null)});
test('reject mismatched identity, time, invalid prices and source',()=>{for(const delta of [{ticket:124},{position_id:56},{time_msc:0},{sl:-1},{tp:Infinity},{source:'entry'}]){const t=trade();Object.assign(t.native_sl_tp,delta);assert.equal(validatedNativeLevels(t),null)}});
test('missing evidence is optional and zero levels are valid absence',()=>{assert.equal(validatedNativeLevels({}),null);const t=trade();t.native_sl_tp.sl=0;assert.equal(validatedNativeLevels(t).sl,0)});
