import {db} from '../database/db';
import {exnessService} from './exnessService';
import {newClientReport} from '../utils/newChallengeClients';
export async function migrateNewClients(){
 await db.query('ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS registration_opened_at TIMESTAMPTZ');
 await db.query(`CREATE OR REPLACE FUNCTION wp_record_registration_open() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='registration_open' AND NEW.registration_opened_at IS NULL AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.registration_opened_at=NOW(); END IF; RETURN NEW; END $$`);
 await db.query('DROP TRIGGER IF EXISTS wp_registration_open_stamp ON trading_challenges');
 await db.query('CREATE TRIGGER wp_registration_open_stamp BEFORE INSERT OR UPDATE OF status ON trading_challenges FOR EACH ROW EXECUTE FUNCTION wp_record_registration_open()');
 await db.query(`CREATE TABLE IF NOT EXISTS wp_new_client_reports(challenge_id INTEGER PRIMARY KEY REFERENCES trading_challenges(id),report JSONB,updated_at TIMESTAMPTZ,error TEXT)`);
}
export async function refreshNewClients(){
 const lease=await db.getClient();let locked=false;
 try{
  locked=(await lease.query('SELECT pg_try_advisory_lock(26101701) AS locked')).rows[0].locked;if(!locked)return;
  const challenges=(await db.query(`SELECT c.*, (SELECT MIN(registered_at) FROM trading_registrations WHERE challenge_id=c.id) first_registration
   FROM trading_challenges c LEFT JOIN wp_new_client_reports n ON n.challenge_id=c.id
   WHERE c.host_id IS NULL AND c.status IN ('registration_open','active','reviewing','completed','submission_open')
   AND (n.report IS NULL OR c.status='registration_open' OR n.updated_at<c.start_date+INTERVAL '2 days' OR (n.error IS NOT NULL AND n.updated_at<NOW()-INTERVAL '1 hour') OR ((n.report->>'unresolved')::integer>0 AND n.updated_at<NOW()-INTERVAL '1 day'))`)).rows;
  if(!challenges.length)return;
  for(const c of challenges)await db.query('INSERT INTO wp_new_client_reports(challenge_id) VALUES($1) ON CONFLICT DO NOTHING',[c.id]);
  const clients=await exnessService.clientDirectory();
  for(const c of challenges){
   const participants=(await db.query(`SELECT nickname,username,email,account_number,account_type,client_uid,registered_at FROM trading_registrations WHERE challenge_id=$1 AND status IS DISTINCT FROM 'removed'`,[c.id])).rows;
   const report=newClientReport(c,participants,clients);
   await db.query(`INSERT INTO wp_new_client_reports(challenge_id,report,updated_at,error) VALUES($1,$2,NOW(),NULL)
    ON CONFLICT(challenge_id) DO UPDATE SET report=EXCLUDED.report,updated_at=NOW(),error=NULL`,[c.id,JSON.stringify(report)]);
  }
 }catch{await db.query(`UPDATE wp_new_client_reports SET error='Refresh delayed. Showing the last successful update.' WHERE challenge_id IN (SELECT id FROM trading_challenges WHERE host_id IS NULL)`);console.error('[new-clients] Refresh unavailable');}
 finally{if(locked)await lease.query('SELECT pg_advisory_unlock(26101701)');lease.release();}
}
export async function readNewClients(id:number){
 const c=(await db.query('SELECT host_id,source,status,type FROM trading_challenges WHERE id=$1',[id])).rows[0];
 if(!c)return null;if(c.host_id)return {enabled:false};
 const row=(await db.query('SELECT report,error FROM wp_new_client_reports WHERE challenge_id=$1',[id])).rows[0];
 return {enabled:true,challengeType:c.type,...(row?.report||{count:null,rows:[],notice:'Awaiting first update'}),error:row?.error||null};
}
export function startNewClientScheduler(){setTimeout(()=>void refreshNewClients(),30000).unref();setInterval(()=>void refreshNewClients(),3600000).unref();}
