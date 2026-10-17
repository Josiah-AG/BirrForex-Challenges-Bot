const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {db}=require('../src/database/db');const {config}=require('../src/config');const {deliverRegistrationPost,registrationPost}=require('../src/services/registrationPosts');
const c={id:999,title:'Sprint <1> & test',type:'hybrid',status:'registration_open',start_date:'2026-10-18T21:00:00Z',end_date:'2026-10-23T20:59:00Z',timezone:'Africa/Nairobi',real_prizes:[100,100],demo_prizes:[50,50],starting_balance:10,target_balance:60,target_percent:50,deposit_mode:'min_limit'};
test('registration announcement and countdowns have safe HTML, correct mode, prizes and links',()=>{
 for(const days of [undefined,3,2,1]){const s=registrationPost(c,days);assert.ok(s.includes('Sprint &lt;1&gt; &amp; test'));assert.ok(s.includes('Hybrid'));assert.ok(s.includes('$300'));assert.ok(s.includes('Minimum Starting Balance'));assert.ok(s.includes('winnerpip.com'));assert.ok(s.includes('50%'));assert.ok(s.length<4096);}
});
test('channel failure retries only the failed destination; completed posts survive another call',async()=>{
 let row={delivered:{},completed_at:null},calls=[],fail=true,marked=false;
 const client={release(){},async query(sql,args){
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.startsWith('SELECT *'))return {rows:[row]};
 if(sql.includes('delivered=delivered'))Object.assign(row.delivered,JSON.parse(args[2]));
 if(sql.includes('completed_at=CASE'))row.completed_at=args[2]?null:new Date();
 if(sql.includes('announcement_posted=true'))marked=true;
 return {rows:[]};}};
 const orig=db.getClient;db.getClient=async()=>client;
 const telegram={getMe:async()=>({username:'testbot'}),sendMessage:async(channel)=>{calls.push(channel);if(fail&&channel===config.challengeChannelId)throw Error('Forbidden');return {message_id:calls.length};}};
 try{await assert.rejects(deliverRegistrationPost(telegram,c),/incomplete/);assert.equal(marked,false);fail=false;await deliverRegistrationPost(telegram,c);assert.equal(marked,true);assert.deepEqual(calls,[config.mainChannelId,config.challengeChannelId,config.challengeChannelId]);await deliverRegistrationPost(telegram,c);assert.equal(calls.length,3);}finally{db.getClient=orig;}
});
test('hosted, Discord and started challenges never post registration messages',async()=>{
 for(const overrides of [{host_id:1},{source:'discord'},{status:'active'}])assert.equal(await deliverRegistrationPost({}, {...c,...overrides}),false);
});

test('countdown style and optional resources follow challenge configuration',()=>{const text=registrationPost({...c,pdf_url:'https://example.com/rules',video_url:'https://example.com/video'},2);assert.match(text,/2 DAYS LEFT!/);assert.match(text,/Download PDF/);assert.match(text,/Watch Video/);assert.match(text,/October 19/);assert.doesNotMatch(text,/\$60/);const demo=registrationPost({...c,type:'demo',deposit_mode:'max_limit'},1);assert.match(demo,/1 DAY LEFT!/);assert.match(demo,/Maximum Starting Balance/);assert.match(demo,/Prize Pool:<\/b> \$100/);assert.doesNotMatch(demo,/Download PDF|Watch Video|Demo & Real/);});
