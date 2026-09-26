// Real Express routing with synthetic credentials and no database or external requests.
const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
Object.assign(process.env,{NODE_ENV:'test',WINNERPIP_ADMIN_PATH:'synthetic-path',WINNERPIP_ADMIN_KEY:'synthetic-key',WINNERPIP_TOKEN_SECRET:'synthetic-token-secret',WINNERPIP_ADMIN_IPS:''});
const configPath=require.resolve('../../src/config');
require.cache[configPath]={id:configPath,filename:configPath,loaded:true,exports:{config:{}}};
const dbPath=require.resolve('../../src/database/db');
let queries=0,version=2,active=true,locked=false;
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:async(sql,params=[])=>{
 queries++;
 if(sql.includes('SELECT active, session_version FROM hosts'))return {rows:[{active,session_version:version}]};
 if(sql.includes('SELECT id,leaderboard_locked_at,status FROM trading_challenges'))return {rows:params[0]===42?[{id:42,leaderboard_locked_at:locked?new Date():null}]:[]};
 if(sql.includes('SELECT id FROM trading_registrations WHERE id=$1 AND challenge_id=$2'))return {rows:[]};
 throw new Error('Unexpected DB call in security test: '+sql);
}}}};
const axios=require('axios');for(const method of ['get','post','put','delete','request'])axios[method]=async()=>{throw new Error('External calls prohibited in security tests');};
const {app}=require('../../src/api/server');
const {issueManagementSession}=require('../../src/utils/managementAuth');
const server=app.listen(0,'127.0.0.1');
(async()=>{
 await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;let sequence=0;
 const request=async(path,method='GET',token)=>fetch(base+path,{method,headers:{'x-forwarded-for':`192.0.2.${++sequence%250+1}`,...(token?{authorization:'Bearer '+token}:{})}});
 const routes=app.router.stack.filter(x=>x.route && typeof x.route.path==='string' && x.route.path.startsWith('/api/admin/')).map(x=>x.route);
 let checked=0;
 for(const route of routes){
  if(route.path.endsWith('/login'))continue;
  const path=route.path.replace(/:[A-Za-z_]+/g,'1');
  for(const method of Object.keys(route.methods)){
   const response=await request(path,method.toUpperCase());
   assert.equal(response.status,401,`${method} ${path} requires login`);checked++;
  }
 }
 assert.equal(queries,0,'anonymous admin requests never reach database operations');
 for(const token of ['invalid',issueManagementSession('host',42,2)])assert.equal((await request('/api/admin/synthetic-path/session','GET',token)).status,401);
 const admin=issueManagementSession('admin');
 assert.equal((await request('/api/admin/synthetic-path/session','GET',admin)).status,200,'empty allowlist still permits authenticated access');
 assert.equal((await request('/api/host/challenges','GET',admin)).status,401,'admin session cannot become host session');
 const host=issueManagementSession('host',42,1);
 assert.equal((await request('/api/host/challenges','GET',host)).status,401,'old host revision revoked');
 version=1;active=false;
 assert.equal((await request('/api/host/challenges','GET',host)).status,401,'deactivated host revoked');
 active=true;
 assert.equal((await request('/api/host/challenge/99/full-overview','GET',host)).status,404,'another host challenge cannot be read');
 assert.equal((await request('/api/host/challenge/99/cancel-pull','POST',host)).status,404,'another host pull cannot be cancelled');
 assert.equal((await request('/api/host/challenge/42/pull-single-status?registrationId=999','GET',host)).status,404,'another challenge participant cannot be read');
 locked=true;
 assert.equal((await request('/api/host/challenge/42/re-evaluate-user','POST',host)).status,409,'host cannot change locked results');
 console.log(`PASS: ${checked} actual admin operations reject anonymous access; role, host revocation, and optional IP policy verified`);
})().then(()=>server.close(()=>process.exit(0))).catch(error=>{console.error(error);server.close(()=>process.exit(1));});
