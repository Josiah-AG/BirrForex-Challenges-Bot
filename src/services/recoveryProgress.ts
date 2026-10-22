import { db } from '../database/db';

type Round = { startedAt: number; total: number; checked: number; recovered: number; credentials: number; active: boolean };
const rounds = new Map<number, Round>();
export const recoveryProgress = {
  begin(challengeId: number, total: number) {
    rounds.set(challengeId, { startedAt: Date.now(), total, checked: 0, recovered: 0, credentials: 0, active: false });
  },
  checking(challengeId: number) { const r=rounds.get(challengeId); if(r) r.active=true; },
  checked(challengeId: number, recovered: boolean, credentials: boolean) {
    const r=rounds.get(challengeId); if(r){r.checked++;r.recovered+=Number(recovered);r.credentials+=Number(credentials);r.active=false;}
  },
  finish(challengeId: number) { const r=rounds.get(challengeId); if(r) r.active=false; },
};

export async function getRecoveryProgress(challengeId: number) {
  // Persisted retry state remains authoritative across restarts. Never show a stale
  // in-memory operation as running after a restart or a newer main pull.
  const result=await db.query(`SELECT COUNT(*)::int AS pending, MIN(r.history_retry_at) AS next_retry_at
    FROM wp_current_registrations r JOIN trading_challenges c ON c.id=r.challenge_id
    WHERE r.challenge_id=$1 AND r.status IS DISTINCT FROM 'removed' AND r.connection_verified=true
      AND COALESCE(r.pull_status,'') NOT IN ('password_changed','invalid_credentials')
      AND r.history_sync_state IN ('incomplete','verified','evaluation_failed') AND r.history_retry_at IS NOT NULL
      AND c.status IN ('active','reviewing') AND c.leaderboard_locked_at IS NULL`,[challengeId]);
  const latest=await db.query('SELECT started_at,status FROM wp_pull_batches WHERE challenge_id=$1 ORDER BY id DESC LIMIT 1',[challengeId]);
  let round=rounds.get(challengeId);
  if(round && latest.rows[0] && new Date(latest.rows[0].started_at).getTime()>round.startedAt){rounds.delete(challengeId);round=undefined;}
  const pending=Number(result.rows[0]?.pending||0);
  const active=!!round?.active;
  return { visible: pending>0 || active, state: active?'running':pending>0?'waiting':round?'complete':'idle',
    total:round?.total||0, checked:round?.checked||0, recovered:round?.recovered||0,
    credentialFailures:round?.credentials||0, pending, nextRetryAt:result.rows[0]?.next_retry_at||null,
    mainPullRunning:latest.rows[0]?.status==='running' };
}
