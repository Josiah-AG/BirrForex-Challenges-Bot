import { db } from '../database/db';

/**
 * Leaderboard Service — Separated from evaluation engine
 *
 * Handles:
 * - Ranking updates (called at START of next cycle, not after each pull)
 * - Final leaderboard update (Saturday sync — immediate)
 * - Data freshness tracking ("Data from: [previous cycle time]")
 */

export class LeaderboardService {
  /**
   * Update rankings for a challenge.
   * Called at the START of a new pull cycle (using data from the PREVIOUS cycle).
   * Exception: Final Saturday sync → called immediately after pull completes.
   */
  async updateRankings(challengeId: number): Promise<void> {
    console.log(`📊 Leaderboard: Updating rankings for challenge ${challengeId}`);

    for (const accountType of ['demo', 'real']) {
      await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY adjusted_balance DESC) as rn
          FROM wp_leaderboard WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType]
      );
    }

    // Record when rankings were last updated
    await db.query(
      `UPDATE trading_challenges SET leaderboard_updated_at = NOW() WHERE id = $1`,
      [challengeId]
    );

    console.log(`✅ Leaderboard: Rankings updated for challenge ${challengeId}`);
  }

  /**
   * Get the timestamp of the last leaderboard update for display purposes.
   * User dashboard shows "Data from: [previous cycle time]"
   */
  async getLastUpdateTime(challengeId: number): Promise<Date | null> {
    const result = await db.query(
      `SELECT leaderboard_updated_at FROM trading_challenges WHERE id = $1`,
      [challengeId]
    );
    return result.rows[0]?.leaderboard_updated_at || null;
  }

  /**
   * Get failed accounts for a challenge (for admin dashboard)
   */
  async getFailedAccounts(challengeId: number): Promise<FailedAccount[]> {
    const result = await db.query(
      `SELECT
        r.id as registration_id,
        r.account_number,
        r.telegram_id,
        r.username,
        r.nickname,
        r.pull_status,
        r.pull_error,
        r.last_pull_at,
        e.error_code,
        e.error_message,
        e.created_at as error_time
       FROM trading_registrations r
       LEFT JOIN LATERAL (
         SELECT error_code, error_message, created_at
         FROM wp_pull_errors
         WHERE registration_id = r.id
         ORDER BY created_at DESC
         LIMIT 1
       ) e ON true
       WHERE r.challenge_id = $1
         AND r.disqualified = false
         AND r.pull_status NOT IN ('success', 'password_changed')
         AND r.pull_status IS NOT NULL
       ORDER BY r.last_pull_at DESC`,
      [challengeId]
    );
    return result.rows;
  }

  /**
   * Get accounts that failed in the last pull cycle (for priority queue)
   */
  async getLastCycleFailures(challengeId: number): Promise<number[]> {
    const result = await db.query(
      `SELECT id FROM trading_registrations
       WHERE challenge_id = $1
         AND disqualified = false
         AND investor_password IS NOT NULL
         AND connection_verified = true
         AND pull_status NOT IN ('success', 'password_changed')
         AND pull_status IS NOT NULL
       ORDER BY id`,
      [challengeId]
    );
    return result.rows.map((r: any) => r.id);
  }
}

export interface FailedAccount {
  registration_id: number;
  account_number: string;
  telegram_id: number;
  username: string | null;
  nickname: string | null;
  pull_status: string;
  pull_error: string | null;
  last_pull_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  error_time: Date | null;
}

export const leaderboardService = new LeaderboardService();
