const {test}=require('node:test'),assert=require('node:assert/strict');
const {terminalInventory}=require('../dist/utils/terminalInventory');
const {VpsPullScheduler}=require('../dist/scheduler/vpsPullScheduler');
const axios=require('axios');
test('inventory includes down workers but never dispatches them',()=>{
 const x=terminalInventory({terminals:11,healthy_terminals:[11,1,1]});
 assert.equal(x.ids.length,11);assert.deepEqual(x.healthyIds,[1,11]);
 for(const h of [{},{terminals:16,healthy_terminals:[]},{terminals:2,healthy_terminals:[3]}])assert.throws(()=>terminalInventory(h));
 assert.deepEqual(terminalInventory({terminals:1,healthy_terminals:[]}).healthyIds,[]);
});
test('scheduler adapts up and down, preserves existing state and rejects malformed inventory',async()=>{
 const old=axios.get;
 try{
  const s=new VpsPullScheduler({});
  axios.get=async()=>({data:{terminals:10,healthy_terminals:[1,10]}});await s.refreshTerminalInventory();
  s.terminals[0].totalProcessed=9;
  axios.get=async()=>({data:{terminals:11,healthy_terminals:[1,11]}});await s.refreshTerminalInventory();
  assert.equal(s.terminals.length,11);assert.equal(s.terminals[10].isHealthy,true);assert.equal(s.terminals[0].totalProcessed,9);
  axios.get=async()=>({data:{terminals:3,healthy_terminals:[1,3]}});await s.refreshTerminalInventory();assert.deepEqual(s.terminals.map(t=>t.id),[1,2,3]);assert.equal(s.terminals[1].isHealthy,false);
  axios.get=async()=>({data:{}});await assert.rejects(s.refreshTerminalInventory());assert.equal(s.terminals.length,3);
 }finally{axios.get=old}
});
