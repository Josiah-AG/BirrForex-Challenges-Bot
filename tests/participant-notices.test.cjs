const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
let rows=[],writes=[],sent=[],fail=false;
const query=async(sql,args=[])=>{if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};if(sql.includes('FROM participant_notice_outbox'))return {rows};writes.push({sql,args});return {rows:[]};};
mock('../src/database/db',{db:{query,transaction:async f=>f(),getClient:async()=>({query,release(){}})}});
mock('../src/services/emailService',{emailService:{sendGeneric:async()=>!fail}});
const {noticeRecipient,noticeIsCurrent,noticeText,deliverParticipantNotices}=require('../src/services/participantNotices');
const base={id:1,registration_id:23,challenge_id:39,challenge_title:'Sprint <1>',account_number:'1234',source:'telegram',user_id:'90001',timezone:'Africa/Johannesburg',kind:'drawdown',payload:{day:'2026-10-20',time:'12:30',cap:300,percent:30,isCent:true}};
test('Telegram recipient is the verified registration ID, hosted/web go by email, Discord never Telegram',()=>{
 assert.equal(noticeRecipient(base),'telegram');assert.equal(noticeRecipient({...base,host_id:2,email:'test@example.invalid'}),'email');assert.equal(noticeRecipient({...base,source:'csv',email:'test@example.invalid'}),'email');assert.equal(noticeRecipient({...base,source:'discord'}),'discord');
 for(const user_id of [null,undefined,0,-1,'wrong'])assert.throws(()=>noticeRecipient({...base,user_id}));assert.throws(()=>noticeRecipient({...base,source:'csv'}));
});
test('cent percentage cap and challenge timezone are accurately displayed',()=>{
 const text=noticeText(base).body;assert.match(text,/USC 300.00/);assert.match(text,/30%/);assert.match(text,/Africa\/Johannesburg/);assert.doesNotMatch(text,/EAT|USD 300/);assert.match(text,/midnight/);assert.match(text,/winnerpip.com/);
 assert.match(noticeText({...base,payload:{...base.payload,isCent:false,cap:3}}).body,/USD 3.00/);
});
test('credential deadline uses original detection, not delivery time or renewed 24h',()=>{
 const text=noticeText({...base,kind:'credential_failure',payload:{detectedAt:'2026-10-20T10:30:00Z'}}).body;assert.match(text,/Oct 21, 2026/);assert.match(text,/12:30/);assert.match(text,/GMT\+2/);assert.match(text,/not extended/);
});
test('repaired, reversed and removed state supersedes pending notices',()=>{
 assert.equal(noticeIsCurrent({...base,kind:'credential_failure',pull_status:'success'}),false);
 assert.equal(noticeIsCurrent({...base,kind:'disqualified',disqualified:false}),false);
 assert.equal(noticeIsCurrent({...base,registration_status:'removed'}),false);
 assert.equal(noticeIsCurrent({...base,kind:'disqualified',disqualified:true,disqualified_reason:'rule',payload:{reason:'rule'}}),true);
});
test('failed delivery persists retry and never marks sent; success marks sent after delivery',async()=>{
 rows=[base];writes=[];sent=[];const tg={sendMessage:async(id,text)=>{sent.push({id,text});if(fail)throw Error('blocked');}};
 fail=true;await deliverParticipantNotices(tg);assert.equal(sent[0].id,'90001');assert(writes.some(w=>w.sql.includes('attempts=attempts+1')));assert(!writes.some(w=>w.sql.includes('sent_at=NOW()')));
 fail=false;writes=[];await deliverParticipantNotices(tg);assert(writes.some(w=>w.sql.includes('sent_at=NOW()')));
});
test('Telegram credential warning has registration-specific owned update link',async()=>{
 rows=[{...base,kind:'credential_failure',pull_status:'password_changed',credential_failure_detected_at:'2026-10-20T10:30:00Z',payload:{detectedAt:'2026-10-20T10:30:00Z'}}];let opts;
 await deliverParticipantNotices({getMe:async()=>({username:'testbot'}),sendMessage:async(id,text,o)=>{assert.equal(id,'90001');opts=o;}});
 assert.match(opts.reply_markup.inline_keyboard[0][0].url,/tc_update_password_23$/);
});
test('hosted email failure is not marked delivered, stale DQ is cancelled',async()=>{
 rows=[{...base,host_id:2,email:'test@example.invalid'}];writes=[];fail=true;await deliverParticipantNotices(null);assert(writes.some(w=>w.sql.includes('attempts=attempts+1')));assert(!writes.some(w=>w.sql.includes('sent_at=NOW()')));
 fail=false;rows=[{...base,kind:'disqualified',disqualified:false}];writes=[];await deliverParticipantNotices(null);assert(writes.some(w=>w.sql.includes('cancelled_at=NOW()')));
});
