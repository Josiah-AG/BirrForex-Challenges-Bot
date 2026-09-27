const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
process.env.RESEND_API_KEY='synthetic';let deliveries=[],providerError=false;
const id=require.resolve('resend');require.cache[id]={id,filename:id,loaded:true,exports:{Resend:class{emails={send:async args=>{deliveries.push(args);return {error:providerError?{message:'Simulated failure'}:null};}}}}};
const {emailService}=require('../src/services/emailService');
const data={nickname:'Synthetic',challengeTitle:'Test',accountNumber:'123',accountType:'demo'};
test('registration notice is hosted-only and demo guidance is conditional',async()=>{
 for(const [hosted,accountType] of [[false,'demo'],[true,'real'],[true,'demo']]){
 await emailService.sendRegistrationConfirmation('test@example.invalid',{...data,hosted,accountType});const html=deliveries.at(-1).html;
 assert.equal(html.includes('Keep your investor password unchanged'),hosted);
 assert.equal(html.includes('pending order'),hosted && accountType==='demo');
 assert.equal(html.includes('Account replacement is unavailable'),hosted && accountType==='demo');
 }
});
test('provider errors are treated as failed delivery',async()=>{
 providerError=true;assert.equal(await emailService.sendGeneric('test@example.invalid','Test','Test'),false);
});
