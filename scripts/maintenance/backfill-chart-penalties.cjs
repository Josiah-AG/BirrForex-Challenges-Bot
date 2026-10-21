// Run with DATABASE_URL and TZ=UTC. Defaults to read-only; --apply writes only
// chart penalty metadata after matching the existing published total exactly.
require('ts-node/register/transpile-only');
const fs=require('fs'),{Client}=require('pg');
const {balancesAtEntry}=require('../../src/utils/evaluationIntegrity');
const {qualifiedBalanceSeries}=require('../../src/utils/qualifiedBalanceSeries');
const c=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,query_timeout:30000,application_name:"chart-penalty-backfill"});
(async()=>{await c.connect();let locked=false;try{
locked=(await c.query('SELECT pg_try_advisory_lock(26092604,0) AS locked')).rows[0].locked;
if(!locked)throw Error('Pull workflow active; retry later');
const challenge=(await c.query('SELECT * FROM trading_challenges WHERE id=39')).rows[0];
const rules=(await c.query('SELECT rule_code,parameters FROM wp_challenge_rules WHERE challenge_id=39')).rows;
const registrations=(await c.query(`SELECT DISTINCT r.id,r.account_type,r.history_verified_balance,r.history_verified_through,r.history_sync_state FROM trading_registrations r JOIN wp_trades t ON t.registration_id=r.id WHERE r.challenge_id=39 AND t.is_qualified=false AND t.sl_check_result='fake_sl' AND t.violations::text LIKE '%deducted instead%'`)).rows;
const plan=[],skipped=[];
for(const reg of registrations){try{
 if((plan.length+skipped.length)%20===0)console.log("Checked",plan.length+skipped.length,"of",registrations.length);
 const rule=rules.find(r=>r.rule_code===(challenge.type==='hybrid'&&challenge.split_category_settings?'config_'+reg.account_type:'config'))?.parameters;
 if(!rule)throw Error('Missing rules');
 const trades=(await c.query('SELECT id,ticket,position_id,open_time,close_time,profit,commission,swap,is_qualified,sl_check_result,violations,evaluation_penalty FROM wp_trades WHERE registration_id=$1 AND open_time >= $2 AND close_time <= $3 ORDER BY close_time,ticket',[reg.id,challenge.start_date,challenge.end_date])).rows;
 const affected=trades.filter(t=>t.is_qualified===false&&t.sl_check_result==='fake_sl'&&JSON.stringify(t.violations).includes('deducted instead'));
 if(!affected.length)continue;
 let balances;
 if(rule.max_risk_mode==='percentage'){
  if(!['verified','published'].includes(reg.history_sync_state))throw Error('History not verified');
  const ledger=(await c.query('SELECT ticket,position_id,entry,time,deal_type,profit,commission,swap,fee FROM wp_deals WHERE registration_id=$1 ORDER BY time,ticket',[reg.id])).rows;
  balances=balancesAtEntry(affected,ledger,Number(reg.history_verified_balance),reg.history_verified_through);
 }
 const updates=affected.map(t=>({id:t.id,old:t.evaluation_penalty,penalty:balances?balances.get(String(t.position_id??t.ticket))*Number(rule.max_risk_percent)/100:Number(rule.max_risk_dollars)}));
 if(updates.some(u=>!Number.isFinite(u.penalty)||u.penalty<=0))throw Error('Invalid reconstructed penalty');
 const published=(await c.query('SELECT * FROM wp_leaderboard WHERE registration_id=$1',[reg.id])).rows[0];
 if(!published)throw Error('No published balance');
 const proposed=trades.map(t=>({...t,evaluation_penalty:updates.find(u=>u.id===t.id)?.penalty??t.evaluation_penalty}));
 const chart=qualifiedBalanceSeries(Number(published.starting_balance),challenge.start_date,proposed,null);
 const last=chart.series.at(-1);
 if(Math.abs(last.gross-Number(published.current_balance))>0.011||Math.abs(last.adjusted-Number(published.adjusted_balance))>0.011)throw Error('Published balance does not reconcile');
 plan.push({registration:reg.id,updates,final:last.adjusted});
}catch(e){skipped.push({registration:reg.id,reason:e.message})}}
const audit='/tmp/wp-chart-penalties-'+Date.now()+'.json';fs.writeFileSync(audit,JSON.stringify({plan,skipped},null,2));
if(process.argv.includes('--apply')){
 await c.query('BEGIN');
 try{for(const item of plan)for(const u of item.updates)await c.query('UPDATE wp_trades SET evaluation_penalty=$1 WHERE id=$2 AND evaluation_penalty IS NOT DISTINCT FROM $3',[u.penalty,u.id,u.old]);await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}
}
console.log(JSON.stringify({applied:process.argv.includes('--apply'),registrations:plan.length,trades:plan.reduce((n,p)=>n+p.updates.length,0),markosss:plan.find(p=>p.registration===5719),skipped,audit}));
}finally{if(locked)await c.query('SELECT pg_advisory_unlock(26092604,0)');await c.end()}})().catch(e=>{console.error(e.message);process.exitCode=1});
