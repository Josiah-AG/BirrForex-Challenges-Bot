const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let current,pending,updates;
const path=require.resolve('../src/database/db');
const db={transaction:async fn=>fn(),query:async(sql,args=[])=>{
 if(sql.startsWith('SELECT * FROM trading_challenges'))return {rows:[current]};
 if(sql.startsWith('SELECT token FROM challenge_approvals'))return {rows:pending&&pending.state==='pending'?[{token:pending.token}]:[]};
 if(sql.startsWith('SELECT * FROM challenge_approvals'))return {rows:pending?[pending]:[]};
 if(sql.startsWith('INSERT INTO challenge_approvals')){pending={token:args[0],kind:args[1],payload:JSON.parse(args[2]),state:'pending',created_at:new Date()};return {rows:[]};}
 if(sql.startsWith('UPDATE trading_challenges SET')){updates++; const keys=sql.split('SET ')[1].split(',updated_at')[0].split(',').map(v=>v.split('=')[0]);keys.forEach((k,i)=>current[k]=args[i]);return {rows:[{...current}]};}
 if(sql.startsWith('UPDATE challenge_approvals SET state')){pending.state=args[1];return {rows:[]};}
 throw Error(sql);
}};
require.cache[path]={id:path,filename:path,loaded:true,exports:{db}};
const {updateChallengeSettings:update}=require('../src/services/challengeSettings');
const {decide}=require('../src/services/challengeGatekeeper');
function reset(){current={id:1,host_id:2,title:'Test',type:'demo',status:'registration_open',start_date:'2099-10-01T06:00:00.000Z',end_date:'2099-10-20T06:00:00.000Z',registration_deadline:'2099-10-01T06:00:00.000Z',timezone:'Africa/Addis_Ababa',starting_balance:100,target_balance:200,deposit_mode:'fixed'};pending=null;updates=0;}
const next={start_date:'2099-10-02T06:00:00Z',end_date:'2099-10-25T06:00:00Z'};
test('host schedule queues without mutation; Telegram approval applies linked dates once',async()=>{reset();const result=await update(1,next,2);assert.equal(result.pendingApproval,true);assert.equal(updates,0);assert.equal(pending.payload.fields.registration_deadline,next.start_date);await assert.rejects(()=>decide(pending.token,true),/Telegram/);await decide(pending.token,true,'telegram');assert.equal(current.start_date,next.start_date);assert.equal(current.end_date,next.end_date);assert.equal(current.registration_deadline,next.start_date);assert.equal(await decide(pending.token,true,'telegram'),null);});
test('rejection retains dates and duplicate submissions are rejected',async()=>{reset();await update(1,next,2);await assert.rejects(()=>update(1,next,2),/already awaiting/);await decide(pending.token,false,'telegram');assert.equal(updates,0);assert.equal(pending.state,'rejected');});
test('approval rejects changed baseline and started challenge',async()=>{for(const change of [{end_date:'2099-11-01'},{status:'active'},{start_date:'2000-01-01'}]){reset();await update(1,next,2);Object.assign(current,change);await assert.rejects(()=>decide(pending.token,true,'telegram'),/stale/);assert.equal(updates,0);}});
test('admin and draft edits apply immediately and synchronize linked deadline',async()=>{for(const host of [undefined,2]){reset();if(host)current.status='draft';await update(1,next,host);assert.equal(pending,null);assert.equal(current.registration_deadline,next.start_date);}});
test('equivalent timestamps do not request approval; custom deadline is preserved',async()=>{reset();await update(1,{start_date:'2099-10-01T09:00:00+03:00'},2);assert.equal(pending,null);current.registration_deadline='2099-09-25T00:00:00Z';await update(1,next);assert.equal(current.registration_deadline,'2099-09-25T00:00:00Z');});
test('ownership, invalid range, past start and frozen changes rejected',async()=>{reset();await assert.rejects(()=>update(1,next,3),/not found/);await assert.rejects(()=>update(1,{end_date:'2099-09-01'},2));await assert.rejects(()=>update(1,{start_date:'2000-01-01'},2),/future/);current.configuration_frozen_at=new Date();await assert.rejects(()=>update(1,next,2),/locked/);assert.equal(updates,0);});
