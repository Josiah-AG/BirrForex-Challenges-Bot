const {test}=require('node:test'),assert=require('node:assert/strict');
require('ts-node/register/transpile-only');
let challenge,entries,rules;
const dbPath=require.resolve('../src/database/db');
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{db:{query:async(sql)=>({rows:sql.includes('FROM trading_challenges')?[challenge]:entries})}}};
const evalPath=require.resolve('../src/services/wpEvaluationEngine');
require.cache[evalPath]={id:evalPath,filename:evalPath,loaded:true,exports:{evaluationEngine:{rulesForAccount:async()=>rules}}};
const {countAboveTargets}=require('../src/services/challengeMetrics');
test('management target counts use independent category growth and cent units',async()=>{
 challenge={type:'hybrid',split_category_settings:true,starting_balance:9999,target_balance:99999,demo_starting_balance:100,demo_target_balance:120,demo_deposit_mode:'fixed',demo_target_enabled:true,demo_allow_below_start:false,real_starting_balance:100,real_target_balance:0,real_deposit_mode:'min_limit',real_target_percent:10,real_target_enabled:true,real_allow_below_start:false};rules={only_cent_account:true};
 entries=[{account_type:'demo',adjusted_balance:120,is_cent:false},{account_type:'real',adjusted_balance:11000,growth_percent:10,is_cent:true},{account_type:'real',adjusted_balance:20000,growth_percent:5,is_cent:true}];
 assert.deepEqual(await countAboveTargets(1),{demo:1,real:1,total:2});
 challenge.real_target_enabled=false;assert.deepEqual(await countAboveTargets(1),{demo:1,real:0,total:1});
 challenge={type:'real',starting_balance:30,target_balance:60,deposit_mode:'fixed',target_enabled:true};entries=[{account_type:'real',adjusted_balance:60,is_cent:true}];
 assert.equal((await countAboveTargets(1)).real,1,'real-only cent input stays in cents');
 rules.only_cent_account=false;assert.equal((await countAboveTargets(1)).real,0,'ordinary real input converts standard amount to cents');
});
