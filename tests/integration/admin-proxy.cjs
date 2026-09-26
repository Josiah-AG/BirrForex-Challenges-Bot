// Exercise the production Next build against a synthetic local backend only.
const assert=require('node:assert/strict');
const http=require('node:http');const {spawn}=require('node:child_process');const path=require('node:path');
const cwd=path.resolve(__dirname,'../../WinnerPip/winnerpip');
let next,valid=true,requests=0,errors='';
const backend=http.createServer((req,res)=>{
 requests++;res.setHeader('content-type','application/json');
 if(req.url==='/api/admin/synthetic-private-path/login')return res.end(JSON.stringify({success:true,token:'synthetic-session'}));
 assert.equal(req.url,'/api/admin/synthetic-private-path/session');
 assert.equal(req.headers.authorization,'Bearer synthetic-session');
 res.statusCode=valid?200:401;res.end(JSON.stringify({success:valid}));
});
(async()=>{
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 const port=18367,origin=`http://localhost:${port}`;
 next=spawn(process.execPath,[path.join(cwd,'node_modules/next/dist/bin/next'),'start','-H','localhost','-p',String(port)],{
  cwd,env:{...process.env,NODE_ENV:'production',WINNERPIP_ADMIN_PATH:'synthetic-private-path',WINNERPIP_URL:origin,API_URL:`http://127.0.0.1:${backend.address().port}`},stdio:['ignore','ignore','pipe']
 });next.stderr.on('data',chunk=>errors+=chunk);
 let ready=false;for(let i=0;i<100;i++){try{const response=await fetch(origin+'/api/management/session');if(response.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 assert(ready,errors);assert.equal(requests,0);
 assert.equal((await fetch(origin+'/admin/panel')).status,404);
 assert.equal((await fetch(origin+'/synthetic-private-path')).status,200,'private navigation is served with runtime configuration');
 assert.equal((await fetch(origin+'/api/management/login',{method:'POST',headers:{origin:'https://untrusted.invalid'}})).status,403);
 const login=await fetch(origin+'/api/management/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({key:'synthetic'})});
 assert.equal(login.status,200);assert.equal((await login.json()).token,undefined);
 const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=strict/i);assert.match(cookie,/Path=\/api\/management/i);
 const auth={cookie:'wp_admin_session=synthetic-session'};
 assert.equal((await fetch(origin+'/api/management/session',{headers:auth})).status,200);
 valid=false;
 const expired=await fetch(origin+'/api/management/session',{headers:auth});assert.equal(expired.status,401);assert.match(expired.headers.get('set-cookie'),/Path=\/api\/management/);assert.match(expired.headers.get('set-cookie'),/Max-Age=0/);
 console.log('PASS: production admin proxy enforces cookies and origin, hides session token, supports private runtime navigation and expires the correct cookie');
})().catch(e=>{console.error(e,errors);process.exitCode=1;}).finally(()=>{next?.kill('SIGTERM');backend.close();});
