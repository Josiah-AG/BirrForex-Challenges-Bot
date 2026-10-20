const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const realLoad=Module._load;let saved,orders=new Map(),count=0,prior=null;const scans=[];let extraTrade=false;let hostId=null,status="active",sourceReport={report:{count:1,rows:[{accounts:["#100"]}],updatedAt:"2026-10-20T00:00:00Z",partial:false},error:null};
const end=new Date(Date.now()+86400000).toISOString(),start=new Date(Date.now()-40*86400000).toISOString(),cutoff=new Date(Date.now()-3600000).toISOString(),after=new Date(Date.now()-1800000).toISOString();
const regs=[{id:1,nickname:'Active',account_number:'100',client_uid:'u1',is_cent:true},{id:2,nickname:'DQ',account_number:'200',client_uid:'u2',disqualified:true},{id:3,nickname:'Blown',account_number:'300',client_uid:'u3',last_known_balance:0}];
const make=(acct,ticket,date)=>({client_account:acct,client_account_type:acct==='100'?'Standard Cent':'Pro',order_id:`mt5_real:${ticket}`,partner_account:'p',symbol:'XAUUSD',volume_lots:.01,volume_mln_usd:.001,reward_usd:.1,close_date:date});
const source=[make('100','1',cutoff),make('100','2',after),make('101','3',after),make('200','4',after),make('300','5',after)];
const db={getClient:async()=>({query:async()=>({rows:[{locked:true}]}),release(){}}),query:async(sql,args=[])=>{
 if(sql.includes('SELECT * FROM trading_challenges'))return {rows:[{id:8,type:'real',status,host_id:hostId,start_date:start,end_date:end}]};
 if(sql.includes('SELECT report,error FROM wp_new_client_reports'))return {rows:sourceReport?[sourceReport]:[]};
 if(sql.includes('SELECT r.id,r.nickname'))return {rows:regs};
 if(sql.includes('SELECT scope,scanned_through'))return {rows:prior?[prior]:[]};
 if(sql.includes('INSERT INTO wp_commercial_orders')){for(const r of JSON.parse(args[2]))orders.set(r.account+'|'+r.order_id+'|'+r.partner_account,r.data);return {rows:[]};}
 if(sql.includes('SELECT data FROM wp_commercial_orders'))return {rows:[...orders.values()].map(data=>({data}))};
 if(sql.includes('SELECT * FROM wp_commercial_coverage'))return {rows:regs.map(r=>({registration_id:r.id,cutoff,trades:r.id===1?[{ticket:'1',symbol:'XAUUSD',volume:1,close_time:cutoff},...(extraTrade?[{ticket:'6',symbol:'XAUUSD',volume:1,close_time:cutoff}]:[])]:[]}))};
 if(sql.includes('SELECT registration_id,ticket'))return {rows:[]};
 if(sql.includes('UPDATE wp_commercial_reports SET scope')){saved=JSON.parse(args[2]);return {rows:[]};}
 if(sql.includes('UPDATE wp_commercial_reports SET error'))throw Error(args[1]);
 return {rows:[]};
}};
const broker={commercialScope:()=> 'test-scope',commercialReport:async(path,params)=>{
 count++;
 if(path.includes('/orders/')){scans.push(params.date_from);return {data:source,totals:{count:source.length}};}
 const all=[...regs.map(r=>({client_account:r.account_number,client_uid:r.client_uid,platform:'mt5',client_account_type:r.is_cent?'Standard Cent':'Pro'})),{client_account:'101',client_uid:'u1',platform:'mt5'}];
 const field=params.client_account?'client_account':'client_uid';const values=params[field].split(',');const data=all.filter(r=>values.includes(r[field]));return {data,totals:{count:data.length}};
}};
Module._load=function(id,parent,...rest){if(parent?.filename.endsWith('/commercialAnalytics.js')){if(id==='../database/db')return {db};if(id==='./partnerScreening')return {brokerForChallenge:async()=>broker};}return realLoad.call(this,id,parent,...rest);};
const service=require('../dist/services/commercialAnalytics');test.after(()=>{Module._load=realLoad;});
test('actual refresh freezes active accounts, continues DQ/blown, deduplicates repeat imports',async()=>{
 await service.refreshCommercial(8);assert.ok(saved);assert.equal(saved.rows.length,3);
 assert.equal(saved.rows[0].challenge.confirmed,.1);assert.equal(saved.rows[0].all.confirmed,.1);
 assert.equal(saved.rows[1].challenge.confirmed,.1);assert.equal(saved.rows[2].challenge.confirmed,.1);
 assert.equal(saved.challenge.confirmed,.3);assert.equal(saved.challenge.lots,.03);assert.equal(saved.all.confirmed,.3);
 prior={scope:'test-scope',scanned_through:new Date().toISOString(),account_ids:['100','200','300']};scans.length=0;
 await service.refreshCommercial(8);assert.equal(scans[0],start.slice(0,10));assert.equal(saved.challenge.confirmed,.3);assert.equal(orders.size,5);assert.ok(count>=6);
 assert.equal(service.HOST_COMMERCIAL_ENABLED,false);
});

test('new-source revenue uses the same cohort, covers linked accounts and deduplicates participants',async()=>{
 status='completed';regs.push({...regs[0],id:4});
 try {
  await service.refreshCommercial(8);
  assert.equal(saved.newSourceRevenue.available,true);
  assert.equal(saved.newSourceRevenue.challenge.confirmed,.2);
  assert.equal(saved.newSourceRevenue.all.confirmed,.3);
  assert.equal(saved.challenge.confirmed,.4);assert.equal(saved.all.confirmed,.5);
  assert.equal(saved.newSourceRevenue.challenge.total,.2);
  assert.equal(saved.newSourceRevenue.all.total,.3);
 } finally {regs.pop();status='active';}
});
test('missing source report is unavailable, empty cohort is zero, and host reports omit the metric',async()=>{
 const original=sourceReport;
 try {
  sourceReport=null;await service.refreshCommercial(8);
  assert.equal(saved.newSourceRevenue.available,false);assert.equal(saved.newSourceRevenue.challenge,null);
  sourceReport={report:{count:0,rows:[],partial:true},error:'Refresh delayed'};await service.refreshCommercial(8);
  assert.equal(saved.newSourceRevenue.challenge.total,0);assert.equal(saved.newSourceRevenue.partial,true);
  assert.equal(saved.newSourceRevenue.error,'Refresh delayed');
  hostId=7;await service.refreshCommercial(8);assert.equal('newSourceRevenue' in saved,false);
 } finally {sourceReport=original;hostId=null;}
});

test('new-source subtotal retains confirmed plus estimated revenue and cent normalization',async()=>{
 extraTrade=true;
 try {await service.refreshCommercial(8);assert.equal(saved.newSourceRevenue.challenge.confirmed,.1);assert.equal(saved.newSourceRevenue.challenge.estimated,.1);assert.equal(saved.newSourceRevenue.challenge.total,.2);assert.equal(saved.newSourceRevenue.all.total,.2);}
 finally {extraTrade=false;}
});
