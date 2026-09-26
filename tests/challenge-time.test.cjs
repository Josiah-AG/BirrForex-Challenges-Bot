const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {utcToWallClock,wallClockToUtcISO}=require('../WinnerPip/winnerpip/lib/challengeTime');
test('management dates roundtrip in the chosen zone rather than the browser or EAT',()=>{
 for(const zone of ['Africa/Johannesburg','Asia/Kolkata','America/New_York','Pacific/Auckland']){
  const date='2026-09-30T03:00:00.000Z';assert.equal(wallClockToUtcISO(utcToWallClock(date,zone),zone),date);
 }
});
test('ambiguous and nonexistent daylight-saving form dates are rejected',()=>{
 assert.throws(()=>wallClockToUtcISO('2026-03-08T02:30','America/New_York'),/does not exist/);
 assert.throws(()=>wallClockToUtcISO('2026-11-01T01:30','America/New_York'),/twice/);
});
