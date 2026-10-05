require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {queuedPullProgress}=require('../src/utils/queuedPullProgress');
test('queued job keeps both existing progress pollers alive without claiming work completed',()=>{
 const p=queuedPullProgress({id:'78',challenge_id:38});
 assert.equal(p.isRunning,true); assert.equal(p.isQueued,true);
 assert.equal(p.phase,'queued');assert.equal(p.percent,0);
 assert.equal(p.challengeId,38);assert.equal(p.jobId,'78');
 assert.equal(p.currentStep,1);assert.equal(p.totalSteps,4);
});
test('queue reports real wait duration and distinguishes terminal preparation',()=>{
 const now=Date.parse('2026-10-05T09:00:20Z');
 const job={id:1,challenge_id:38,created_at:'2026-10-05T09:00:00Z'};
 assert.equal(queuedPullProgress(job,now).elapsedSeconds,20);
 assert.match(queuedPullProgress({...job,state:'running'},now).stepLabel,/preparing terminals/);
});
