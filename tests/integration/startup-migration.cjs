const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{Client}=require('pg');
const url=process.env.TEST_DATABASE_URL;if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw Error('Local synthetic database required');
const client=new Client({connectionString:url});
(async()=>{await client.connect();try{
 const id=(await client.query("INSERT INTO trading_challenges(title,type,status,start_date,end_date,starting_balance,target_balance) VALUES('SYNTHETIC startup integrity','demo','registration_open','2099-01-01','2099-02-01',100,200) RETURNING id")).rows[0].id;
 const reg=(await client.query("INSERT INTO trading_registrations(challenge_id,user_id,email,account_number,account_type,connection_verified) VALUES($1,-999999,'startup@test.invalid','999991','demo',true) RETURNING id",[id])).rows[0].id;
 await client.query("UPDATE trading_challenges SET status='reviewing',start_date='2020-01-01',end_date='2020-02-01' WHERE id=$1",[id]);
 await client.query("INSERT INTO wp_trades(challenge_id,registration_id,account_number,ticket,position_id,trade_type,profit) VALUES($1,$2,'999991',999991,999991,'Buy',10)",[id,reg]);
 const read=async()=>({challenge:(await client.query('SELECT * FROM trading_challenges WHERE id=$1',[id])).rows,trades:(await client.query('SELECT * FROM wp_trades WHERE challenge_id=$1',[id])).rows});const before=await read();
 for(let n=0;n<2;n++)execFileSync(process.execPath,['-r','ts-node/register/transpile-only','src/database/migrate.ts'],{env:{...process.env,DATABASE_URL:url,NODE_ENV:'test'},stdio:'pipe'});
 assert.deepEqual(await read(),before,'startup must not flip/delete trades or guess finalization');
 console.log('PASS: two complete startup migrations preserve synthetic historical trades and challenge lifecycle exactly');
 }finally{await client.end();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
