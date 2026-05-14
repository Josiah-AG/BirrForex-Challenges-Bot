import { db } from '../database/db';
import { Winner, Participant } from '../types';
import { userService } from './userService';

export class WinnerService {
  /**
   * Create winner entry
   */
  async createWinner(
    challengeId: number,
    userId: number,
    telegramId: number,
    username: string | undefined,
    position: number,
    prizeAmount: number
  ): Promise<Winner> {
    const result = await db.query(
      `INSERT INTO winners (challenge_id, user_id, telegram_id, username, position, prize_amount)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [challengeId, userId, telegramId, username, position, prizeAmount]
    );

    // Update user's win record
    await userService.recordWin(telegramId);

    return result.rows[0];
  }

  /**
   * Get winners for challenge
   */
  async getWinners(challengeId: number): Promise<Winner[]> {
    const result = await db.query(
      `SELECT w.*, u.first_name FROM winners w
       LEFT JOIN users u ON w.telegram_id = u.telegram_id
       WHERE w.challenge_id = $1 ORDER BY w.position ASC`,
      [challengeId]
    );

    return result.rows;
  }

  /**
   * Get winner by position
   */
  async getWinnerByPosition(challengeId: number, position: number): Promise<Winner | null> {
    const result = await db.query(
      'SELECT * FROM winners WHERE challenge_id = $1 AND position = $2',
      [challengeId, position]
    );

    return result.rows[0] || null;
  }

  /**
   * Mark prize as claimed
   */
  async markClaimed(winnerId: number): Promise<void> {
    await db.query(
      `UPDATE winners 
       SET claimed = true, claimed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [winnerId]
    );
  }

  /**
   * Disqualify winner
   */
  async disqualifyWinner(winnerId: number, reason: string): Promise<void> {
    await db.query(
      `UPDATE winners 
       SET disqualified = true, disqualification_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [winnerId, reason]
    );
  }

  /**
   * Pass prize to next eligible backup — shifts remaining winners up
   */
  async passToNext(challengeId: number, currentPosition: number, reason: string): Promise<Winner | null> {
    // Disqualify current winner
    const currentWinner = await this.getWinnerByPosition(challengeId, currentPosition);
    if (currentWinner) {
      await this.disqualifyWinner(currentWinner.id, reason);
    }

    // Get all active (non-disqualified) winners, ordered by position
    const allWinners = await db.query(
      `SELECT * FROM winners WHERE challenge_id = $1 AND disqualified = false ORDER BY position ASC`,
      [challengeId]
    );

    // Shift all winners below the passed position up by 1
    for (const w of allWinners.rows) {
      if (w.position > currentPosition) {
        await db.query(
          `UPDATE winners SET position = position - 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [w.id]
        );
      }
    }

    // New winner takes the next position after remaining active winners
    const newPosition = allWinners.rows.length + 1;

    // Get next eligible participant (first backup — perfect scorer not in winners table)
    const result = await db.query(
      `SELECT p.* FROM participants p
       WHERE p.challenge_id = $1 
         AND p.score = p.total_questions
         AND p.telegram_id NOT IN (
           SELECT telegram_id FROM winners 
           WHERE challenge_id = $1
         )
       ORDER BY p.completion_time_seconds ASC
       LIMIT 1`,
      [challengeId]
    );

    if (result.rows.length === 0) return null;

    const nextParticipant = result.rows[0];
    
    // Create new winner at the next position
    const newWinner = await this.createWinner(
      challengeId,
      nextParticipant.user_id || 0,
      nextParticipant.telegram_id,
      nextParticipant.username,
      newPosition,
      currentWinner?.prize_amount || 20
    );

    return newWinner;
  }

  /**
   * Get all winners (including disqualified)
   */
  async getAllWinners(challengeId: number): Promise<Winner[]> {
    const result = await db.query(
      `SELECT * FROM winners 
       WHERE challenge_id = $1 
       ORDER BY created_at ASC`,
      [challengeId]
    );

    return result.rows;
  }

  /**
   * Get recent winners across all challenges
   */
  async getRecentWinners(limit: number = 10): Promise<any[]> {
    const result = await db.query(
      `SELECT w.*, c.topic, c.date, c.day, p.score, p.total_questions, p.completion_time_seconds
       FROM winners w
       JOIN challenges c ON w.challenge_id = c.id
       JOIN participants p ON w.challenge_id = p.challenge_id AND w.telegram_id = p.telegram_id
       WHERE w.disqualified = false
       ORDER BY c.date DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Check if prize claim deadline passed
   */
  async isPrizeClaimExpired(winnerId: number, deadlineHours: number): Promise<boolean> {
    const result = await db.query(
      `SELECT created_at FROM winners WHERE id = $1`,
      [winnerId]
    );

    if (result.rows.length === 0) return false;

    const createdAt = new Date(result.rows[0].created_at);
    const now = new Date();
    const hoursPassed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    return hoursPassed > deadlineHours;
  }
}

export const winnerService = new WinnerService();
