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

test('native charge codes do not get mislabeled as deposits or withdrawals',()=>{
 for(const [code,label] of Object.entries({4:'fee',7:'commission',8:'commission',9:'commission',10:'commission',11:'commission',12:'interest',15:'dividend',16:'dividend',17:'tax'}))assert.equal(brokerCashOperationType('adjustment','',code),label);
 assert.equal(brokerCashOperationType('deposit','D-trial',2),'deposit');
 assert.equal(brokerCashOperationType('adjustment','Archived deals',5),'adjustment');
});
