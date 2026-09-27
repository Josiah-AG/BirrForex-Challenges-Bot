// Explicit local-only PostgreSQL integration test. Never reads DATABASE_URL.
const assert=require('node:assert/strict');const {Pool}=require('pg');const fs=require('node:fs');
require('ts-node/register/transpile-only');
const schema='screening_test_'+process.pid;
const pool=new Pool({host:'/tmp',database:'postgres',user:process.env.USER,options:`-c search_path=${schema}`,max:10});
const mock=(p,exports)=>{const id=require.resolve(p);require.cache[id]={id,filename:id,loaded:true,exports};};
mock('../../src/database/db',{db:{query:(...a)=>pool.query(...a),getClient:()=>pool.connect()}});
let mode='CHANGING';
class Broker{async checkAllocation(){return {affiliation:mode!=='LEFT',client_uid:'uid'};}async getFullUuid(){return 'uuid';}async getKycStatus(){return {client_status:mode};}}
mock('../../src/services/exnessService',{ExnessService:Broker,exnessService:new Broker()});
mock('../../src/services/hostService',{hostService:{getBrokerCredentials:async()=>({email:'fake'})}});
mock('../../src/services/tradingChallengeService',{tradingChallengeService:{getActiveRegistrations:async id=>(await pool.query('SELECT * FROM trading_registrations WHERE challenge_id=$1 AND disqualified=false',[id])).rows,saveScreeningResult:async()=>{}}});
mock('../../src/services/emailService',{emailService:{sendGeneric:async()=>true}});
const {runPartnerScreening,deliverPartnerNotices}=require('../../src/services/partnerScreening');
(async()=>{try{
 await pool.query(`CREATE SCHEMA ${schema}`);
 await pool.query(`CREATE TABLE hosts(id int primary key,has_broker_integration boolean);CREATE TABLE trading_challenges(id int primary key,host_id int,status text,title text,timezone text);CREATE TABLE trading_registrations(id int primary key,challenge_id int,email text,nickname text,account_number text,account_type text,client_uid text,source text,user_id bigint,status text,disqualified boolean default false,disqualified_at timestamptz,disqualified_source text,disqualified_reason text,partner_status text,partner_warned_at timestamptz)`);
 const migration=fs.readFileSync('src/database/hardeningMigration.ts','utf8');
 for(const table of ['partner_screening_runs','partner_notice_outbox','partner_screening_changes']){const start=migration.indexOf('CREATE TABLE IF NOT EXISTS '+table),end=migration.indexOf('`);',start);await pool.query(migration.slice(start,end));}
 await pool.query("INSERT INTO hosts VALUES(1,true);INSERT INTO trading_challenges VALUES(1,1,'active','Synthetic challenge','Africa/Addis_Ababa');INSERT INTO trading_registrations(id,challenge_id,email,nickname,source,user_id) VALUES(1,1,'fake@example.invalid','Synthetic','winnerpip',-1)");
 await Promise.all([runPartnerScreening({id:1},'2026-09-27:day'),runPartnerScreening({id:1},'2026-09-27:day')]);
 assert.equal((await pool.query('SELECT count(*) FROM partner_notice_outbox')).rows[0].count,'1');
 await runPartnerScreening({id:1},'2026-09-27:day');assert.equal((await pool.query('SELECT count(*) FROM partner_notice_outbox')).rows[0].count,'1');
 mode='UNRECOGNIZED';await runPartnerScreening({id:1},'2026-09-27:night');assert.equal((await pool.query('SELECT partner_status FROM trading_registrations')).rows[0].partner_status,'CHANGING');
 mode='ACTIVE';await runPartnerScreening({id:1},'2026-09-28:day');assert.equal((await pool.query('SELECT partner_status FROM trading_registrations')).rows[0].partner_status,null);
 await deliverPartnerNotices({sendMessage(){throw Error('Hosted report leaked')}});assert.equal((await pool.query('SELECT error FROM partner_notice_outbox')).rows[0].error,'Superseded');
 mode='LEFT';await runPartnerScreening({id:1},'2026-09-28:night');assert.equal((await pool.query('SELECT disqualified FROM trading_registrations')).rows[0].disqualified,true);
 await deliverPartnerNotices({sendMessage(){throw Error('Hosted report leaked')}});assert.equal((await pool.query('SELECT count(*) FROM partner_notice_outbox WHERE sent_at IS NULL')).rows[0].count,'0');
 console.log('PASS: local PostgreSQL migration, concurrent lease, once-per-slot, unknown status, warning clear, departure, durable delivery');
}finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
