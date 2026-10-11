const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
let rows=[],locked=true,sent=[],fail=false;
async function query(sql,args=[]){
 if(sql.includes('pg_try_advisory'))return {rows:[{locked}]};
 if(sql.startsWith('SELECT *'))return {rows:rows.filter(r=>r.challenge_id===args[0]&&r.post_date===args[1]&&r.slot===args[2])};
 if(sql.startsWith('SELECT template'))return {rows:rows.map(r=>({template_id:r.template_id}))};
 if(sql.startsWith('INSERT')){const [challenge_id,post_date,slot,phase,template_id,body]=args;const row={id:rows.length+1,challenge_id,post_date,slot,phase,template_id,body,delivered:{}};rows.push(row);return {rows:[row]};}
 if(sql.includes('delivered=delivered'))Object.assign(rows.find(r=>r.id===args[0]).delivered,JSON.parse(args[1]));
 return {rows:[]};
}
mock('../src/database/db',{db:{query,getClient:async()=>({query,release(){}})}});
mock('../src/config',{config:{mainChannelId:'main',challengeChannelId:'challenge'}});
const {deliverDailyPost}=require('../src/services/dailyChallengePosts');
const telegram={sendMessage:async(channel,body)=>{if(channel==='challenge'&&fail)throw new Error('Temporary failure');sent.push({channel,body});return {message_id:sent.length};}};
const c={id:39,title:'Sprint',timezone:'Africa/Nairobi',end_date:'2026-10-23T20:59:00Z'};
const dates=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'];
test('partial channel delivery retries only failed channel with same persisted message',async()=>{
 fail=true;await assert.rejects(deliverDailyPost(telegram,c,1,'morning',dates));assert.equal(sent.length,1);
 const body=sent[0].body;fail=false;await deliverDailyPost(telegram,c,1,'morning',dates);assert.equal(sent.length,2);assert.equal(sent[1].body,body);assert.equal(sent[1].channel,'challenge');
 await deliverDailyPost(telegram,c,1,'morning',dates);assert.equal(sent.length,2);
});
test('replica lock, hosted and Discord isolation prevent sends',async()=>{
 const before=sent.length;locked=false;await deliverDailyPost(telegram,c,2,'morning',dates);locked=true;
 await deliverDailyPost(telegram,{...c,host_id:1},2,'morning',dates);await deliverDailyPost(telegram,{...c,source:'discord'},2,'morning',dates);assert.equal(sent.length,before);
});
test('middle day reaches challenge only and final evening reaches both',async()=>{
 sent=[];await deliverDailyPost(telegram,c,3,'evening',dates);assert.deepEqual(sent.map(r=>r.channel),['challenge']);
 sent=[];await deliverDailyPost(telegram,c,5,'evening',dates);assert.deepEqual(sent.map(r=>r.channel),['main','challenge']);assert.match(sent[0].body,/5 OF 5/);
});
