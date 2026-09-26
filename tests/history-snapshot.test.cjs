require('ts-node/register/transpile-only');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateHistorySnapshot}=require('../src/utils/historySnapshot');
const base=()=>({success:true,protocol_version:2,complete:true,account:'1',server:'Broker',request_id:'r',balance:100,equity:100,ledger_expected:100,ledger_tolerance:.01,source_cutoff:new Date().toISOString(),history_digest:'a'.repeat(64),history_count:0,trades:[],deals:[],balance_ops:[],closing_tickets:[]});
const validate=x=>validateHistorySnapshot(x,'1','Broker','r');
test('verified empty history is accepted independently of trade count',()=>assert.equal(validate(base()).complete,true));
for(const [name,patch]of Object.entries({legacy:{protocol_version:1},identity:{account:'2'},request:{request_id:'old'},ledger:{ledger_expected:0},nonfinite:{equity:NaN},future:{source_cutoff:'2999-01-01'},manifest:{closing_tickets:[1]},fee:{deals:[{ticket:1,time:'2020-01-01',profit:0,commission:NaN}]},operation:{balance_ops:[{ticket:1,time:'bad',amount:1,op_type:'deposit'}]}}))test(`reject ${name}`,()=>assert.throws(()=>validate({...base(),...patch})));
test('invalid close timestamp cannot pass comparison with NaN',()=>{
 const x=base();x.deals=[{ticket:1,time:'2020-01-01',profit:0,commission:0,swap:0,fee:0,volume:1,price:1}];
 x.trades=[{ticket:1,open_time:'2020-01-01',close_time:'bad',volume:1,open_price:1,close_price:1,profit:0,commission:0,swap:0}];x.closing_tickets=[1];assert.throws(()=>validate(x),/times/);
});
