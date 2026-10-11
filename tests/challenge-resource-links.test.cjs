const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let current,writes=[];
const id=require.resolve('../src/database/db');require.cache[id]={id,filename:id,loaded:true,exports:{db:{transaction:async f=>f(),query:async(sql,args)=>{if(sql.startsWith('SELECT *'))return {rows:[current]};writes.push({sql,args});return {rows:[current]};}}}};
const {updateChallengeSettings:update}=require('../src/services/challengeSettings');
function reset(status){current={id:39,status,type:'hybrid',title:'Sprint 1',start_date:'2099-10-19T00:00Z',end_date:'2099-10-23T23:59Z',timezone:'Africa/Nairobi',starting_balance:10,target_balance:60,target_enabled:true,target_percent:50,deposit_mode:'min_limit',registration_mode:'winnerpip',configuration_frozen_at:status==='active'?'2026-10-01':null,pdf_url:null,video_url:null};writes=[];}
test('optional PDF/video links can be added or cleared in draft and active settings',async()=>{
 for(const status of ['draft','active']){
 reset(status);await update(39,{pdf_url:' https://example.org/rules.pdf ',video_url:'https://example.org/video'});assert(writes[0].args.includes('https://example.org/rules.pdf'));
 current.pdf_url='https://example.org/rules.pdf';writes=[];await update(39,{pdf_url:''});assert.equal(writes[0].args[0],null);
 await assert.rejects(()=>update(39,{video_url:'javascript:alert(1)'}),/valid http/);
 if(status==='active')await assert.rejects(()=>update(39,{starting_balance:20}),/locked/);
 }
});
