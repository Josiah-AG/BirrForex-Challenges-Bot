// DATABASE_URL and BROKER_ENCRYPTION_KEY must be supplied securely by the operator.
// Usage: preview|apply|restore PRIVATE_JOURNAL_PATH. Never logs credential values.
const fs=require('node:fs');const {Client}=require('pg');
const {changes,checkRestore}=require('./repair-journal.cjs');
require('ts-node/register/transpile-only');
const {encrypt,decrypt}=require('../src/utils/encryption');
const [mode,journalPath]=process.argv.slice(2);
if(!['preview','apply','restore'].includes(mode)||!journalPath||!process.env.DATABASE_URL)throw Error('Usage: preview|apply|restore PRIVATE_JOURNAL_PATH with database and encryption environment');
const fields=['broker_email_encrypted','broker_password_encrypted','broker_api_key_encrypted'];
const local=['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname);
const client=new Client({connectionString:process.env.DATABASE_URL,ssl:local?false:{rejectUnauthorized:false}});
(async()=>{await client.connect();try{
 await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
 await client.query('SELECT pg_advisory_xact_lock(26092606,0)');
 if(mode==='restore'){
  const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));
  if(journal.kind!=='broker-cipher-v2')throw Error('Wrong journal');
  // Check every record before restoring any of them. Concurrent credential changes abort all restoration.
  for(const change of journal.changes){
   if(change.table!=='hosts'||change.wholeRow||Object.keys(change.before).some(k=>!fields.includes(k)))throw Error('Invalid journal fields');
   const row=(await client.query('SELECT * FROM hosts WHERE id=$1 FOR UPDATE',[change.id])).rows[0];checkRestore(change,row);
  }
  for(const change of journal.changes){const keys=Object.keys(change.before);await client.query(`UPDATE hosts SET ${keys.map((key,i)=>`${key}=$${i+1}`).join(',')} WHERE id=$${keys.length+1}`,[...keys.map(key=>change.before[key]),change.id]);}
  await client.query('COMMIT');console.log(JSON.stringify({restored:journal.changes.length}));return;
 }
 const before=(await client.query(`SELECT id,encryption_iv,${fields.join(',')} FROM hosts WHERE has_broker_integration=true ORDER BY id FOR UPDATE`)).rows;
 const after=before.map(row=>{const updated={...row};for(const field of fields){if(row[field]&&!row[field].startsWith('v2:')){const plain=decrypt(row[field],row.encryption_iv);updated[field]=encrypt(plain);if(decrypt(updated[field],row.encryption_iv)!==plain)throw Error('Encryption roundtrip failed');}}return updated;});
 const diff=changes({hosts:before},{hosts:after});
 if(mode==='preview'){await client.query('ROLLBACK');console.log(JSON.stringify({hostsToMigrate:diff.length,fields:diff.reduce((n,d)=>n+Object.keys(d.before).length,0)}));return;}
 const fd=fs.openSync(journalPath,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({kind:'broker-cipher-v2',createdAt:new Date().toISOString(),changes:diff}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 for(const change of diff){const keys=Object.keys(change.after);await client.query(`UPDATE hosts SET ${keys.map((key,i)=>`${key}=$${i+1}`).join(',')} WHERE id=$${keys.length+1}`,[...keys.map(key=>change.after[key]),change.id]);}
 await client.query('COMMIT');console.log(JSON.stringify({migratedHosts:diff.length,journalWritten:true}));
 }catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
})().catch(error=>{console.error('Cipher operation failed:',error.message);process.exitCode=1;});
