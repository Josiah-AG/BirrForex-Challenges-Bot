// Local-only isolated PostgreSQL schema; no real Telegram calls.
const assert=require('node:assert/strict'),{Pool}=require('pg'),{AsyncLocalStorage}=require('async_hooks');require('ts-node/register/transpile-only');
const schema='reminders_test_'+process.pid,pool=new Pool({host:'/tmp',database:'postgres',user:process.env.USER,options:`-c search_path=${schema}`,max:12}),context=new AsyncLocalStorage();
const db={query:(...args)=>(context.getStore()||pool).query(...args),transaction:async work=>{const c=await pool.connect();try{await c.query('BEGIN');const r=await context.run(c,work);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}};
const id=require.resolve('../../src/database/db');require.cache[id]={id,filename:id,loaded:true,exports:{db}};
const {migrateRegistrationReminders,startRegistrationReminders,deliverRegistrationReminder,reminderDay}=require('../../src/services/registrationReminders');
(async()=>{try{
 await pool.query(`CREATE SCHEMA ${schema}`);
 await pool.query(`CREATE TABLE trading_challenges(id int PRIMARY KEY,title text,status text,timezone text,registration_deadline timestamptz,start_date timestamptz,configuration_frozen_at timestamptz,host_id int,source text);
 CREATE TABLE trading_registrations(id serial,challenge_id int,user_id bigint,status text);
 CREATE TABLE trading_failed_attempts(id serial,challenge_id int,telegram_id bigint,username text,failure_type text,attempted_at timestamp DEFAULT NOW(),converted boolean DEFAULT false,engaged boolean DEFAULT false,engage_count int DEFAULT 0,last_engaged_at timestamp,engage_successful boolean DEFAULT false,UNIQUE(challenge_id,telegram_id));
 INSERT INTO trading_challenges(id,title,status,timezone,start_date) VALUES(1,'Synthetic','registration_open','UTC',NOW()+INTERVAL '10 days'),(2,'Synthetic two','registration_open','UTC',NOW()+INTERVAL '10 days');`);
 await migrateRegistrationReminders();await migrateRegistrationReminders();
 const enroll=async(user,challenge=1)=>{await startRegistrationReminders(challenge,user,'synthetic');await pool.query("UPDATE trading_failed_attempts SET registration_started_at=NOW()-INTERVAL '1 hour' WHERE telegram_id=$1",[user]);};
 let sends=0;const send=async()=>{sends++;return {message_id:sends}};
 await enroll(-1);const original=(await pool.query('SELECT registration_started_at FROM trading_failed_attempts WHERE telegram_id=-1')).rows[0].registration_started_at;await startRegistrationReminders(1,-1,'again');assert.equal(+(await pool.query('SELECT registration_started_at FROM trading_failed_attempts WHERE telegram_id=-1')).rows[0].registration_started_at,+original);
 await Promise.all(Array.from({length:10},()=>deliverRegistrationReminder(1,-1,send)));assert.equal(sends,1);
 await deliverRegistrationReminder(1,-1,send);assert.equal(sends,1); // persisted claim / restart replay
 await enroll(-1,2);await deliverRegistrationReminder(2,-1,send);assert.equal(sends,1); // global daily cap
 await enroll(-2);await pool.query('INSERT INTO trading_registrations(challenge_id,user_id) VALUES(1,-2)');assert.equal(await deliverRegistrationReminder(1,-2,send),'skipped');
 await enroll(-3);await pool.query('UPDATE trading_failed_attempts SET converted=true WHERE telegram_id=-3');assert.equal(await deliverRegistrationReminder(1,-3,send),'skipped');
 await enroll(-4);assert.equal(await deliverRegistrationReminder(1,-4,async()=>{throw Error('ambiguous timeout')}),'failed');assert.equal(await deliverRegistrationReminder(1,-4,send),'skipped');assert.equal(sends,1);
 await enroll(-5);await pool.query("UPDATE trading_challenges SET registration_deadline=NOW()-INTERVAL '1 second' WHERE id=1");assert.equal(await deliverRegistrationReminder(1,-5,send),'skipped');
 await pool.query("UPDATE trading_challenges SET registration_deadline=NOW()+INTERVAL '1 hour' WHERE id=1");await deliverRegistrationReminder(1,-5,async(u,stage)=>{assert.equal(stage,'final');return send()});assert.equal(sends,2);
 await enroll(-6);await pool.query('UPDATE trading_failed_attempts SET last_engaged_at=NOW(),engage_count=4 WHERE telegram_id=-6');await migrateRegistrationReminders();assert.equal(await deliverRegistrationReminder(1,-6,send),'skipped');
 // A cancellation after the claim but before delivery is rechecked.
 await enroll(-7);const q=db.query;let checks=0;db.query=async(sql,args)=>{if(sql.startsWith('SELECT fa.*')&&Number(args[1])===-7&&++checks===2)await pool.query('INSERT INTO trading_registrations(challenge_id,user_id) VALUES(1,-7)');return q(sql,args)};
 assert.equal(await deliverRegistrationReminder(1,-7,send),'cancelled');assert.equal(sends,2);db.query=q;
 console.log('PASS: persistent migration, 10 concurrent claims, repeat start, restart replay, cross-challenge daily cap, registration cancellation, closed deadline, final replacement, legacy migration and ambiguous failure');
}finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end()}})().catch(e=>{console.error(e);process.exitCode=1});
