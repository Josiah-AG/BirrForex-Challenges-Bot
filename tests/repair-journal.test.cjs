const {test}=require('node:test');const assert=require('node:assert/strict');const {changes,checkRestore}=require('../scripts/repair-journal.cjs');
test('journal restores only changed fields, preserving unrelated newer values',()=>{
 const before={wp_trades:[{id:1,profit:-98.51,is_qualified:false,violations:['risk']}]};
 const after={wp_trades:[{id:1,profit:-98.51,is_qualified:true,violations:[]}]};
 const [change]=changes(before,after);assert.deepEqual(change.before,{is_qualified:false,violations:['risk']});
 const current={...after.wp_trades[0],comment:'new metadata'};checkRestore(change,current);
 assert.deepEqual({...current,...change.before},{...before.wp_trades[0],comment:'new metadata'});
});
test('restore aborts on concurrent evaluation changes',()=>{
 const [change]=changes({wp_trades:[{id:1,is_qualified:false}]},{wp_trades:[{id:1,is_qualified:true}]});
 assert.throws(()=>checkRestore(change,{id:1,is_qualified:false}),/conflict/);
});
test('new staging row is tracked and checked before removal',()=>{
 const [change]=changes({wp_leaderboard_staging:[]},{wp_leaderboard_staging:[{id:2,flagged_trades:0}]});assert.equal(change.before,null);assert.equal(change.wholeRow,true);
 checkRestore(change,{id:2,flagged_trades:0});assert.throws(()=>checkRestore(change,{id:2,flagged_trades:1}),/conflict/);
});
