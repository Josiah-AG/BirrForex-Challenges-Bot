require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {leaderboardBadges:badge}=require('../WinnerPip/winnerpip/lib/leaderboardBadges');
const c={type:'demo',targetEnabled:false,allowBelowStart:false,startingBalance:100,targetBalance:120,demoWinnersCount:3};
const e={accountType:'demo',rank:1,adjustedBalance:110,actualStartingBalance:100,totalTrades:2,isQualified:false};
test('no target: only prize positions above floor are highlighted and badged despite unfinished requirements',()=>{
 assert.deepEqual(badge(e,c),{highlight:true,trophy:true});
 assert.deepEqual(badge({...e,rank:4},c),{highlight:false,trophy:false});
 assert.deepEqual(badge({...e,adjustedBalance:99},c),{highlight:false,trophy:false});
});
test('floor uses published starting balance and preserves equality policy',()=>{
 assert.equal(badge({...e,adjustedBalance:100},c).highlight,true);
 assert.equal(badge({...e,actualStartingBalance:115},c).highlight,false);
});
test('below-start permitted: losing top ranks get highlighted and badged; others do not',()=>{
 const x={...c,allowBelowStart:true};
 assert.deepEqual(badge({...e,adjustedBalance:90},x),{highlight:true,trophy:true});
 assert.deepEqual(badge({...e,adjustedBalance:90,rank:4},x),{highlight:false,trophy:false});
});
test('fixed targets use qualified balance after withdrawals, never gross',()=>{
 const x={...c,targetEnabled:true};
 assert.equal(badge({...e,adjustedBalance:120},x).trophy,true);
 assert.deepEqual(badge({...e,rank:4,adjustedBalance:120},x),{highlight:true,trophy:false});
 assert.equal(badge({...e,currentBalance:1000,adjustedBalance:119},x).highlight,false);
 assert.equal(badge({...e,adjustedBalance:125,totalWithdrawn:10},x).highlight,false);
});
test('growth target highlight does not require final qualification',()=>{
 const x={...c,targetEnabled:true,depositMode:'min_limit',targetPercent:10};
 assert.equal(badge({...e,growthPercent:10},x).trophy,true);
 assert.equal(badge({...e,growthPercent:9},x).highlight,false);
});
test('independent hybrid category controls and prize counts including zero',()=>{
 const x={type:'hybrid',split_category_settings:true,demo_target_enabled:false,demo_allow_below_start:true,demo_winners_count:0,real_target_enabled:true,real_target_balance:120,real_winners_count:2};
 assert.equal(badge(e,x).trophy,false);
 assert.equal(badge({...e,accountType:'real',adjustedBalance:120},x).trophy,true);
 assert.equal(badge({...e,accountType:'real',adjustedBalance:119},x).trophy,false);
});
test('combined display rank does not replace prize category rank',()=>assert.equal(badge({...e,rank:8,categoryRank:2},c).trophy,true));
test('cent targets are converted except real cent-only challenges',()=>{
 const x={...c,targetEnabled:true,realWinnersCount:3};
 assert.equal(badge({...e,isCent:true,adjustedBalance:120},x).trophy,false);
 assert.equal(badge({...e,isCent:true,adjustedBalance:12000},x).trophy,true);
 assert.equal(badge({...e,accountType:'real',isCent:true,adjustedBalance:120},{...x,type:'real',onlyCentAccount:true}).trophy,true);
});
for(const key of ['isDisqualified','isWithdrawn','isBlown','notYetEvaluated'])test(`${key} excludes badges`,()=>assert.deepEqual(badge({...e,[key]:true},c),{highlight:false,trophy:false}));
test('prestart and invalid values never claim a prize',()=>{
 assert.equal(badge(e,c,true).trophy,false);
 assert.equal(badge({...e,rank:null},c).trophy,false);
 assert.equal(badge({...e,adjustedBalance:null},c).trophy,false);
});
