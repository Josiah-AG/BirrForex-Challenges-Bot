import { db } from '../database/db';

/**
 * Leaderboard Service — Separated from evaluation engine
 *
 * Ranking Tiers (per account_type):
 * Tier 1: Active traders (has trades, balance > 0, not DQ'd) — by adjusted_balance DESC, total_trades DESC, last_trade_time ASC, avg profit/trade DESC
 * Tier 2: Haven't started trading (0 trades, not DQ'd) — by registration date ASC
 * Tier 3: Blown accounts (had trades, balance ≤ 0, not DQ'd) — by zero_balance_at DESC
 * Tier 4: Disqualified — by disqualified_at DESC
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
      let offset = 0;

      // Tier 1: Active traders (has trades, balance > 0, not DQ'd)
      // Sorted by: normalized_balance DESC ($ equivalent), total_trades DESC, last_trade_time ASC
      const tier1 = await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT id, ROW_NUMBER() OVER (
            ORDER BY COALESCE(normalized_balance, adjusted_balance) DESC, total_trades DESC, last_trade_time ASC,
            CASE WHEN total_trades > 0 THEN qualified_profit / total_trades ELSE 0 END DESC
          ) as rn
          FROM wp_leaderboard
          WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
            AND total_trades > 0 AND (current_balance > 0 OR current_balance IS NULL)
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType]
      );

      const tier1Count = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_leaderboard
         WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
           AND total_trades > 0 AND (current_balance > 0 OR current_balance IS NULL)`,
        [challengeId, accountType]
      );
      offset = parseInt(tier1Count.rows[0].cnt);

      // Tier 2: Haven't started trading (0 trades, not DQ'd) — by registration date ASC
      await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT l.id, (ROW_NUMBER() OVER (ORDER BY r.registered_at ASC)) + $3 as rn
          FROM wp_leaderboard l
          JOIN trading_registrations r ON l.registration_id = r.id
          WHERE l.challenge_id=$1 AND l.account_type=$2 AND l.is_disqualified=false
            AND l.total_trades = 0
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType, offset]
      );

      const tier2Count = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_leaderboard
         WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false AND total_trades = 0`,
        [challengeId, accountType]
      );
      offset += parseInt(tier2Count.rows[0].cnt);

      // Tier 3: Blown accounts (had trades, balance ≤ 0, not DQ'd) — by zero_balance_at DESC
      await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT id, (ROW_NUMBER() OVER (ORDER BY zero_balance_at DESC NULLS LAST)) + $3 as rn
          FROM wp_leaderboard
          WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
            AND total_trades > 0 AND current_balance <= 0 AND current_balance IS NOT NULL
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType, offset]
      );

      const tier3Count = await db.query(
        `SELECT COUNT(*) as cnt FROM wp_leaderboard
         WHERE challenge_id=$1 AND account_type=$2 AND is_disqualified=false
           AND total_trades > 0 AND current_balance <= 0 AND current_balance IS NOT NULL`,
        [challengeId, accountType]
      );
      offset += parseInt(tier3Count.rows[0].cnt);

      // Tier 4: Disqualified — by disqualified_at DESC
      await db.query(
        `UPDATE wp_leaderboard SET rank = sub.rn FROM (
          SELECT l.id, (ROW_NUMBER() OVER (ORDER BY r.disqualified_at DESC NULLS LAST)) + $3 as rn
          FROM wp_leaderboard l
          JOIN trading_registrations r ON l.registration_id = r.id
          WHERE l.challenge_id=$1 AND l.account_type=$2 AND l.is_disqualified=true
        ) sub WHERE wp_leaderboard.id = sub.id`,
        [challengeId, accountType, offset]
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
   * Ensure all registered participants have a leaderboard entry.
   * Called before ranking to guarantee everyone gets a rank.
   */
  async ensureAllParticipantsHaveEntries(challengeId: number): Promise<void> {
    await db.query(
      `INSERT INTO wp_leaderboard
       (challenge_id, registration_id, account_number, telegram_id, username, nickname, account_type,
        starting_balance, current_balance, adjusted_balance, qualified_profit, gross_profit, profit_removed,
        total_trades, qualified_trades, flagged_trades, active_days, is_qualified, last_updated)
       SELECT r.challenge_id, r.id, r.account_number, r.telegram_id, r.username, r.nickname, r.account_type,
              COALESCE(r.actual_starting_balance, r.registration_balance, c.starting_balance),
              COALESCE(r.last_known_balance, r.registration_balance, 0),
              COALESCE(r.actual_starting_balance, r.registration_balance, c.starting_balance),
              0, 0, 0, 0, 0, 0, 0, false, NOW()
       FROM trading_registrations r
       JOIN trading_challenges c ON r.challenge_id = c.id
       WHERE r.challenge_id = $1
         AND r.investor_password IS NOT NULL
         AND r.connection_verified = true
         AND NOT EXISTS (SELECT 1 FROM wp_leaderboard l WHERE l.registration_id = r.id)`,
      [challengeId]
    );
  }

  /**
   * Flush staging data to live leaderboard table.
   * Called at the START of each new cycle — copies all staging data to live in one transaction.
   */
  async flushStagingToLive(challengeId: number): Promise<void> {
    // Check if staging has data for this challenge
    const stagingCount = await db.query(
      `SELECT COUNT(*) as cnt FROM wp_leaderboard_staging WHERE challenge_id = $1`,
      [challengeId]
    );
    if (parseInt(stagingCount.rows[0].cnt) === 0) return;

    console.log(`📊 Leaderboard: Flushing staging → live for challenge ${challengeId}`);

    // Upsert from staging to live in one query
    await db.query(
      `INSERT INTO wp_leaderboard
       (challenge_id, registration_id, account_number, telegram_id, username, nickname, account_type, is_cent,
        starting_balance, current_balance, adjusted_balance, normalized_balance, qualified_profit, gross_profit, profit_removed,
        total_trades, qualified_trades, flagged_trades, active_days, is_qualified, last_trade_time, last_updated, zero_balance_at)
       SELECT challenge_id, registration_id, account_number, telegram_id, username, nickname, account_type, is_cent,
              starting_balance, current_balance, adjusted_balance, normalized_balance, qualified_profit, gross_profit, profit_removed,
              total_trades, qualified_trades, flagged_trades, active_days, is_qualified, last_trade_time, NOW(), zero_balance_at
       FROM wp_leaderboard_staging WHERE challenge_id = $1
       ON CONFLICT (challenge_id, registration_id) DO UPDATE SET
         current_balance=EXCLUDED.current_balance, adjusted_balance=EXCLUDED.adjusted_balance,
         normalized_balance=EXCLUDED.normalized_balance, is_cent=EXCLUDED.is_cent,
         qualified_profit=EXCLUDED.qualified_profit, gross_profit=EXCLUDED.gross_profit,
         profit_removed=EXCLUDED.profit_removed, total_trades=EXCLUDED.total_trades,
         qualified_trades=EXCLUDED.qualified_trades, flagged_trades=EXCLUDED.flagged_trades,
         active_days=EXCLUDED.active_days, is_qualified=EXCLUDED.is_qualified,
         last_trade_time=EXCLUDED.last_trade_time, last_updated=NOW(),
         zero_balance_at=EXCLUDED.zero_balance_at`,
      [challengeId]
    );

    // Clear staging after flush
    await db.query(`DELETE FROM wp_leaderboard_staging WHERE challenge_id = $1`, [challengeId]);

    console.log(`✅ Leaderboard: Staging flushed to live for challenge ${challengeId}`);
  }

  /**
   * Get the timestamp of the last leaderboard update for display purposes.
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
        r.email,
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
         AND r.pull_status NOT IN ('success', 'password_changed', 'ready', 'never_pulled', 'pending_verify')
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
  email: string | null;
  pull_status: string;
  pull_error: string | null;
  last_pull_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  error_time: Date | null;
}

export const leaderboardService = new LeaderboardService();
