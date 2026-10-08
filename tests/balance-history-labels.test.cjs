const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
const dbPath=require.resolve('../src/database/db');let state='published',balance=0;
require.cache[dbPath]={exports:{db:{query:async sql=>({rows:sql.includes('FROM trading_registrations') ? [{history_verified_balance:balance,history_verified_through:'2026-10-08T10:00:00Z',history_sync_state:state}] : [{ticket:'1',time:'2026-10-08T09:00:00Z',deal_type:'2',profit:21.79,comment:'D-NULL'}]})}}};
const {labelBalanceHistory}=require('../src/utils/challengeBalanceHistory');
test('verified negative balance reset gets a neutral label; unproven deposits do not',async()=>{
 const rows=[{deal_ticket:'1',op_type:'deposit',amount:21.79,comment:'D-NULL'},{deal_ticket:'2',op_type:'withdrawal',amount:-2.23,comment:'DIV-US500-1368369'}];
 let out=await labelBalanceHistory(1,rows);assert.equal(out[0].op_type,'negative_balance_reset');assert.equal(out[1].op_type,'dividend');assert.equal(out[0].amount,21.79);assert.equal(rows[0].op_type,'deposit');
 balance=100;out=await labelBalanceHistory(1,rows);assert.equal(out[0].op_type,'deposit');
 balance=0;state='pending';out=await labelBalanceHistory(1,rows);assert.equal(out[0].op_type,'deposit');
});
