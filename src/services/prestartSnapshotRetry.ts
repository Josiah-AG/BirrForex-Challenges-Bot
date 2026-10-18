import {db} from '../database/db';

/** Durable cooldowns survive restarts; credential changes invalidate stale failures. */
export async function recordPrestartSnapshotFailure(challengeId:number,reg:any,credentialFailure:boolean):Promise<void>{
  if(credentialFailure){
    // The regular trigger only handles active challenges; queue pre-start notices atomically here.
    await db.query(`WITH failed AS (UPDATE trading_registrations SET pull_status='invalid_credentials',
      pull_error='Broker rejected account credentials. Update your investor password or account details.',
      credential_failure_detected_at=COALESCE(credential_failure_detected_at,NOW()),
      prestart_retry_at=NULL
      WHERE id=$1 AND challenge_id=$2 AND investor_password=$3 AND disqualified=false
      AND status IS DISTINCT FROM 'removed'
      RETURNING id,challenge_id,credential_failure_detected_at)
      INSERT INTO participant_notice_outbox(registration_id,challenge_id,kind,event_key,payload)
      SELECT id,challenge_id,'credential_failure',credential_failure_detected_at::text,
        jsonb_build_object('detectedAt',to_char(credential_failure_detected_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM failed
      ON CONFLICT(registration_id,kind,event_key) DO NOTHING`,[reg.id,challengeId,reg.investor_password]);
    return;
  }
  await db.query(`UPDATE trading_registrations SET prestart_retry_attempts=prestart_retry_attempts+1,
    prestart_retry_updated_at=NOW(),
    prestart_retry_at=NOW()+LEAST(30,2*POWER(2,LEAST(prestart_retry_attempts,4)))*INTERVAL '1 minute'
    WHERE id=$1 AND challenge_id=$2 AND investor_password=$3 AND disqualified=false
    AND status IS DISTINCT FROM 'removed'`,[reg.id,challengeId,reg.investor_password]);
}
