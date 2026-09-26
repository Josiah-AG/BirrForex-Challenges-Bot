import { db } from '../database/db';

// A release-scoped baseline allows account-level rollback without restoring the whole database.
export const PULL_RELEASE = '2026-09-26-history-v2';
export async function readPullState(registrationId: number): Promise<any> {
  const result = await db.query(`SELECT jsonb_build_object(
    'registration', (SELECT to_jsonb(r) - ARRAY['investor_password','email','phone','username','nickname'] FROM trading_registrations r WHERE id=$1),
    'trades', COALESCE((SELECT jsonb_agg(t ORDER BY t.id) FROM wp_trades t WHERE registration_id=$1),'[]'::jsonb),
    'deals', COALESCE((SELECT jsonb_agg(d ORDER BY d.id) FROM wp_deals d WHERE registration_id=$1),'[]'::jsonb),
    'balance_ops', COALESCE((SELECT jsonb_agg(o ORDER BY o.id) FROM wp_balance_ops o WHERE registration_id=$1),'[]'::jsonb),
    'leaderboard', COALESCE((SELECT jsonb_agg(to_jsonb(l)-ARRAY['rank','previous_rank'] ORDER BY l.id) FROM wp_leaderboard l WHERE registration_id=$1),'[]'::jsonb),
    'staging', COALESCE((SELECT jsonb_agg(l ORDER BY l.id) FROM wp_leaderboard_staging l WHERE registration_id=$1),'[]'::jsonb),
    'publication', (SELECT to_jsonb(p) FROM wp_account_publications p WHERE registration_id=$1)
  ) AS state`, [registrationId]);
  return result.rows[0].state;
}
export async function beginPullJournal(registrationId: number, challengeId: number) {
  // Call only inside db.transaction: the row lock spans the entire mutation.
  await db.query('SELECT id FROM trading_registrations WHERE id=$1 FOR UPDATE',[registrationId]);
  const state=await readPullState(registrationId);
  await db.query(`INSERT INTO wp_pull_operations(release_id,registration_id,challenge_id,transaction_id,before_state,after_state)
    VALUES($1,$2,$3,txid_current(),$4,$4) ON CONFLICT(release_id,registration_id,transaction_id) DO NOTHING`,[PULL_RELEASE,registrationId,challengeId,JSON.stringify(state)]);
}
export async function checkpointPullJournal(registrationId: number) {
  const state=await readPullState(registrationId);
  await db.query(`UPDATE wp_pull_operations SET after_state=$3,updated_at=NOW()
    WHERE release_id=$1 AND registration_id=$2 AND transaction_id=txid_current() AND restored_at IS NULL`,[PULL_RELEASE,registrationId,JSON.stringify(state)]);
}
