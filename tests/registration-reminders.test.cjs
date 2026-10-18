const {test}=require('node:test');const assert=require('node:assert/strict');require('ts-node/register/transpile-only');
const dbid=require.resolve('../src/database/db');require.cache[dbid]={id:dbid,filename:dbid,loaded:true,exports:{db:{}}};
const {reminderDue,reminderDay}=require('../src/services/registrationReminders');
const d=x=>new Date(x),zone='Africa/Nairobi',close=d('2026-10-18T18:00:00Z'),start=d('2026-10-13T07:00:00Z');
test('Tuesday start: 1h Tuesday, 24h Wednesday, 72h Friday, final Sunday',()=>{
 for(const [time,expected] of [['2026-10-13T07:59:59Z',null],['2026-10-13T08:00:00Z','1h'],['2026-10-14T07:00:00Z','24h'],['2026-10-16T07:00:00Z','72h'],['2026-10-18T07:00:00Z','final'],['2026-10-18T18:00:00Z',null]])assert.equal(reminderDue(start,close,d(time),zone),expected);
});
test('final day replaces every ordinary slot, already-used stages never replay',()=>{
 const s=d('2026-10-15T07:00:00Z');assert.equal(reminderDue(s,close,d('2026-10-18T07:00:00Z'),zone),'final');
 assert.equal(reminderDue(s,close,d('2026-10-18T08:00:00Z'),zone,['final']),null);
 assert.equal(reminderDue(start,close,d('2026-10-14T08:00:00Z'),zone,['24h']),null);
});
test('no backlog on missed days; midnight closure uses last open calendar day',()=>{
 assert.equal(reminderDue(start,close,d('2026-10-15T08:00:00Z'),zone),null);
 assert.equal(reminderDue(start,d('2026-10-18T21:00:00Z'),d('2026-10-18T10:00:00Z'),zone),'final');
 assert.equal(reminderDue(start,close,d('2026-10-18T18:01:00Z'),zone),null);
});
test('timezone and DST day boundaries use local calendar, not elapsed 24h',()=>{
 assert.equal(reminderDay(d('2026-10-18T21:01:00Z'),zone),'2026-10-19');
 assert.equal(reminderDay(d('2026-11-01T05:30:00Z'),'America/New_York'),reminderDay(d('2026-11-01T06:30:00Z'),'America/New_York'));
 assert.equal(reminderDue(d('invalid'),close,start,zone),null);
});
