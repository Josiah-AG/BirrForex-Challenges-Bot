const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {riskViolationDisplay}=require('../src/utils/riskViolationDisplay');
const message='Price exceeded the maximum allowed risk ($379.15139999999997, virtual SL @ 61.41668) on the M1 candle formed at Oct 5, 2026, 3:52 PM GMT+3. Trade should have been closed at that point. Profit of $4425.00 not counted — max allowed loss of $379.15139999999997 deducted instead.';
test('percentage explanation shows actual basis, clean amounts and preserves candle details',()=>{
 const text=riskViolationDisplay(message,379.15139999999997,12638.38,3,false);
 assert(text.includes('$379.15 (3% of balance at trade open: $12638.38)'));
 assert(text.includes('max allowed loss of $379.15 deducted'));
 assert(text.includes('M1 candle formed at Oct 5, 2026, 3:52 PM GMT+3'));
 assert(!text.includes('virtual SL'));assert(!text.includes('999999'));
});
test('fixed risk and cent accounts format consistently without inventing a percentage',()=>{
 assert(riskViolationDisplay(message,379.156,0,null,false).includes('risk of $379.16 on'));
 assert(riskViolationDisplay(message,379.1514,12638.38,3,true).includes('¢379.15 (3% of balance at trade open: ¢12638.38)'));
});
test('unrelated rule messages remain intact',()=>assert.equal(riskViolationDisplay('Weekend trading',20,1000,2,false),'Weekend trading'));
const {riskViolationTime}=require('../src/utils/riskViolationDisplay');
test('risk timestamp uses challenge timezone and date-specific daylight saving',()=>{
 const utc='2026-10-05T12:52:00Z';
 assert.match(riskViolationTime(utc,'Africa/Addis_Ababa'),/3:52 PM GMT\+3/);
 assert.match(riskViolationTime(utc,'America/New_York'),/8:52 AM EDT/);
 assert.match(riskViolationTime('2026-12-05T12:52:00Z','America/New_York'),/7:52 AM EST/);
 assert.match(riskViolationTime(utc,'UTC'),/12:52 PM UTC/);
});
