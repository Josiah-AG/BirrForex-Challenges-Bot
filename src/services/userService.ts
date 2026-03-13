import { db } from '../database/db';
import { User } from '../types';

export class UserService {
  /**
   * Get or create user
   */
  async getOrCreateUser(telegramId: number, username?: string, firstName?: string, lastName?: string): Promise<User> {
    // Try to get existing user
    const existingUser = await this.getUserByTelegramId(telegramId);
    if (existingUser) {
      // Update username if changed
      if (username && username !== existingUser.username) {
        await this.updateUser(telegramId, { username, first_name: firstName, last_name: lastName });
      }
      return existingUser;
    }

    // Create new user
    const result = await db.query(
      `INSERT INTO users (telegram_id, username, first_name, last_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [telegramId, username, firstName, lastName]
    );

    return result.rows[0];
  }

  /**
   * Get user by telegram ID
   */
  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const result = await db.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    return result.rows[0] || null;
  }

  /**
   * Update user
   */
  async updateUser(telegramId: number, updates: Partial<User>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) return;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(telegramId);

    await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = $${paramCount}`,
      values
    );
  }

  /**
   * Increment user participation count
   */
  async incrementParticipation(telegramId: number): Promise<void> {
    await db.query(
      `UPDATE users 
       SET total_participations = total_participations + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1`,
      [telegramId]
    );
  }

  /**
   * Increment perfect score count
   */
  async incrementPerfectScore(telegramId: number): Promise<void> {
    await db.query(
      `UPDATE users 
       SET total_perfect_scores = total_perfect_scores + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1`,
      [telegramId]
    );
  }

  /**
   * Record win
   */
  async recordWin(telegramId: number): Promise<void> {
    await db.query(
      `UPDATE users 
       SET total_wins = total_wins + 1,
           last_win_date = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1`,
      [telegramId]
    );
  }

  /**
   * Check if user won last challenge
   */
  async wonLastChallenge(telegramId: number, currentChallengeDate: Date): Promise<boolean> {
    const result = await db.query(
      `SELECT w.* FROM winners w
       JOIN challenges c ON w.challenge_id = c.id
       WHERE w.telegram_id = $1 
         AND w.disqualified = false
         AND c.date < $2
       ORDER BY c.date DESC
       LIMIT 1`,
      [telegramId, currentChallengeDate]
    );

    if (result.rows.length === 0) return false;

    const lastWin = result.rows[0];
    const lastWinDate = new Date(lastWin.created_at);
    const daysDiff = Math.floor((currentChallengeDate.getTime() - lastWinDate.getTime()) / (1000 * 60 * 60 * 24));

    // If last win was within 4 days, it's consecutive (Wed->Sun or Sun->Wed)
    return daysDiff <= 4;
  }

  /**
   * Toggle notifications
   */
  async toggleNotifications(telegramId: number): Promise<boolean> {
    const result = await db.query(
      `UPDATE users 
       SET notifications_enabled = NOT notifications_enabled,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1
       RETURNING notifications_enabled`,
      [telegramId]
    );

    return result.rows[0]?.notifications_enabled || false;
  }

  /**
   * Enable notifications
   */
  async enableNotifications(telegramId: number): Promise<void> {
    await db.query(
      `UPDATE users 
       SET notifications_enabled = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1`,
      [telegramId]
    );
  }

  /**
   * Disable notifications
   */
  async disableNotifications(telegramId: number): Promise<void> {
    await db.query(
      `UPDATE users 
       SET notifications_enabled = false,
           updated_at = CURRENT_TIMESTAMP
       WHERE telegram_id = $1`,
      [telegramId]
    );
  }

  /**
   * Get all users with notifications enabled
   */
  async getUsersWithNotifications(): Promise<User[]> {
    const result = await db.query(
      'SELECT * FROM users WHERE notifications_enabled = true'
    );

    return result.rows;
  }

  /**
   * Get user statistics
   */
  async getUserStats(telegramId: number): Promise<any> {
    const user = await this.getUserByTelegramId(telegramId);
    if (!user) return null;

    // Get average score
    const avgScoreResult = await db.query(
      `SELECT AVG(CAST(score AS FLOAT) / total_questions) as avg_score,
              AVG(completion_time_seconds) as avg_time
       FROM participants
       WHERE telegram_id = $1`,
      [telegramId]
    );

    // Get best rank
    const bestRankResult = await db.query(
      `SELECT MIN(rank) as best_rank
       FROM participants
       WHERE telegram_id = $1 AND rank IS NOT NULL`,
      [telegramId]
    );

    // Get fastest time
    const fastestTimeResult = await db.query(
      `SELECT MIN(completion_time_seconds) as fastest_time
       FROM participants
       WHERE telegram_id = $1 AND score = total_questions`,
      [telegramId]
    );

    return {
      user,
      avg_score: avgScoreResult.rows[0]?.avg_score || 0,
      avg_time: avgScoreResult.rows[0]?.avg_time || 0,
      best_rank: bestRankResult.rows[0]?.best_rank || null,
      fastest_time: fastestTimeResult.rows[0]?.fastest_time || null,
    };
  }
}

export const userService = new UserService();
