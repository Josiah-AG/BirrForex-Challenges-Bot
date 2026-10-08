const {test}=require('node:test');
const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {brokerCashOperationType}=require('../src/utils/brokerCashOperation');
test('broker dividends never become customer funding',()=>{
 for(const t of ['deposit','withdrawal','adjustment']) assert.equal(brokerCashOperationType(t,' DIV-US500-1368369 '),'dividend');
 assert.equal(brokerCashOperationType('deposit','div-ustec-123'),'dividend');
 assert.equal(brokerCashOperationType('dividend','native'),'dividend');
 for(const c of ['D-trial-USD-123','W-trial-USD-123','Dividend savings deposit','DIV-','Archived deals']) assert.equal(brokerCashOperationType('deposit',c),'deposit');
});
