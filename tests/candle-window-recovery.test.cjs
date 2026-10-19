require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {recoverMissingCandles}=require('../src/services/candleFallback');
const {tradeCandleRanges}=require('../src/utils/tradeCandleRanges');
test('candles outside the requested trade window trigger recovery',async()=>{
 const range={symbol:'USTECm',from_time:'2026-10-19T12:08:00Z',to_time:'2026-10-19T12:23:00Z'};
 let called=0;const good={success:true,candles:[{time:'2026-10-19T12:10:00Z'}]};
 const result=await recoverMissingCandles([range],{USTECm:{success:true,candles:[{time:'2026-10-19T12:46:00Z'}]}},async()=>{called++;return good},()=>{});
 assert.equal(called,1);assert.equal(result.USTECm,good);
});
test('standard and cent pending trades merge without overwriting either time window',()=>{
 const rows=tradeCandleRanges([{symbol:'USTECc',open_time:'2026-10-19T12:09:18Z',close_time:'2026-10-19T12:22:03Z'},
 {symbol:'USTECm',open_time:'2026-10-19T12:46:00Z',close_time:'2026-10-19T13:11:00Z'}]);
 assert.equal(rows.length,1);assert.equal(rows[0].from_time,'2026-10-19T12:08:00.000Z');assert.equal(rows[0].to_time,'2026-10-19T13:11:00.000Z');
});
