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
 const challenge={start_date:'2026-09-01T00:00:00Z',end_date: options.ended ? '2026-09-26T00:00:00Z' : '2099-01-01T00:00:00Z',status:options.ended?'completed':'active',timezone:options.timezone || 'UTC'};
 query=async(sql,params=[])=>{
  if (/^(UPDATE|INSERT|DELETE)/.test(sql.trim())) {writes.push({sql,params});return {rows:[],rowCount:1};}
  if (sql.includes('FROM trading_challenges')) return {rows:[challenge]};
  if (sql.includes('FROM wp_trades')) return {rows:trades};
  if (sql.includes('FROM wp_deals') && options.fundingFailure)throw new Error('synthetic funding read failure');
  if (sql.includes('FROM wp_deals')) return {rows:options.deposits || []};
  if (sql.includes('FROM trading_registrations')) return {rows:[{registration_balance:options.regBalance ?? 1000,actual_starting_balance:options.savedActual === undefined ? 1000 : options.savedActual,last_known_balance:1000,disqualified:false,last_known_equity:1000}]};
  if (sql.includes('FROM wp_balance_ops')) return {rows:options.balanceOps || []};
  if (sql.includes('FROM wp_pull_errors')) return {rows:[]};
  if (sql.includes('wp_ohlc')) return {rows:[]};
  throw new Error(`Unexpected test query: ${sql}`);
 };
 engine.upsertLeaderboard=async(_c,_r,_b,data)=>{summary=data;};
 engine.notifyDailyDrawdown=async()=>{};
 engine.notifyDqByEmail=async()=>{};
 const result=await engine.evaluateAccount(1,{id:1,account_number:'test',nickname:'test',account_type:'real',is_cent:false},rules,options.startingBalance || 1000,1000,'fixed',null,false,true);
 return {result,summary,writes,flags:writes.filter(w=>w.sql.startsWith('UPDATE wp_trades SET is_qualified')).flatMap(w=>JSON.parse(w.params[1]))};
}

test('unchanged late funding remains valid on repeated evaluations',async()=>{
 const options={regBalance:0,savedActual:null,startingBalance:100,deposits:[{profit:100,time:'2026-09-02T00:00:00Z'}]};
 const first=await evaluate(base(),[trade(1)],options), second=await evaluate(base(),[trade(1)],{...options,savedActual:100});
 for(const r of [first,second])assert(!r.writes.some(w=>w.sql.includes('SET disqualified = true')));
 assert.equal(first.summary.adjustedBalance,second.summary.adjustedBalance);
});
test('partial closes do not evade max position lot limit',async()=>{
 const r=base();r.rules_enabled.max_lot_size=true;r.max_lot_size=.6;
 const result=await evaluate(r,[trade(1,{position_id:42,volume:.5}),trade(2,{position_id:42,volume:.5})]);
 assert.equal(result.result.flaggedCount,2);
});
test('daily loss follows realized closing order and latest close drives tie-break',async()=>{
 const r=base();r.rules_enabled.daily_loss_cap=true;r.daily_loss_cap=10;
 const result=await evaluate(r,[trade(1,{profit:10,open_time:'2026-09-25T08:00:00Z',close_time:'2026-09-25T12:00:00Z'}),trade(2,{profit:-15,open_time:'2026-09-25T09:00:00Z',close_time:'2026-09-25T10:00:00Z'})]);
 assert(result.flags.some(f=>f.includes('drawdown breach')));
 assert.equal(result.summary.lastTradeTime,'2026-09-25T12:00:00Z');
});
test('percentage daily loss trails actual day opening balance',async()=>{
 const r=base();r.rules_enabled.daily_loss_cap=true;r.daily_loss_mode='percentage';r.daily_loss_percent=10;
 const result=await evaluate(r,[trade(1,{profit:-7}),trade(2,{profit:1,open_time:'2026-09-25T09:00:00Z',close_time:'2026-09-25T09:15:00Z'})],{startingBalance:100,regBalance:50,savedActual:50});
 assert(result.flags.some(f=>f.includes('drawdown breach')));
});

test('unavailable funding history fails evaluation instead of using a configured fallback',async()=>{
 await assert.rejects(()=>evaluate(base(),[trade(1)],{fundingFailure:true}),/Funding verification failed/);
});
test('daily cap resets at challenge-local midnight rather than UTC midnight',async()=>{
 const rules=base();rules.rules_enabled.daily_loss_cap=true;rules.daily_loss_cap=10;
 const trades=[trade(1,{profit:-7,open_time:'2026-09-25T20:00:00Z',close_time:'2026-09-25T20:30:00Z'}),trade(2,{profit:-7,open_time:'2026-09-25T21:00:00Z',close_time:'2026-09-25T21:30:00Z'}),trade(3,{profit:1,open_time:'2026-09-25T22:00:00Z',close_time:'2026-09-25T22:30:00Z'})];
 const local=await evaluate(rules,trades,{timezone:'Africa/Addis_Ababa'});
 assert(!local.flags.some(f=>f.includes('drawdown breach')));
 const utc=await evaluate(rules,trades,{timezone:'UTC'});
 assert(utc.flags.some(f=>f.includes('drawdown breach')));
});

test('a prior-day withdrawal lowers the next actual opening-balance percentage cap',async()=>{
 const rules=base();rules.rules_enabled.daily_loss_cap=true;rules.daily_loss_mode='percentage';rules.daily_loss_percent=10;
 const result=await evaluate(rules,[trade(1,{profit:-7}),trade(2,{profit:1,close_time:'2026-09-25T09:00:00Z'})],{regBalance:100,savedActual:100,startingBalance:100,balanceOps:[{op_time:'2026-09-24T08:00:00Z',amount:-50}]});
 assert(result.flags.some(f=>f.includes('drawdown breach')));
});
