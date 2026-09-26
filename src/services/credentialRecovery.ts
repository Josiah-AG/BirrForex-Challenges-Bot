import { db } from '../database/db';

export async function queueCredentialRecovery(registrationId: number, challengeId: number, source: 'user' | 'admin'): Promise<void> {
  await db.query(`INSERT INTO credential_recovery_jobs(registration_id,challenge_id,source) VALUES($1,$2,$3)
    ON CONFLICT(registration_id) DO UPDATE SET source=EXCLUDED.source,state='pending',attempts=0,error=NULL,
    version=credential_recovery_jobs.version+1,updated_at=NOW()`, [registrationId,challengeId,source]);
}

/** A verified credential and its recovery request commit together, before HTTP success. */
export async function saveVerifiedCredential(registrationId: number, challengeId: number, password: string, source: 'user' | 'admin'): Promise<void> {
  await db.transaction(async () => {
    const saved = await db.query(`UPDATE trading_registrations SET investor_password=$1,pull_status='success',pull_error=NULL,
      connection_verified=true,connection_verified_at=NOW(),last_pull_at=NULL,credential_failure_detected_at=NULL
      WHERE id=$2 AND challenge_id=$3 AND status IS DISTINCT FROM 'removed' RETURNING id`, [password,registrationId,challengeId]);
    if (!saved.rows.length) throw new Error('Registration not found or removed');
    await queueCredentialRecovery(registrationId,challengeId,source);
  });
}
