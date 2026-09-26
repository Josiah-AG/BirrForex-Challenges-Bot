const assert=require('node:assert/strict'),crypto=require('crypto'),fs=require('fs'),os=require('os'),path=require('path');
const {execFileSync,spawnSync}=require('node:child_process');const {Client}=require('pg');
const url=process.env.TEST_DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local synthetic database required');
const env={...process.env,DATABASE_URL:url,BROKER_ENCRYPTION_KEY:'synthetic-cipher-test'};
const key=crypto.createHash('sha256').update(env.BROKER_ENCRYPTION_KEY).digest(),iv=crypto.randomBytes(16);
function legacy(value){const c=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([c.update(value),c.final()]);return c.getAuthTag().toString('base64')+':'+body.toString('base64');}
const before=['email@synthetic.invalid','synthetic-password','synthetic-api-key'].map(legacy);
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'cipher-rollback-'));fs.chmodSync(folder,0o700);
const journal=path.join(folder,'journal.json');const client=new Client({connectionString:url});let id;
(async()=>{await client.connect();try{
 id=(await client.query(`INSERT INTO hosts(display_name,email,password_hash,has_broker_integration,encryption_iv,broker_email_encrypted,broker_password_encrypted,broker_api_key_encrypted) VALUES('synthetic rollback',$1,'synthetic',true,$2,$3,$4,$5) RETURNING id`,[`cipher-${Date.now()}@test.invalid`,iv.toString('hex'),...before])).rows[0].id;
 const run=(mode,file=journal)=>execFileSync(process.execPath,['scripts/migrate-broker-ciphers.cjs',mode,file],{env,stdio:'pipe'});
 run('apply');const current=(await client.query('SELECT * FROM hosts WHERE id=$1',[id])).rows[0];
 const fields=['broker_email_encrypted','broker_password_encrypted','broker_api_key_encrypted'];
 assert(fields.every(f=>current[f].startsWith('v2:')));assert.equal(new Set(fields.map(f=>current[f].split(':')[1])).size,3);
 run('restore');const restored=(await client.query('SELECT * FROM hosts WHERE id=$1',[id])).rows[0];assert.deepEqual(fields.map(f=>restored[f]),before);
 const conflict=path.join(folder,'conflict.json');run('apply',conflict);await client.query("UPDATE hosts SET broker_password_encrypted='newer-edit' WHERE id=$1",[id]);
 const attempt=spawnSync(process.execPath,['scripts/migrate-broker-ciphers.cjs','restore',conflict],{env,encoding:'utf8'});assert.notEqual(attempt.status,0);assert.match(attempt.stderr,/Restore conflict/);
 assert.equal((await client.query('SELECT broker_password_encrypted FROM hosts WHERE id=$1',[id])).rows[0].broker_password_encrypted,'newer-edit');
 console.log('PASS: cipher migration uses independent nonces, exact rollback succeeds, concurrent credential edits block restoration');
 }finally{if(id)await client.query('DELETE FROM hosts WHERE id=$1',[id]);await client.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
