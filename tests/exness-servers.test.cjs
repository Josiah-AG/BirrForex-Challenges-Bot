const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
require('ts-node/register/transpile-only');
const {MT5_SERVERS,serverChoices,selectedServer}=require('../src/utils/exnessServers');
const {fuzzyMatchServer}=require('../src/services/vpsService');
test('catalogue matches recording and frontend stays identical',()=>{
 assert.equal(MT5_SERVERS.real.length,44);assert.equal(MT5_SERVERS.demo.length,16);
 for(const n of [31,32,33,34,35,36,37,38,39,40,41,42,43,46,51])assert.ok(MT5_SERVERS.real.includes('Exness-MT5Real'+n));
 assert.equal(fs.readFileSync('src/utils/exnessServers.ts','utf8'),fs.readFileSync('WinnerPip/winnerpip/lib/exnessServers.ts','utf8'));
});
test('ambiguous numbers offer all choices rather than guessing',()=>{
 assert.deepEqual(serverChoices('5','real'),[5,15,25,35,51].map(n=>'Exness-MT5Real'+n));
 assert.equal(fuzzyMatchServer('5','real'),null);assert.equal(selectedServer('5','real'),null);
});
test('full names preserve exact numbered and unnumbered server identities',()=>{
 for(const type of ['real','demo'])for(const s of MT5_SERVERS[type])assert.equal(fuzzyMatchServer(s,type),s);
 assert.deepEqual(serverChoices('exnes mt5 real51','real'),['Exness-MT5Real51']);
 assert.deepEqual(serverChoices('Real46','real'),['Exness-MT5Real46']);
 assert.equal(selectedServer('exness mt5 real51','real'),'Exness-MT5Real51');
});
test('unsupported and wrong-category servers cannot be submitted or guessed',()=>{
 for(const s of ['Exness-MT5Real52','Exness-MT5Real13','Exness-MT5Trial9'])assert.equal(selectedServer(s,'real'),null);
 assert.deepEqual(serverChoices('Exness-MT5Real52','real'),[]);
 assert.deepEqual(serverChoices('Exness-MT5Trial9','real'),[]);
});
test('Telegram search offers buttons and selection works for real replacements',async()=>{
 const {tradingRegistrationHandler:h}=require('../src/bot/tradingRegistrationHandler');
 const {tradingChallengeService:s}=require('../src/services/tradingChallengeService');
 const oldGet=s.getRegistration,oldChallenge=s.getChallengeById;
 let replies=[];const ctx={from:{id:99881234},answerCbQuery:async()=>{},reply:async(text,opts)=>{replies.push({text,opts});}};
 try{
 s.getRegistration=async()=>({id:777,challenge_id:39,account_type:'demo'});
 s.getChallengeById=async()=>({id:39,type:'hybrid',status:'registration_open'});
 await h.handleCallback(ctx,'tc_switch_confirm_39');
 await h.showServerButtons(ctx,99881234);
 await h.handleTextInput(ctx,'5');
 let buttons=replies.at(-1).opts.reply_markup.inline_keyboard.flat();
 assert.equal(buttons.length,5);assert.ok(buttons.some(b=>b.callback_data==='tc_server_Exness-MT5Real51'));
 assert.ok(!buttons.some(b=>b.callback_data==='tc_server_manual'));
 await h.handleCallback(ctx,'tc_server_Exness-MT5Real51');
 assert.match(replies.at(-1).text,/Password|password/);
 }finally{s.getRegistration=oldGet;s.getChallengeById=oldChallenge;}
});
