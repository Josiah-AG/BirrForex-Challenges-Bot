/* Usage: node scripts/repair-rules.cjs preview|apply|restore CHALLENGE_ID JOURNAL_PATH
 * Uses authenticated Railway CLI. APPLY/RESTORE require backend stopped via Railway.
 * Preview runs actual evaluation in a transaction and ALWAYS rolls it back.
 */
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {Client}=require('pg');const {changes,checkRestore}=require('./repair-journal.cjs');
const [mode,rawId,journalPath]=process.argv.slice(2);const challengeId=Number(rawId);
if(!['preview','roundtrip','apply','restore'].includes(mode)||!Number.isSafeInteger(challengeId)||challengeId<1||!journalPath) throw Error('Usage: preview|apply|restore CHALLENGE_ID JOURNAL_PATH');
const tables=['trading_registrations','wp_trades','wp_leaderboard_staging','wp_leaderboard'];
const quote=s=>'"'+s.replace(/"/g,'""')+'"';
const vars=JSON.parse(execFileSync('railway',['variables','--service','Postgres','--json'],{encoding:'utf8'}));
const client=new Client({connectionString:vars.DATABASE_PUBLIC_URL,connectionTimeoutMillis:10000});
async function snapshot() {
 const out={};for(const table of tables) out[table]=(await client.query(`SELECT to_jsonb(t) - 'investor_password' AS row FROM ${quote(table)} t WHERE challenge_id=$1 ORDER BY id`,[challengeId])).rows.map(r=>r.row);return out;
}
function save(value) {const fd=fs.openSync(journalPath,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function assertStopped() {
 const status=JSON.parse(execFileSync('railway',['status','--json'],{encoding:'utf8'}));
 const env=status.environments.edges.find(e=>e.node.name==='production')?.node;
 const backend=env?.serviceInstances.edges.find(e=>e.node.serviceName==='web')?.node;
 if(!backend) throw Error('Cannot identify backend service');
 const dep=backend.latestDeployment;
 if(dep && !dep.deploymentStopped && !['REMOVED','FAILED','CRASHED'].includes(dep.status)) throw Error('Stop backend service web before applying or restoring; no live repair while writers are running');
}
(async()=>{await client.connect();try {
 if(['apply','restore'].includes(mode)) assertStopped();
 await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='60s'");
 // Short transaction locks serialize snapshots/evaluation with any database writers.
 await client.query(`LOCK TABLE ${tables.map(quote).join(',')}, trading_challenges, wp_challenge_rules, wp_deals IN SHARE ROW EXCLUSIVE MODE`);
 const challenge=(await client.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId])).rows[0];
 if(!challenge) throw Error('Challenge missing');
 if((await client.query("SELECT 1 FROM wp_pull_batches WHERE challenge_id=$1 AND status='running'",[challengeId])).rowCount) throw Error('A pull/evaluation batch is running');
 if(mode==='restore') {
  const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));
  if(journal.challengeId!==challengeId||journal.mode!=='apply') throw Error('Wrong journal');
  for(const change of journal.changes) {
   if(!tables.includes(change.table)) throw Error('Invalid journal table');
   const current=(await client.query(`SELECT to_jsonb(t) - 'investor_password' AS row FROM ${quote(change.table)} t WHERE id=$1 AND challenge_id=$2`,[change.id,challengeId])).rows[0]?.row;
   checkRestore(change,current);
  }
  for(const change of journal.changes) {
   if(change.wholeRow) {
    if(change.before===null) await client.query(`DELETE FROM ${quote(change.table)} WHERE id=$1 AND challenge_id=$2`,[change.id,challengeId]);
    else throw Error('Automatic reinsertion refused; inspect deleted row in journal');
   } else {
    const fields=Object.keys(change.before);const values=fields.map(k=>change.before[k]);
    // jsonb_populate_record preserves PostgreSQL array/json/timestamp types.
    await client.query(`UPDATE ${quote(change.table)} t SET ${fields.map(k=>`${quote(k)}=r.${quote(k)}`).join(',')} FROM jsonb_populate_record(NULL::${quote(change.table)}, $1::jsonb) r WHERE t.id=$2 AND t.challenge_id=$3`,[JSON.stringify(change.before),change.id,challengeId]);
   }
  }
  await client.query('COMMIT');console.log(JSON.stringify({restored:true,challengeId,rows:journal.changes.length}));return;
 }
 const before=await snapshot();
 const rules=(await client.query('SELECT rule_code,parameters FROM wp_challenge_rules WHERE challenge_id=$1 ORDER BY rule_code',[challengeId])).rows;
 require('ts-node/register/transpile-only');
 const dbPath=require.resolve('../src/database/db');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:(...args)=>client.query(...args)}}};
 const configPath=require.resolve('../src/config');require.cache[configPath]={id:configPath,filename:configPath,loaded:true,exports:{config:{}}};
 const {evaluationEngine:engine}=require('../src/services/wpEvaluationEngine');
 const {leaderboardService}=require('../src/services/leaderboardService');
 engine.notifyDailyDrawdown=async()=>{};engine.notifyDqByEmail=async()=>{};
 // Current repair is deliberately limited to non-DQ accounts; no guessed DQ reversals.
 const regs=before.trading_registrations.filter(r=>!r.disqualified&&r.status!=='removed');
 for(const r of regs) {
  const effective=await engine.requireRules(challengeId,challenge,r.account_type);
  const keys=['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'];
  if(keys.some(k=>effective.rules_enabled?.[k]!==false)) throw Error('This repair is restricted to explicitly all-OFF rulesets; investigate other challenges separately');
 }
 for(const r of regs) {await engine.evaluateSingleAccount(challengeId,r.id);await engine.flushSingleAccountToLive(challengeId,r.id);}
 await leaderboardService.updateRankings(challengeId);
 const after=await snapshot();const diff=changes(before,after);
 // Safety: this repair must never change broker history, credentials, or account identity.
 if(diff.some(d=>d.table==='trading_registrations')) throw Error('Unexpected registration/account-state change; repair requires review');
 const rawTradeFields=['ticket','position_id','symbol','trade_type','volume','profit','commission','swap','open_time','close_time','open_price','close_price','stop_loss','take_profit'];
 for(const d of diff) if(d.table==='wp_trades'&&(d.wholeRow||rawTradeFields.some(k=>k in d.before))) throw Error('Unexpected raw trade mutation');
 const journal={version:1,mode,challengeId,createdAt:new Date().toISOString(),codeCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rules,before,changes:diff};
 save(journal); // Backup is durable on disk before COMMIT.
 if(mode==='roundtrip') {
  for(const change of diff) {
   const current=(await client.query(`SELECT to_jsonb(t) - 'investor_password' AS row FROM ${quote(change.table)} t WHERE id=$1`,[change.id])).rows[0]?.row;
   checkRestore(change,current);
   if(change.wholeRow) {
    if(change.before===null) await client.query(`DELETE FROM ${quote(change.table)} WHERE id=$1`,[change.id]);
    else throw Error('Deleted row requires manual restoration');
   } else {
    const fields=Object.keys(change.before);
    await client.query(`UPDATE ${quote(change.table)} t SET ${fields.map(k=>`${quote(k)}=r.${quote(k)}`).join(',')} FROM jsonb_populate_record(NULL::${quote(change.table)}, $1::jsonb) r WHERE t.id=$2`,[JSON.stringify(change.before),change.id]);
   }
  }
  require('node:assert/strict').deepEqual(await snapshot(),before);
  console.log('Verified: evaluation followed by journal restoration exactly reproduces the original records; transaction will roll back.');
 }
 if(mode==='apply') await client.query('COMMIT');else await client.query('ROLLBACK');
 console.log(JSON.stringify({mode,challengeId,accounts:regs.length,changedRows:diff.length,before:before.wp_leaderboard.map(r=>({id:r.id,flagged:r.flagged_trades,balance:r.adjusted_balance,rank:r.rank})),after:after.wp_leaderboard.map(r=>({id:r.id,flagged:r.flagged_trades,balance:r.adjusted_balance,rank:r.rank})),journal:journalPath}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{await client.end();}})().catch(e=>{console.error('Repair aborted:',e.message);process.exitCode=1;});
