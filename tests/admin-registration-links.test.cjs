const {test}=require('node:test'),assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const {openAdminRegistration}=require('../src/utils/adminRegistrationLinks');
const now=Date.parse('2026-10-18T14:00:00Z'),sprint={id:39,status:'registration_open',start_date:'2026-10-18T21:00:00Z'};
test('additional posts select Sprint instead of newer deleted hosted test',()=>{
 const rows=[{...sprint,id:40,status:'deleted',host_id:5},sprint];assert.deepEqual(rows.filter(c=>openAdminRegistration(c,now)).map(c=>c.id),[39]);
});
test('host, discord, draft, active, frozen and closed challenges cannot receive join posts',()=>{
 for(const fields of [{host_id:1},{source:'discord'},{status:'draft'},{status:'active'},{configuration_frozen_at:new Date()},{registration_deadline:'2026-10-18T13:00:00Z'}])assert.equal(openAdminRegistration({...sprint,...fields},now),false);
 assert.equal(openAdminRegistration(sprint,Date.parse(sprint.start_date)),false);
});
