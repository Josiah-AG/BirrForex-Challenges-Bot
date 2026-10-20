import { db } from '../database/db';

/** Preserve original batch totals; report only subsequent verified publications. */
export async function annotatePullRecovery(batches: any[]): Promise<void> {
  const ids = batches.filter(b => Number(b.failed) > 0 && b.completed_at && !b.error_log).map(b => b.id);
  if (!ids.length) return;
  const current = await db.query(`SELECT challenge_id, COUNT(*)::int AS failures FROM trading_registrations
    WHERE challenge_id=ANY($1::int[]) AND status IS DISTINCT FROM 'removed'
      AND disqualified=false AND COALESCE(pull_status,'') NOT IN ('password_changed','invalid_credentials') AND (history_sync_state IN ('incomplete','evaluation_failed')
        OR pull_status NOT IN ('success','ready','never_pulled','pending_verify','password_changed','invalid_credentials'))
    GROUP BY challenge_id`, [[...new Set(batches.map(b=>Number(b.challenge_id)).filter(Boolean))]]);
  const active = new Map(current.rows.map(r=>[Number(r.challenge_id),Number(r.failures)]));
  const result = await db.query(`SELECT pe.pull_batch_id, COUNT(DISTINCT pe.registration_id)::int AS recovered
    FROM wp_pull_errors pe
    JOIN wp_pull_batches b ON b.id=pe.pull_batch_id
    JOIN trading_registrations r ON r.id=pe.registration_id
    WHERE pe.pull_batch_id=ANY($1::int[]) AND pe.error_code <> 'sl_check_failed'
      AND r.pull_status='success' AND r.history_sync_state='published'
      AND r.history_published_at>b.completed_at AND r.history_verified_through>=b.started_at
    GROUP BY pe.pull_batch_id`, [ids]);
  const counts = new Map(result.rows.map(r => [Number(r.pull_batch_id), Number(r.recovered)]));
  const credentials = await db.query(`SELECT pe.pull_batch_id, COUNT(DISTINCT pe.registration_id)::int AS credentials
    FROM wp_pull_errors pe JOIN trading_registrations r ON r.id=pe.registration_id
    WHERE pe.pull_batch_id=ANY($1::int[]) AND pe.error_code <> 'sl_check_failed'
      AND r.pull_status IN ('password_changed','invalid_credentials')
    GROUP BY pe.pull_batch_id`, [ids]);
  const credentialCounts = new Map(credentials.rows.map(r=>[Number(r.pull_batch_id),Number(r.credentials)]));
  for (const b of batches) {
    b.currentPullFailures = active.get(Number(b.challenge_id)) || 0;
    b.recovered = Math.min(Number(b.failed || 0), counts.get(Number(b.id)) || 0);
    b.credentialFailures = Math.min(Number(b.failed || 0) - b.recovered, credentialCounts.get(Number(b.id)) || 0);
    b.remainingFailed = Number(b.failed || 0) - b.recovered - b.credentialFailures;
  }
}
