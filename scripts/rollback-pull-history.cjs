/* Default: transactional preview, rolled back. Apply only with the scheduler stopped.
   DATABASE_URL=... node scripts/rollback-pull-history.cjs [--apply] [registration-id]
   Uses changed-field comparisons; refuses to overwrite later edits. */
const {Client}=require('pg');
const {changes,checkRestore}=require('./repair-journal.cjs');
const release='2026-09-26-history-v2';
const tables={registration:'trading_registrations',trades:'wp_trades',deals:'wp_deals',balance_ops:'wp_balance_ops',leaderboard:'wp_leaderboard',staging:'wp_leaderboard_staging',publication:'wp_account_publications'};
const q=s=>'"'+s.replace(/"/g,'""')+'"';
function flatten(state){return Object.fromEntries(Object.entries(tables).map(([k,t])=>[t,(Array.isArray(state[k])?state[k]:state[k]?[state[k]]:[]).map(r=>({...r,id:r.id??r.registration_id}))]));}
async function rollback(client,apply=false,id){
 await client.query('BEGIN');
 try{
  const lock=await client.query('SELECT pg_try_advisory_xact_lock(26092604,0) AS ok');
  if(!lock.rows[0].ok)throw Error('An update is running; no rollback performed');
  const journals=(await client.query(`SELECT * FROM wp_pull_operations WHERE release_id=$1 AND restored_at IS NULL${id?' AND registration_id=$2':''} ORDER BY id DESC FOR UPDATE`,id?[release,id]:[release])).rows;
  let changedRows=0;
  for(const j of journals){
   for(const c of changes(flatten(j.before_state),flatten(j.after_state))){
    const key=c.table==='wp_account_publications'?'registration_id':'id';
    const row=(await client.query(`SELECT to_jsonb(t) AS row FROM ${q(c.table)} t WHERE ${q(key)}=$1 FOR UPDATE`,[c.id])).rows[0]?.row;
    checkRestore(c,row?{...row,id:row.id??row.registration_id}:null);
    changedRows++;
    if(!c.before){await client.query(`DELETE FROM ${q(c.table)} WHERE ${q(key)}=$1`,[c.id]);continue;}
    const fields=Object.keys(c.before).filter(k=>!(key==='registration_id'&&k==='id'));
    if(!c.after)await client.query(`INSERT INTO ${q(c.table)} (${fields.map(q).join(',')}) SELECT ${fields.map(q).join(',')} FROM jsonb_populate_record(NULL::${q(c.table)},$1::jsonb)`,[JSON.stringify(c.before)]);
    else await client.query(`UPDATE ${q(c.table)} SET (${fields.map(q).join(',')})=(SELECT ${fields.map(q).join(',')} FROM jsonb_populate_record(NULL::${q(c.table)},$1::jsonb)) WHERE ${q(key)}=$2`,[JSON.stringify(c.before),c.id]);
   }
   await client.query('UPDATE wp_pull_operations SET restored_at=NOW() WHERE id=$1',[j.id]);
  }
  await client.query(apply?'COMMIT':'ROLLBACK');
  return {accounts:new Set(journals.map(j=>j.registration_id)).size,changedRows,applied:apply,rankingRecalculationRequired:apply&&changedRows>0};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
module.exports={rollback,flatten};
if(require.main===module){
 const client=new Client({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
 const id=process.argv.slice(2).find(x=>/^\d+$/.test(x));
 (async()=>{await client.connect();try{console.log(await rollback(client,process.argv.includes('--apply'),id?Number(id):undefined));}finally{await client.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
}
