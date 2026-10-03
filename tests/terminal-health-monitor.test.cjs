require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {TerminalHealthMonitor,outageDuration}=require('../src/utils/terminalHealthMonitor');
test('transient failure does not alert',()=>{const m=new TerminalHealthMonitor();assert.equal(m.observe([1],[],0).down.length,0);assert.equal(m.observe([1],[1],30000).recovered.length,0);});
test('duration preserves first failure across repeated failed rechecks',()=>{const m=new TerminalHealthMonitor();m.observe([1],[],0);assert.equal(m.observe([1],[],30000).down[0].since,0);assert.equal(m.observe([1],[],60000).down.length,0);assert.deepEqual(m.observe([1],[1],90000).recovered,[{id:1,since:0,recoveredAt:90000}]);assert.equal(m.observe([1],[1],120000).recovered.length,0);});
test('router failure breaks confirmation streak without inventing outages',()=>{const m=new TerminalHealthMonitor();m.observe([1],[],0);m.unknown();assert.equal(m.observe([1],[],60000).down.length,0);assert.equal(m.observe([1],[],90000).down.length,1);});
test('planned maintenance and stopped terminals do not generate recovery messages',()=>{const m=new TerminalHealthMonitor();m.observe([1,2],[],0);m.observe([1,2],[],30000);const r=m.observe([1],[],60000,[1]);assert.deepEqual(r,{down:[],recovered:[],confirmedDown:[]});});
test('all recovered from same snapshot, independently tracked durations',()=>{const m=new TerminalHealthMonitor();m.observe([1,2],[2],0);m.observe([1,2],[],30000);m.observe([1,2],[],60000);const r=m.observe([1,2],[1,2],90000);assert.deepEqual(r.recovered.map(x=>90000-x.since),[90000,60000]);assert.equal(r.confirmedDown.length,0);});
test('duration formatting',()=>{assert.equal(outageDuration(3725000),'1h 2m 5s');assert.equal(outageDuration(45000),'0m 45s');});
