const { test } = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const dbPath = require.resolve('../src/database/db');
let query = async () => { throw new Error('No test database configured'); };
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { db: { query: (...args) => query(...args) } } };
const configPath = require.resolve('../src/config');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { config: {} } };
const { WpEvaluationEngine } = require('../src/services/wpEvaluationEngine');
const { isRuleEnabled } = require('../src/utils/rulePolicy');
const keys = ['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'];
const base = () => ({ max_lot_size:.02,max_open_trades:1,pair_limit:1,stop_loss_required:true,max_risk_dollars:5,daily_loss_cap:10,max_hold_hours:1,min_trade_duration_minutes:20,weekend_trading:false,min_active_days:1000,min_total_trades:10,only_cent_account:false,allow_professional:false,rules_enabled:Object.fromEntries(keys.map(k=>[k,false])) });
const trade = (id, overrides={}) => ({id,ticket:id,position_id:id,symbol:'XAUUSDm',trade_type:'sell',volume:.1,profit:10,commission:0,swap:0,open_time:'2026-09-25T08:03:00Z',close_time:'2026-09-25T08:17:00Z',open_price:4270.279,close_price:4280.13,stop_loss:0,...overrides});
async function evaluate(rules, trades, options={}) {
 const engine = new WpEvaluationEngine();
 const writes=[]; let summary;
 const challenge={start_date:'2026-09-01T00:00:00Z',end_date: options.ended ? '2026-09-26T00:00:00Z' : '2099-01-01T00:00:00Z',status:options.ended?'completed':'active',timezone:'UTC'};
 query=async(sql,params=[])=>{
  if (/^(UPDATE|INSERT|DELETE)/.test(sql.trim())) {writes.push({sql,params});return {rows:[],rowCount:1};}
  if (sql.includes('FROM trading_challenges')) return {rows:[challenge]};
  if (sql.includes('FROM wp_trades')) return {rows:trades};
  if (sql.includes('FROM wp_deals')) return {rows:[]};
  if (sql.includes('FROM trading_registrations')) return {rows:[{registration_balance:1000,actual_starting_balance:1000,last_known_balance:1000,disqualified:false,last_known_equity:1000}]};
  if (sql.includes('FROM wp_pull_errors')) return {rows:[]};
  if (sql.includes('wp_ohlc')) return {rows:[]};
  throw new Error(`Unexpected test query: ${sql}`);
 };
 engine.upsertLeaderboard=async(_c,_r,_b,data)=>{summary=data;};
 engine.notifyDailyDrawdown=async()=>{};
 engine.notifyDqByEmail=async()=>{};
 const result=await engine.evaluateAccount(1,{id:1,account_number:'test',nickname:'test',account_type:'real',is_cent:false},rules,1000,1000,'fixed',null,false,true);
 return {result,summary,writes,flags:writes.filter(w=>w.sql.startsWith('UPDATE wp_trades SET is_qualified')).flatMap(w=>JSON.parse(w.params[1]))};
}
test('all OFF: screenshot loss is counted without a flag or extra deduction',async()=>{
 const r=await evaluate(base(),[trade(2722833495,{profit:-98.51,sl_check_pending:true,sl_check_result:'conflicting'})]);
 assert.equal(r.result.flaggedCount,0);assert.equal(r.summary.profitRemoved,0);assert.equal(r.summary.adjustedBalance,901.49);
 assert(r.writes.some(w=>w.sql.includes("sl_check_result = 'skipped'")));
});
for(const [key,trades,pattern] of [
 ['max_lot_size',[trade(1)],/Lot size/],
 ['max_open_trades',[trade(1),trade(2)],/simultaneous open/],
 ['pair_limit',[trade(1),trade(2)],/simultaneous XAU/],
 ['stop_loss_required',[trade(1,{profit:-98.51})],/Maximum risk exceeded/],
 ['daily_loss_cap',[trade(1,{profit:-20}),trade(2,{open_time:'2026-09-25T09:00:00Z',close_time:'2026-09-25T09:15:00Z'})],/drawdown breach/],
 ['max_hold_hours',[trade(1,{close_time:'2026-09-25T11:00:00Z'})],/Held/],
 ['min_trade_duration',[trade(1)],/below minimum/],
 ['weekend_trading',[trade(1,{symbol:'BTCUSD',open_time:'2026-09-26T08:03:00Z',close_time:'2026-09-26T08:17:00Z'})],/Weekend/],
]) test(`${key}: ON enforces; OFF ignores retained values`,async()=>{
 const off=await evaluate(base(),trades);assert.equal(off.result.flaggedCount,0);
 const rules=base();rules.rules_enabled[key]=true;
 const on=await evaluate(rules,trades);assert(on.flags.some(f=>pattern.test(f)),JSON.stringify(on.flags));
});
for(const key of ['min_active_days','min_total_trades']) test(`${key}: OFF does not disqualify; ON enforces requirement`,async()=>{
 const off=await evaluate(base(),[trade(1)],{ended:true});assert(!off.writes.some(w=>w.sql.includes('SET disqualified = true')));
 const rules=base();rules.rules_enabled[key]=true;
 const on=await evaluate(rules,[trade(1)],{ended:true});assert(on.writes.some(w=>w.sql.includes('SET disqualified = true')));
});
test('split rules never fall back to shared, and missing rules do not write defaults',async()=>{
 const seen=[];query=async(sql,params)=>{seen.push({sql,params});return {rows: params[1]==='config_demo' ? [{parameters:base()}]:[]};};
 const engine=new WpEvaluationEngine();const challenge={type:'hybrid',split_category_settings:true};
 await engine.requireRules(1,challenge,'demo');await assert.rejects(engine.requireRules(1,challenge,'real'),/config_real/);
 assert.deepEqual(seen.map(q=>q.params[1]),['config_demo','config_real']);assert(seen.every(q=>q.sql.startsWith('SELECT')));
});
test('legacy absent enable map remains compatible; explicit OFF wins',()=>{
 assert.equal(isRuleEnabled({},'max_lot_size'),true);assert.equal(isRuleEnabled(base(),'max_lot_size'),false);
});
test('percentage risk OFF ignores retained percent; ON uses actual starting balance',async()=>{
 const rules={...base(),max_risk_mode:'percentage',max_risk_percent:1};
 assert.equal((await evaluate(rules,[trade(1,{profit:-20})])).result.flaggedCount,0);
 rules.rules_enabled.stop_loss_required=true;
 assert((await evaluate(rules,[trade(1,{profit:-20})])).flags.some(f=>f.includes('1% ($10.00)')));
});
test('mixed settings: disabling one rule does not disable another',async()=>{
 const rules=base();rules.rules_enabled.min_trade_duration=true;
 const r=await evaluate(rules,[trade(1,{volume:100000})]);assert(r.flags.every(f=>f.includes('below minimum')));
});
test('non-split rule display selects its single config even when client requests category',async()=>{
 const codes=[];query=async(sql,params)=> sql.includes('wp_challenge_rules') ? (codes.push(params[1]),{rows:[{parameters:base()}]}) : {rows:[{type:'demo',split_category_settings:false}]};
 const r=await new WpEvaluationEngine().getRulesForDisplay(1,'config_demo');assert.equal(r.hasActiveRules,false);assert.deepEqual(codes,['config']);
});
test('split rule display cannot show shared rules',async()=>{
 query=async()=>({rows:[{type:'hybrid',split_category_settings:true}]});
 await assert.rejects(new WpEvaluationEngine().getRulesForDisplay(1,'config'),/Select Demo or Real/);
});
test('manual engine: weekend and arbitrarily large lot disabled really skip',()=>{
 const {evaluateAccount}=require('../src/services/evaluationEngine');
 const cfg={challengeStartDate:'2026-09-01',challengeEndDate:'2026-09-30',startingBalanceLimit:1000,targetBalance:1000,maxLot:1,maxOpenTrades:1,maxSamePair:1,maxSlDollars:5,maxDailyLoss:10,maxHoldHours:1,minTradeDurationMinutes:20,minActiveDays:10,rules_enabled:base().rules_enabled,targetEnabled:false,allowBelowStart:true};
 const p={openTime:'2026-09-26 08:03:00',closeTime:'2026-09-26 08:17:00',positionId:'1',symbol:'BTCUSD',type:'buy',volume:1000000,profit:10,commission:0,swap:0};
 const off=evaluateAccount({},[p],[],1010,cfg);assert.equal(off.flaggedTrades.length,0);
 const on=evaluateAccount({},[p],[],1010,{...cfg,rules_enabled:{...cfg.rules_enabled,weekend_trading:true}});assert(on.flaggedTrades.some(t=>t.reasons.includes('Weekend trading')));
});
test('scheduler weekend collection runs when either independent category permits trading',async()=>{
 const {VpsPullScheduler}=require('../src/scheduler/vpsPullScheduler');const scheduler=Object.create(VpsPullScheduler.prototype);
 const demo=base(),real=base();demo.rules_enabled.weekend_trading=true;
 query=async(sql,params)=>sql.includes('wp_challenge_rules')?{rows:[{parameters:params[1]==='config_demo'?demo:real}]}:{rows:[{type:'hybrid',split_category_settings:true}]};
 assert.equal(await scheduler.isWeekendTradingAllowed(1),true);
 real.rules_enabled.weekend_trading=true;assert.equal(await scheduler.isWeekendTradingAllowed(1),false);
});
test('cent-account conversion preserves OFF switches and uses the right category',async()=>{
 const engine=new WpEvaluationEngine();let captured;
 const challenge={type:'hybrid',split_category_settings:true,starting_balance:1000,target_balance:2000,demo_starting_balance:1000,real_starting_balance:2000};
 const rules=base();query=async(sql,params)=>{
  if(sql.includes('wp_challenge_rules')) {assert.equal(params[1],'config_real');return {rows:[{parameters:rules}]};}
  if(sql.includes('FROM trading_registrations')) return {rows:[{id:2,account_type:'real',is_cent:true}]};
  return {rows:[challenge]};
 };
 engine.evaluateAccount=async(...args)=>{captured=args;return {flaggedCount:0,isQualified:false};};
 await engine.evaluateSingleAccount(1,2);assert.equal(captured[2].max_risk_dollars,500);assert.equal(captured[3],200000);assert.equal(captured[2].rules_enabled.stop_loss_required,false);
});
test('batch evaluation refuses missing category rules before any writes',async()=>{
 const {VpsPullScheduler}=require('../src/scheduler/vpsPullScheduler');const scheduler=Object.create(VpsPullScheduler.prototype);const seen=[];
 query=async(sql,params)=>{seen.push(sql);if(sql.includes('wp_challenge_rules'))return {rows:params[1]==='config_demo'?[{parameters:base()}]:[]};return {rows:[{type:'hybrid',split_category_settings:true}]};};
 await assert.rejects(scheduler.evaluateAllAccounts(1,[]),/config_real/);assert(seen.every(sql=>sql.startsWith('SELECT')));
});
