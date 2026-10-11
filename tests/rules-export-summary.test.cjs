const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {rulesExportSummary:summary}=require('../WinnerPip/winnerpip/lib/rulesExportSummary');
const sprint={type:'hybrid',deposit_mode:'min_limit',starting_balance:10,target_balance:60,target_percent:50,target_enabled:true};
test('Sprint export displays minimum and percentage, not absolute fallback',()=>{
 const s=summary(sprint);assert.equal(s.type,'Hybrid Challenge');assert.equal(s.rows[0].start,'$10 or above');assert.equal(s.rows[0].target,'50% growth');assert.equal(s.rows[0].mode,'Minimum balance');assert(!JSON.stringify(s).includes('$60'));
});
test('fixed, max, no target, cents and independent hybrid settings retain meaning',()=>{
 assert.equal(summary({...sprint,deposit_mode:'fixed'}).rows[0].target,'$60');
 assert.equal(summary({...sprint,deposit_mode:'max_limit'}).rows[0].start,'$10 or below');
 assert.equal(summary({...sprint,target_enabled:false}).rows[0].target,'No target');
 assert.equal(summary({...sprint,type:'real'},true).rows[0].start,'10¢ or above');
 const s=summary({...sprint,split_category_settings:true,demo_starting_balance:100,demo_target_balance:200,demo_deposit_mode:'fixed',real_starting_balance:20,real_target_balance:999,real_deposit_mode:'min_limit',real_target_percent:25});
 assert.deepEqual(s.rows.map(r=>[r.category,r.start,r.target]),[['Demo','$100','$200'],['Real','$20 or above','25% growth']]);
});
