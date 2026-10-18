const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {hasEnded,isPastChallenge}=require('../WinnerPip/winnerpip/lib/challengeListing');
const now=Date.parse('2026-10-19T00:00:00Z'),day=86400000;
const c={status:'reviewing',displayStatus:'ended',endDate:new Date(now-day).toISOString()};
test('locked results stay current before publication but use winners action',()=>{assert.equal(hasEnded(c),true);assert.equal(isPastChallenge(c,now),false);assert.equal(isPastChallenge({...c,endDate:new Date(now-30*day).toISOString()},now),false);});
test('published winners remain current for seven days then archive',()=>{for(const age of [0,6,7,8])assert.equal(isPastChallenge({...c,winnersPostedAt:new Date(now-age*day).toISOString()},now),age>7);});
test('active/review challenges stay current; legacy completed archives preserved',()=>{assert.equal(hasEnded({...c,displayStatus:'evaluation'}),false);assert.equal(isPastChallenge({...c,displayStatus:'evaluation'},now),false);assert.equal(isPastChallenge({...c,status:'completed',endDate:new Date(now-15*day).toISOString()},now),true);});
