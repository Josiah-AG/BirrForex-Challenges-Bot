const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {balanceOperationTime:format}=require('../WinnerPip/winnerpip/lib/balanceOperationTime');
test('operation date and time follow challenge zone across midnight',()=>{
 const utc='2026-10-05T22:15:00Z';
 assert.match(format(utc,'Africa/Johannesburg'),/Oct 6, 2026.*00:15/);
 assert.match(format(utc,'America/New_York'),/Oct 5, 2026.*18:15/);
 assert.equal(format('invalid','UTC'),'Time unavailable');
});
