require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {tradeCandleRanges}=require('../src/utils/tradeCandleRanges');
test('stock candles stop at trade close, not overnight wall-clock time',()=>{
 const [r]=tradeCandleRanges([{symbol:'AAPLm',open_time:'2026-10-06T15:30:20Z',close_time:'2026-10-06T16:05:42Z'}],Date.parse('2026-10-07T09:00:00Z'));
 assert.deepEqual(r,{symbol:'AAPLm',from_time:'2026-10-06T15:29:00.000Z',to_time:'2026-10-06T16:05:42.000Z'});
});
test('all partial/final closes and trades share a complete symbol window',()=>{
 const ranges=tradeCandleRanges([
 {symbol:'XAUUSDm',open_time:'2026-10-05T10:00:01Z',close_time:'2026-10-05T10:02:00Z'},
 {symbol:'XAUUSDm',open_time:'2026-10-05T10:00:01Z',close_time:'2026-10-06T18:00:00Z'},
 {symbol:'EURUSD',open_time:'2026-10-05T10:01:00Z',close_time:'2026-10-05T10:01:10Z'},
 ]);
 assert.equal(ranges.length,2);assert.equal(ranges[0].from_time,'2026-10-05T09:59:00.000Z');assert.equal(ranges[0].to_time,'2026-10-06T18:00:00.000Z');assert.equal(ranges[1].symbol,'EURUSDm');
});
test('invalid windows cannot introduce unbounded candle requests',()=>{
 assert.deepEqual(tradeCandleRanges([{symbol:'AAPLm',open_time:null,close_time:null},{symbol:'AAPLm',open_time:'invalid',close_time:'invalid'},{symbol:'AAPLm',open_time:'2026-10-07',close_time:'2026-10-06'}]),[]);
});
