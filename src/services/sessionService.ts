import { db } from '../database/db';
import { UserSession, Answer, ShuffledOptions } from '../types';

/**
 * PostgreSQL-backed session storage for active quiz participants.
 * Survives bot restarts and deploys.
 */
class SessionService {

  /**
   * Create new session (upsert — replaces if exists)
   */
  async createSession(telegramId: number, challengeId: number, shuffledOptions: ShuffledOptions[]): Promise<void> {
    await db.query(
      `INSERT INTO quiz_sessions (telegram_id, challenge_id, current_question, answers, shuffled_options, started_at)
       VALUES ($1, $2, 0, '[]'::jsonb, $3::jsonb, NOW())
       ON CONFLICT (telegram_id, challenge_id) DO UPDATE SET
         current_question = 0, answers = '[]'::jsonb, shuffled_options = $3::jsonb, started_at = NOW()`,
      [telegramId, challengeId, JSON.stringify(shuffledOptions)]
    );
  }

  /**
   * Get session
   */
  async getSession(telegramId: number, challengeId: number): Promise<UserSession | null> {
    const result = await db.query(
      `SELECT telegram_id, challenge_id, current_question, answers, shuffled_options, started_at
       FROM quiz_sessions WHERE telegram_id = $1 AND challenge_id = $2`,
      [telegramId, challengeId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      telegram_id: Number(row.telegram_id),
      challenge_id: row.challenge_id,
      current_question: row.current_question,
      started_at: new Date(row.started_at),
      answers: row.answers || [],
      shuffled_options: row.shuffled_options || [],
    };
  }

  /**
   * Record answer and advance question
   */
  async recordAnswer(telegramId: number, challengeId: number, answer: Answer): Promise<void> {
    await db.query(
      `UPDATE quiz_sessions
       SET answers = answers || $3::jsonb, current_question = current_question + 1
       WHERE telegram_id = $1 AND challenge_id = $2`,
      [telegramId, challengeId, JSON.stringify([answer])]
    );
  }

  /**
   * Get current question number
   */
  async getCurrentQuestion(telegramId: number, challengeId: number): Promise<number> {
    const result = await db.query(
      `SELECT current_question FROM quiz_sessions WHERE telegram_id = $1 AND challenge_id = $2`,
      [telegramId, challengeId]
    );
    return result.rows[0]?.current_question || 0;
  }

  /**
   * Check if session exists
   */
  async hasSession(telegramId: number, challengeId: number): Promise<boolean> {
    const result = await db.query(
      `SELECT 1 FROM quiz_sessions WHERE telegram_id = $1 AND challenge_id = $2`,
      [telegramId, challengeId]
    );
    return result.rows.length > 0;
  }

  /**
   * Delete session
   */
  async deleteSession(telegramId: number, challengeId: number): Promise<void> {
    await db.query(
      `DELETE FROM quiz_sessions WHERE telegram_id = $1 AND challenge_id = $2`,
      [telegramId, challengeId]
    );
  }

  /**
   * Clear all sessions for a challenge
   */
  async clearChallengeSessions(challengeId: number): Promise<void> {
    await db.query(`DELETE FROM quiz_sessions WHERE challenge_id = $1`, [challengeId]);
  }

  /**
   * Get all active sessions count
   */
  async getActiveSessionsCount(): Promise<number> {
    const result = await db.query(`SELECT COUNT(*) as cnt FROM quiz_sessions`);
    return parseInt(result.rows[0]?.cnt || '0');
  }

  /**
   * Clean up expired sessions (older than 30 minutes)
   */
  async cleanupExpiredSessions(): Promise<void> {
    const result = await db.query(
      `DELETE FROM quiz_sessions WHERE started_at < NOW() - INTERVAL '30 minutes'`
    );
    if (result.rowCount && result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired quiz sessions`);
    }
  }
}

export const sessionService = new SessionService();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  sessionService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
