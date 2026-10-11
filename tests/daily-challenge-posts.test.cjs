const {test}=require('node:test');const assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const {challengeDates,postPhase,choosePost,messageBank,dailyChannels,renderDaily,challengeBalanceSummary}=require('../src/utils/challengePosts');
const sprint={title:'Sprint <1>',type:'hybrid',timezone:'Africa/Nairobi',start_date:'2026-10-18T21:00:00Z',end_date:'2026-10-23T20:59:00Z',starting_balance:10,target_balance:60,deposit_mode:'min_limit',target_percent:50};
test('Sprint has five local trading days and Friday is final',()=>{
 assert.deepEqual(challengeDates(sprint),['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23']);assert.equal(postPhase(5,5),'final');assert.equal(postPhase(4,5),'penultimate');
});
test('longer challenges, weekends and timezone boundaries use actual dates',()=>{
 const c={...sprint,end_date:'2026-10-30T20:59:00Z'};assert.equal(challengeDates(c).length,10);assert.equal(challengeDates(c,true).length,12);
 assert.equal(challengeDates({...sprint,timezone:'America/New_York'})[0],'2026-10-19');
 assert.equal(challengeDates({...sprint,end_date:'2026-11-06T20:59:00Z'}).length,15);
});
test('only first and last daily posts reach both channels for all challenge lengths',()=>{
 for(const total of [1,5,10,15])for(let day=1;day<=total;day++)assert.deepEqual(dailyChannels(day,total,'main','challenge'),day===1||day===total?['main','challenge']:['challenge']);
 assert.deepEqual(dailyChannels(1,5,'same','same'),['same']);
});
test('bank uses fresh messages before repeats and never immediately repeats exhausted pool',()=>{
 for(const slot of ['morning','evening'])for(const phase of Object.keys(messageBank[slot])){
 const used=[];for(let i=0;i<6;i++){const m=choosePost(slot,phase,used,()=>0);assert.ok(!used.includes(m.id));used.push(m.id);}
 assert.notEqual(choosePost(slot,phase,used,()=>0.999).id,used.at(-1));
 }
});
test('rendering escapes title and shows exact deadline and dashboard without fixed weeks',()=>{
 const text=renderDaily(sprint,5,5,'evening',choosePost('evening','final',[]).body);
 assert.match(text,/5 OF 5/);assert.match(text,/Sprint &lt;1&gt;/);assert.match(text,/Oct 23, 2026/);assert.match(text,/11:59 PM/);assert.match(text,/GMT\+3|EAT/);assert.match(text,/winnerpip.com/);assert.doesNotMatch(text,/WEEK 2|OF 10/);
 assert.throws(()=>renderDaily(sprint,6,5,'morning','x'));
});
test('minimum-balance announcements use percentage target rather than unused absolute target',()=>{
 const text=challengeBalanceSummary(sprint);assert.match(text,/Minimum starting balance \$10/);assert.match(text,/50% growth/);assert.doesNotMatch(text,/60/);
});
test('short challenge sessions adjust daily hours and do not replay old posts',()=>{
 const {dailySlots}=require('../src/utils/challengePosts');
 assert.deepEqual(dailySlots(sprint,'2026-10-19','08:03'),['morning']);
 assert.deepEqual(dailySlots(sprint,'2026-10-19','09:00'),[]);
 const short={...sprint,start_date:'2026-10-19T07:00:00Z',end_date:'2026-10-19T12:00:00Z'};
 assert.deepEqual(dailySlots(short,'2026-10-19','10:00'),['morning']);
 assert.deepEqual(dailySlots(short,'2026-10-19','14:59'),['evening']);
 assert.deepEqual(dailySlots(short,'2026-10-19','15:00'),[]);
});
test('midnight end does not invent another trading day',()=>{
 assert.equal(challengeDates({...sprint,end_date:'2026-10-23T21:00:00Z'},true).length,5);
});
