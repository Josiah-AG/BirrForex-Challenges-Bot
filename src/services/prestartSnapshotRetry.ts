import {db} from '../database/db';

/** Durable cooldowns survive restarts; credential changes invalidate stale failures. */
export async function recordPrestartSnapshotFailure(challengeId:number,reg:any,credentialFailure:boolean):Promise<void>{
  if(credentialFailure){
    // Existing trigger queues one access-issue notice for this failure episode.
    await db.query(`UPDATE trading_registrations SET pull_status='invalid_credentials',
      pull_error='Broker rejected account credentials. Update your investor password or account details.',
      credential_failure_detected_at=COALESCE(credential_failure_detected_at,NOW()),
      prestart_retry_at=NULL
      WHERE id=$1 AND challenge_id=$2 AND investor_password=$3 AND disqualified=false
      AND status IS DISTINCT FROM 'removed'`,[reg.id,challengeId,reg.investor_password]);
    return;
  }
  await db.query(`UPDATE trading_registrations SET prestart_retry_attempts=prestart_retry_attempts+1,
    prestart_retry_updated_at=NOW(),
    prestart_retry_at=NOW()+LEAST(30,2*POWER(2,LEAST(prestart_retry_attempts,4)))*INTERVAL '1 minute'
    WHERE id=$1 AND challenge_id=$2 AND investor_password=$3 AND disqualified=false
    AND status IS DISTINCT FROM 'removed'`,[reg.id,challengeId,reg.investor_password]);
}
