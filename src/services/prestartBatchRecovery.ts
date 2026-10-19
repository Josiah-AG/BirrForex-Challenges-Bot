import {db} from '../database/db';
/** A pre-start verify request is bounded to under 11 minutes; heartbeat after each attempt. */
export async function reconcilePrestartBatches():Promise<void>{
 await db.query(`UPDATE wp_pull_batches b SET status='interrupted',completed_at=NOW(),
   phase='interrupted',error_log='pre_start_check_interrupted'
   FROM trading_challenges c WHERE b.challenge_id=c.id AND b.status='running'
   AND b.error_log='pre_start_check'
   AND (c.status<>'registration_open' OR COALESCE(b.phase_started_at,b.started_at)<NOW()-INTERVAL '15 minutes')`);
}
