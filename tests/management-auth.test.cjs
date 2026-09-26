const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
require('ts-node/register/transpile-only');
process.env.WINNERPIP_TOKEN_SECRET='synthetic-session-secret';
process.env.WINNERPIP_ADMIN_KEY='synthetic-admin-password';
process.env.BROKER_ENCRYPTION_KEY='synthetic-broker-key';
const {issueManagementSession,verifyManagementSession,equalSecret}=require('../src/utils/managementAuth');
const {encrypt,decrypt,generateIV}=require('../src/utils/encryption');
test('management tokens cannot cross roles, accept tampering or omit authentication',()=>{
 const token=issueManagementSession('admin');
 assert.equal(verifyManagementSession(token,'admin').role,'admin');
 assert.equal(verifyManagementSession(token,'host'),null);
 assert.equal(verifyManagementSession(token+'x','admin'),null);
 assert.equal(verifyManagementSession(undefined,'admin'),null);
 assert.equal(verifyManagementSession(token+'.extra','admin'),null);
 assert.equal(equalSecret('', ''),false);
});
test('admin password change revokes prior signed sessions',()=>{
 const token=issueManagementSession('admin');
 process.env.WINNERPIP_ADMIN_KEY='new-synthetic-password';
 assert.equal(verifyManagementSession(token,'admin'),null);
});
test('host sessions bind identity and revocation version; expiry is enforced',()=>{
 const token=issueManagementSession('host',42,7);
 assert.equal(verifyManagementSession(token,'host').version,7);
 const now=Date.now;Date.now=()=>now()+9*3600000;
 try {assert.equal(verifyManagementSession(token,'host'),null);}finally{Date.now=now;}
});
test('each new encrypted field has an independent nonce and authenticates ciphertext',()=>{
 const legacyIV=generateIV();const a=encrypt('same',legacyIV),b=encrypt('same',legacyIV);
 assert.notEqual(a.split(':')[1],b.split(':')[1]);
 assert.equal(decrypt(a,legacyIV),'same');
 const parts=a.split(':');parts[2]=Buffer.alloc(16).toString('base64');
 assert.throws(()=>decrypt(parts.join(':'),legacyIV));
});
test('new reader can still decrypt old broker records for reversible migration',()=>{
 const iv=generateIV(),key=crypto.createHash('sha256').update(process.env.BROKER_ENCRYPTION_KEY).digest();
 const cipher=crypto.createCipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
 const body=Buffer.concat([cipher.update('old credential'),cipher.final()]).toString('base64');
 assert.equal(decrypt(cipher.getAuthTag().toString('base64')+':'+body,iv),'old credential');
});
