const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {pullBatchReport:report}=require('../src/utils/pullBatchReport');
const base={started_at:'2026-10-01T00:00:00Z',completed_at:'2026-10-01T00:02:55Z',new_trades_found:2};
test('balance checks report measured duration and warning count, including final notices',()=>{
 for(const error_log of ['balance_check','final_balance_warning'])assert.deepEqual(report({...base,error_log}),{isBalanceCheck:true,batchKind:'balance_check',durationSec:175,warningCount:2});
});
test('legacy identical balance timestamps have unknown duration',()=>assert.equal(report({...base,error_log:'balance_check',completed_at:base.started_at}).durationSec,null));
test('completed sub-second pulls retain valid zero instead of missing duration',()=>assert.equal(report({...base,completed_at:'2026-10-01T00:00:00.100Z'}).durationSec,0));
test('invalid, reversed and unfinished times are unknown',()=>{for(const completed_at of [null,'invalid','2026-09-30T23:59:59Z'])assert.equal(report({...base,completed_at}).durationSec,null);});
test('ordinary pulls do not interpret trade count as balance warnings',()=>{assert.equal(report(base).warningCount,0);assert.equal(report({...base,error_log:'pre_start_check'}).batchKind,'pre_start_check');});
