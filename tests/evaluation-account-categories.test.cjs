const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let challenge,registration;
const id=require.resolve('../src/database/db');require.cache[id]={id,filename:id,loaded:true,exports:{db:{query:async sql=>({rows:[sql.includes('FROM trading_challenges')?challenge:registration]})}}};
const cfg=require.resolve('../src/config');require.cache[cfg]={id:cfg,filename:cfg,loaded:true,exports:{config:{}}};
const {WpEvaluationEngine}=require('../src/services/wpEvaluationEngine');
const rules={only_cent_account:false,max_lot_size:0.02,max_risk_dollars:10,daily_loss_cap:30,max_risk_mode:'percentage',max_risk_percent:10,daily_loss_mode:'percentage',daily_loss_percent:30};
const base={type:'hybrid',starting_balance:10,target_balance:60,deposit_mode:'min_limit',target_percent:50,target_enabled:true};
async function check(type,isCent,onlyCent=false,settings={}){
 challenge={...base,...settings};registration={id:1,account_type:type,is_cent:isCent};const e=new WpEvaluationEngine();e.requireRules=async(_id,c,t)=>{assert.equal(t,type);return {...rules,only_cent_account:onlyCent};};
 let args;e.evaluateAccount=async(...a)=>{args=a;return {};};await e.evaluateSingleUnlocked(39,1);return args;
}
test('Sprint hybrid demo and standard real use identical dollar rules',async()=>{
 for(const t of ['demo','real']){const a=await check(t,false);assert.equal(a[3],10);assert.equal(a[4],60);assert.equal(a[2].max_risk_percent,10);assert.equal(a[2].daily_loss_percent,30);assert.equal(a[6],50);}
});
test('hybrid cent scales monetary and lot limits once, never percentage rules',async()=>{
 const a=await check('real',true);assert.equal(a[3],1000);assert.equal(a[4],6000);assert.equal(a[2].max_lot_size,2);assert.equal(a[2].max_risk_dollars,1000);assert.equal(a[2].daily_loss_cap,3000);assert.equal(a[2].max_risk_percent,10);assert.equal(a[2].daily_loss_percent,30);assert.equal(a[6],50);
});
test('real cent-only configuration already in cents is not multiplied again',async()=>{
 const a=await check('real',true,true,{type:'real'});assert.equal(a[3],10);assert.equal(a[2].daily_loss_cap,30);assert.equal(a[2].max_lot_size,.02);
});
test('split hybrid categories retain independent balance and target modes',async()=>{
 const split={split_category_settings:true,demo_starting_balance:1000,demo_target_balance:1500,demo_deposit_mode:'fixed',demo_target_enabled:true,demo_allow_below_start:false,real_starting_balance:20,real_target_balance:0,real_deposit_mode:'min_limit',real_target_percent:25,real_target_enabled:true,real_allow_below_start:false};
 const demo=await check('demo',false,false,split),real=await check('real',true,false,split);
 assert.equal(demo[3],1000);assert.equal(demo[4],1500);assert.equal(demo[5],'fixed');assert.equal(real[3],2000);assert.equal(real[5],'min_limit');assert.equal(real[6],25);
});
