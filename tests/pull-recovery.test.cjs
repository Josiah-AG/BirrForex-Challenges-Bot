require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {isNonCredentialPullFailure}=require('../src/utils/pullFailure');
const {recoverMissingCandles}=require('../src/services/candleFallback');
test('generic retries exclude credentials, successful and untouched accounts',()=>{
 for(const s of [null,undefined,'password_changed','invalid_credentials','success','ready','never_pulled','pending_verify']) assert.equal(isNonCredentialPullFailure(s),false,s);
 for(const s of ['history_incomplete','incomplete','evaluation_failed','timeout','no_terminals','api_error']) assert.equal(isNonCredentialPullFailure(s),true,s);
});
test('candle fallback preserves successful bulk data and recovers only missing symbols',async()=>{
 const ranges=['EURUSDm','GBPUSDm','XAUUSDm'].map(symbol=>({symbol,from_time:'2026-10-05T06:00:00Z',to_time:'2026-10-05T08:00:00Z'}));
 const good={success:true,candles:[{time:'2026-10-05T07:00:00Z'}]}, calls=[];
 const results=await recoverMissingCandles(ranges,{EURUSDm:good,GBPUSDm:{success:false,message:'No data'}},async r=>{calls.push(r.symbol);if(r.symbol==='XAUUSDm')throw Error('unavailable');return good},()=>{});
 assert.deepEqual(calls.sort(),['GBPUSDm','XAUUSDm']);assert.equal(results.EURUSDm,good);assert.equal(results.GBPUSDm,good);assert.equal(results.XAUUSDm,undefined);
});
