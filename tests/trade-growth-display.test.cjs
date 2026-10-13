const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,req){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:m.exports,module:m,require:req});return m.exports;}
let row;
const service=load('src/services/tradeGrowthDisplay.ts',p=>p.includes('database')?{db:{query:async()=>({rows:row?[row]:[]})}}:load('src/utils/categorySettings.ts',require));
const React=require('../WinnerPip/winnerpip/node_modules/react');
const {renderToStaticMarkup}=require('../WinnerPip/winnerpip/node_modules/react-dom/server');
const Component=load('WinnerPip/winnerpip/components/TradePnl.tsx',p=>require('../WinnerPip/winnerpip/node_modules/'+p)).default;
const render=(trade,group)=>renderToStaticMarkup(React.createElement(Component,{trade,group},'$legacy'));
test('uses participant evaluated baseline, split category mode and native cent units',async()=>{
 row={type:'hybrid',split_category_settings:true,account_type:'real',real_starting_balance:10,real_target_balance:15,real_deposit_mode:'min_limit',real_target_enabled:true,real_allow_below_start:false,evaluated_starting_balance:1000,actual_starting_balance:1000,is_cent:true};
 const c=await service.tradeGrowthContext(1);assert.equal(c.tradeStartingBalance,1000);assert.equal(c.tradeGrowthMode,true);
 const t=service.withTradeGrowth(c,{profit:40,commission:-5,swap:-3});assert.equal(t.netPnl,32);assert.match(render(t),/\+3.20%/);assert.match(render(t),/32.00¢/);
 row.real_deposit_mode='fixed';assert.equal((await service.tradeGrowthContext(1)).tradeGrowthMode,false);
});
test('net fees can turn a gross win into a net loss',()=>{let t=service.withTradeGrowth({tradeGrowthMode:true,tradeStartingBalance:100},{profit:2,commission:-3,swap:-1});assert.match(render(t),/-2.00%/);assert.match(render(t),/text-red-400/)});
test('partial closes sum net amounts once and fixed displays stay unchanged',()=>{const t={tradeGrowthMode:true,tradeStartingBalance:10,netPnl:.2};assert.match(render(t,[t,{...t,netPnl:.3}]),/\+5.00%/);assert.equal(render({...t,tradeGrowthMode:false}),'$legacy')});
test('missing or zero baseline never produces a guessed percentage',()=>{for(const base of [null,0,undefined]){let html=render({tradeGrowthMode:true,tradeStartingBalance:base,netPnl:1});assert(!html.includes('Infinity'));assert(!html.includes('NaN'));assert(!/>[^<]*%<\//.test(html));assert.match(html,/\$1.00/)}});
