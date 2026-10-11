const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {priceMoveValue,declaredStopRisk,allowedRiskPrice}=require('../src/utils/tradeRiskUnits');
test('standard m suffix does not reduce risk 100 fold',()=>{
 assert.equal(declaredStopRisk('XAUUSDm',1,2000,1990,2010,1000),1000);
 assert.equal(declaredStopRisk('XAUUSDm',1,2000,1990,2000,0),1000);
});
test('standard and cent accounts retain their native money and lot units',()=>{
 const usd=declaredStopRisk('EURUSDm',0.01,1.1,1.09,1.11,10);
 const usc=declaredStopRisk('EURUSDc',1,1.1,1.09,1.11,1000);
 assert(Math.abs(usd-10)<1e-8);assert(Math.abs(usc-1000)<1e-8);assert(Math.abs(usc/100-usd)<1e-8);
});
test('partial closes scale risk to total position volume and shrink allowed price distance',()=>{
 assert.equal(declaredStopRisk('XAUUSDm',1,2000,1990,2010,200,0.2),1000);
 assert.equal(allowedRiskPrice('XAUUSDm',1,2000,100,true,2010,200,0.2),1999);
 assert.equal(allowedRiskPrice('XAUUSDm',0.2,2000,100,true,2010,200,0.2),1995);
});
test('non-USD quoted pairs use broker P/L conversion rather than a USD pip assumption',()=>{
 assert.equal(priceMoveValue('USDJPYm',1,150,151,666.67),666.67);
 assert.equal(declaredStopRisk('USDJPYm',1,150,149,151,666.67),666.67);
 assert.equal(priceMoveValue('EURJPYm',1,150,150,0),null);
});
test('instrument-specific broker P/L supports indices and crypto without invented contract sizes',()=>{
 assert.equal(declaredStopRisk('USTECm',2,20000,19900,20100,200,2),200);
 assert.equal(declaredStopRisk('BTCUSDc',1,60000,59000,61000,1000),1000);
 assert.equal(priceMoveValue('unknown',1,1,1,0),null);
});
