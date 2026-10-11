const {test}=require('node:test'),assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const axios=require('axios');const {ExnessService}=require('../src/services/exnessService');
test('simultaneous verification shares authentication and retries expired JWT once',async()=>{
 const oldPost=axios.post,oldRequest=axios.request;let auth=0,requests=0;
 axios.post=async()=>{auth++;await new Promise(r=>setImmediate(r));return {data:{token:'token'+auth}}};
 axios.request=async()=>{requests++;if(requests===1)throw {response:{status:401}};return {data:{affiliation:true}}};
 try{const s=new ExnessService({email:'test',password:'test'});const results=await Promise.all([s.checkAllocation('a@example.invalid'),s.checkAllocation('b@example.invalid')]);assert.ok(results.every(x=>x.affiliation));assert.equal(auth,2);assert.equal(requests,3);}finally{axios.post=oldPost;axios.request=oldRequest;}
});
test('a new client missing in a warm report cache is resolved after refresh',async()=>{
 const oldPost=axios.post,oldRequest=axios.request;let loads=0;
 axios.post=async()=>({data:{token:'fake'}});axios.request=async()=>({data:{client_uid:++loads===1?['abc-client']:['abc-client','new-client']}});
 try{const s=new ExnessService({email:'test',password:'test'});assert.equal(await s.getFullUuid('abc'),'abc-client');assert.equal(await s.getFullUuid('new'),'new-client');assert.equal(loads,2);assert.equal(await s.getFullUuid('new'),'new-client');assert.equal(loads,2);}finally{axios.post=oldPost;axios.request=oldRequest;}
});
test('ambiguous client IDs remain unverified',async()=>{
 const oldPost=axios.post,oldRequest=axios.request;axios.post=async()=>({data:{token:'fake'}});axios.request=async()=>({data:{client_uid:['abc-one','abc-two']}});
 try{assert.equal(await new ExnessService({email:'test',password:'test'}).getFullUuid('abc'),null);}finally{axios.post=oldPost;axios.request=oldRequest;}
});
