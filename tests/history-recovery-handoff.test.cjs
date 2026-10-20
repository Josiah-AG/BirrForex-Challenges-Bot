const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=fs.readFileSync(require.resolve('../src/scheduler/vpsPullScheduler.ts'),'utf8');
const ast=ts.createSourceFile('scheduler.ts',source,ts.ScriptTarget.Latest,true);
const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='VpsPullScheduler');
const methods=['drainPullJobs','retrySingleAccountUnlocked'];
function harness(db){const code='class Scheduler {'+cls.members.filter(m=>methods.includes(m.name?.getText(ast))).map(m=>m.getText(ast)).join('\n')+'}; Scheduler';return vm.runInNewContext(ts.transpile(code,{target:ts.ScriptTarget.ES2020}),{db,process:{env:{VPS_VERIFIED_HISTORY:'true'}},console,RETRY_DELAY_MS:0,Date});}
test('idle pull queue releases coordinator before handing off to recovery',async()=>{
 const calls=[];const db={getClient:async()=>({query:async q=>{calls.push(q.includes('unlock')?'unlock':'lock');return {rows:[{locked:true}]}},release:()=>calls.push('release')}),query:async()=>({rows:[]}),transaction:async f=>f()};const S=harness(db),s=new S();s.retryIncompleteHistory=async()=>calls.push('recovery');await s.drainPullJobs();assert.deepEqual(calls,['lock','unlock','release','recovery']);assert.equal(s.drainingPullJobs,false);
});
test('another coordinator owner prevents recovery from competing',async()=>{
 const calls=[];const S=harness({getClient:async()=>({query:async()=>({rows:[{locked:false}]}),release:()=>calls.push('release')})});const s=new S();s.retryIncompleteHistory=async()=>calls.push('recovery');await s.drainPullJobs();assert.deepEqual(calls,['release']);
});
function retryHarness(results){const S=harness({query:async q=>({rows:q.includes('account_number')?[{id:1,account_number:'100',mt5_server:'Broker',investor_password:'test'}]:[{id:39,status:'active'}]})});const s=new S();s.terminals=[1,2,3,4].map(id=>({id,isHealthy:true}));s.calls=[];s.pullSingleAccount=async(a,id)=>{s.calls.push(id);return results.shift()||{success:false,errorCode:'history_incomplete',errorMessage:'Busy'};};s.bulkUpdatePullStatus=async()=>{};s.delay=async()=>{};return s;}
test('incomplete first response retries another healthy terminal and can recover',async()=>{
 const s=retryHarness([{success:false,errorCode:'history_incomplete',errorMessage:'Terminal login unavailable'},{success:true}]);const r=await s.retrySingleAccountUnlocked(1,39,false,false);assert.equal(r.success,true);assert.deepEqual(s.calls,[1,2]);
});
test('persistent incomplete history is bounded to three distinct terminals',async()=>{const s=retryHarness([]);const r=await s.retrySingleAccountUnlocked(1,39,false,false);assert.equal(r.success,false);assert.equal(r.errorCode,'history_incomplete');assert.deepEqual(s.calls,[1,2,3]);assert.equal(r.terminalAttempts.length,3);});
test('confirmed credential failure stops generic retries',async()=>{const s=retryHarness([{success:false,errorCode:'invalid_credentials'}]);const r=await s.retrySingleAccountUnlocked(1,39,false,false);assert.equal(r.errorCode,'invalid_credentials');assert.deepEqual(s.calls,[1]);});
