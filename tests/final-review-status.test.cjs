const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {tradingChallengeService:s}=require('../src/services/tradingChallengeService');
test('review remains visible beyond 12/48 hours until checks lock results',()=>{
 for(const host_id of [null,8])for(const hours of [1,12,48,100]){
 const c={status:'reviewing',host_id,announcement_posted:true,end_date:new Date(Date.now()-hours*3600000),winners_posted_at:null,leaderboard_locked_at:null};
 assert.equal(s.getDisplayStatus(c),'evaluation');
 assert.equal(s.getDisplayStatus({...c,leaderboard_locked_at:new Date()}),'ended');
 }
});
test('publication and legacy completed results remain ended',()=>{
 assert.equal(s.getDisplayStatus({status:'reviewing',winners_posted_at:new Date()}),'ended');
 assert.equal(s.getDisplayStatus({status:'completed'}),'ended');
 assert.equal(s.getDisplayStatus({status:'active'}),'ongoing');
});
