const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {reconcilePrestart:r}=require('../src/utils/prestartReconciliation');
const {startingBalanceProblem:p}=require('../src/utils/startingBalancePolicy');
const snapshotAt='2026-10-01T08:00:00Z',startAt='2026-10-01T10:00:00Z',verifiedThrough='2026-10-01T11:00:00Z';
const deal=(profit,deal_type=2,time='2026-10-01T09:00:00Z',extra={})=>({profit,deal_type,time,...extra});
function run(snapshotBalance,deals){const verifiedBalance=snapshotBalance+deals.reduce((s,d)=>s+Number(d.profit)+Number(d.commission||0)+Number(d.swap||0)+Number(d.fee||0),0);return r({snapshotBalance,snapshotAt,startAt,verifiedBalance,verifiedThrough,deals});}
test('pre-start gains excluded; deposits remain detectable alongside trades',()=>{
 for(const [balance,deals,expected] of [[100,[deal(50,0)],100],[100,[deal(50,0),deal(10)],110],[95,[deal(5)],100],[100,[deal(-5,1),deal(5)],100],[100,[deal(-5,1)],95],[100,[deal(50),deal(-50)],100],[100,[deal(50,0,'2026-10-01T10:00:00Z')],100]]){const x=run(balance,deals);assert.equal(x.competitionBalance,expected);assert.equal(p(expected,100)==='high',expected>=101);}
});
test('commissions, swap and fees reconcile; empty history with a changed balance fails safely',()=>{
 assert.equal(run(100,[deal(10,0,undefined,{commission:-1,swap:-2,fee:-1})]).preNonFunding,6);
 assert.throws(()=>r({snapshotBalance:100,snapshotAt,startAt,verifiedThrough,verifiedBalance:150,deals:[]}),/unexplained/);
 assert.throws(()=>r({snapshotBalance:100,snapshotAt,startAt,verifiedThrough:snapshotAt,verifiedBalance:100,deals:[]}),/through challenge start/);
});
test('snapshot request overlap and credit do not create false funding violations',()=>{
 const x=r({snapshotBalance:150,snapshotAt,snapshotUntil:'2026-10-01T08:01:00Z',startAt,verifiedThrough,verifiedBalance:150,deals:[deal(50,0,'2026-10-01T08:00:30Z'),deal(200,3)]});
 assert.equal(x.competitionBalance,150); // gain was already included in the final check, not after it
 const boundary=run(100,[deal(5,0,verifiedThrough)]);assert.equal(boundary.competitionBalance,100);
});

test('broker dividends and credit are not mistaken for client deposits',()=>{
 assert.equal(run(100,[deal(20,2,undefined,{comment:'DIVIDEND payment'})]).competitionBalance,100);
 assert.equal(run(100,[deal(20,17)]).competitionBalance,100);
});
