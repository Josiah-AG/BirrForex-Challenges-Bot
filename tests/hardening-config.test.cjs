const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {validateRules,validateChallenge}=require('../src/utils/configValidation');
const {resolveCategoryBalances}=require('../src/utils/categorySettings');
const {peakPositionVolume}=require('../src/utils/positionExposure');
const keys=['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'];
const rules=()=>({stop_loss_required:false,weekend_trading:true,only_cent_account:false,allow_professional:false,rules_enabled:Object.fromEntries(keys.map(k=>[k,false]))});
test('rule validation rejects invalid retained values and incomplete switches',()=>{
 validateRules(rules());
 for(const bad of [{max_lot_size:-1},{max_open_trades:1.5},{max_risk_mode:'other'},{rules_enabled:{max_lot_size:false}}])assert.throws(()=>validateRules({...rules(),...bad}));
 assert.throws(()=>validateRules({...rules(),rules_enabled:{...rules().rules_enabled,max_lot_size:true}}));
});
test('split balances never inherit any other category values',()=>{
 const c={type:'hybrid',split_category_settings:true,starting_balance:100,target_balance:200,demo_starting_balance:50,demo_target_balance:0,demo_deposit_mode:'fixed',demo_target_enabled:false,demo_allow_below_start:true};
 assert.equal(resolveCategoryBalances(c,'demo').targetBalance,0);
 assert.throws(()=>resolveCategoryBalances(c,'real'),/Missing independent/);
});
test('creation rejects inverted dates and incomplete independent rules',()=>{
 const c={title:'synthetic',type:'demo',start_date:'2026-09-01',end_date:'2026-10-01',starting_balance:100,target_balance:0,target_enabled:false,rules:rules()};
 validateChallenge(c);
 assert.throws(()=>validateChallenge({...c,end_date:'2026-08-01'}));
 assert.throws(()=>validateChallenge({...c,timezone:'Not/AZone'}));
});
test('position exposure handles partial closes, scale-ins and incomplete history',()=>{
 const d=(ticket,entry,volume)=>({ticket,entry,volume,time:`2026-09-01T0${ticket}:00:00Z`});
 assert.equal(peakPositionVolume([d(1,0,1),d(2,1,.5),d(3,1,.5)]),1);
 assert.equal(peakPositionVolume([d(1,0,.5),d(2,1,.3),d(3,0,.5),d(4,1,.7)]),.7);
 assert.equal(peakPositionVolume([d(1,1,.5)]),null);
 assert.equal(peakPositionVolume([d(1,null,.5)]),null);
});

test('account units preserve real-only cent configuration and convert hybrid cents',()=>{
 const {accountUnitMultiplier}=require('../src/utils/accountUnits');
 assert.equal(accountUnitMultiplier({type:'real'},{only_cent_account:true},true),1);
 assert.equal(accountUnitMultiplier({type:'hybrid'},{only_cent_account:true},true),100);
 assert.equal(accountUnitMultiplier({type:'real'},{only_cent_account:false},true),100);
 assert.equal(accountUnitMultiplier({type:'demo'},{only_cent_account:false},false),1);
});

test('unused category absolute targets become explicit zero without inheriting shared settings',()=>{
 const {normalizeChallengeInput}=require('../src/utils/configValidation');
 const input={target_balance:900,real_target_balance:null,real_target_enabled:false,demo_target_balance:null,demo_deposit_mode:'min_limit'};
 const result=normalizeChallengeInput(input);assert.equal(result.real_target_balance,0);assert.equal(result.demo_target_balance,0);assert.equal(result.target_balance,900);
 assert.equal(normalizeChallengeInput({target_balance:null,target_enabled:true,deposit_mode:'fixed'}).target_balance,null,'required fixed target remains invalid');
});
