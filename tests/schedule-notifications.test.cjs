const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
let state='pending',messageId=null,emailSent=false,fail=false;const mails=[],messages=[];
function mock(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../src/database/db',{db:{transaction:async fn=>fn(),query:async(sql,args)=>{
 if(sql.includes('pg_try_advisory'))return {rows:[{locked:true}]};
 if(sql.startsWith('SELECT *'))return {rows:[{token:'synthetic',state,payload:{hostId:2,title:'A <test>',challengeId:1,fields:{start_date:'2099-10-02',end_date:'2099-10-20'},baseline:{start_date:'2099-10-01',end_date:'2099-10-19',timezone:'Africa/Addis_Ababa'}}}]};
 if(sql.startsWith('SELECT email'))return {rows:[{email:'host@example.invalid',display_name:'Host'}]};
 if(sql.includes('message_id=$2'))messageId=args[1];
 if(sql.includes('emailSent'))emailSent=true;
 return {rows:[]};
}}});
mock('../src/services/emailService',{emailService:{sendGeneric:async(...args)=>{mails.push(args);return !fail;}}});
const {deliverScheduleNotifications:deliver}=require('../src/services/scheduleNotifications');
test('request has approval controls and escaped content',async()=>{await deliver({sendMessage:async(...args)=>{messages.push(args);return {message_id:10};}});assert.equal(messageId,10);assert.match(messages[0][1],/A &lt;test&gt;/);assert.equal(messages[0][2].reply_markup.inline_keyboard.length,2);assert.equal(mails.length,0);});
test('both decisions email host; failed email stays retryable',async()=>{for(const decision of ['approved','rejected']){state=decision;emailSent=false;fail=true;await deliver(null);assert.equal(emailSent,false);fail=false;await deliver(null);assert.equal(emailSent,true);assert.match(mails.at(-1)[1],new RegExp(decision));assert.equal(mails.at(-1)[3],`schedule-synthetic-${decision}`);}});
