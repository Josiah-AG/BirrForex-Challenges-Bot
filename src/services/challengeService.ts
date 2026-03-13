import { db } from '../database/db';
import { Challenge, Question } from '../types';

export class ChallengeService {
  /**
   * Create a new challenge
   */
  async createChallenge(
    day: string,
    date: Date,
    topic: string,
    shortText: string,
    topicLink: string,
    challengeTime: string = '20:00',
    prizeAmount?: number,
    numWinners?: number
  ): Promise<Challenge> {
    const result = await db.query(
      `INSERT INTO challenges (day, date, topic, short_text, topic_link, challenge_time, prize_amount, num_winners, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled')
       RETURNING *`,
      [day, date, topic, shortText, topicLink, challengeTime, prizeAmount || 20, numWinners || 1]
    );

    return result.rows[0];
  }

  /**
   * Add question to challenge
   */
  async addQuestion(
    challengeId: number,
    questionText: string,
    optionA: string,
    optionB: string,
    optionC: string,
    optionD: string,
    correctAnswer: 'A' | 'B' | 'C' | 'D',
    orderNumber: number
  ): Promise<Question> {
    const result = await db.query(
      `INSERT INTO questions (challenge_id, question_text, option_a, option_b, option_c, option_d, correct_answer, order_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [challengeId, questionText, optionA, optionB, optionC, optionD, correctAnswer, orderNumber]
    );

    return result.rows[0];
  }

  /**
   * Get challenge by ID
   */
  async getChallengeById(challengeId: number): Promise<Challenge | null> {
    const result = await db.query(
      'SELECT * FROM challenges WHERE id = $1',
      [challengeId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get challenge by date
   */
  async getChallengeByDate(date: Date): Promise<Challenge | null> {
    const result = await db.query(
      'SELECT * FROM challenges WHERE date = $1',
      [date]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all challenges for a specific date
   */
  async getChallengesByDate(date: Date): Promise<Challenge[]> {
    const result = await db.query(
      'SELECT * FROM challenges WHERE date = $1 ORDER BY challenge_time ASC',
      [date]
    );

    return result.rows;
  }

  /**
   * Get active challenge
   */
  async getActiveChallenge(): Promise<Challenge | null> {
    const result = await db.query(
      `SELECT * FROM challenges WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`
    );

    return result.rows[0] || null;
  }

  /**
   * Get questions for challenge
   */
  async getQuestions(challengeId: number): Promise<Question[]> {
    const result = await db.query(
      'SELECT * FROM questions WHERE challenge_id = $1 ORDER BY order_number',
      [challengeId]
    );

    return result.rows;
  }

  /**
   * Update challenge status
   */
  async updateChallengeStatus(challengeId: number, status: Challenge['status']): Promise<void> {
    const updates: any = { status };
    
    if (status === 'active') {
      updates.started_at = new Date();
    } else if (status === 'completed') {
      updates.ended_at = new Date();
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(challengeId);

    await db.query(
      `UPDATE challenges SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  /**
   * Delete challenge
   */
  async deleteChallenge(challengeId: number): Promise<void> {
    await db.query('DELETE FROM challenges WHERE id = $1', [challengeId]);
  }

  /**
   * Update challenge details
   */
  async updateChallenge(
    challengeId: number,
    updates: {
      topic?: string;
      short_text?: string;
      topic_link?: string;
      prize_amount?: number;
      num_winners?: number;
    }
  ): Promise<void> {
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
    values.push(challengeId);

    await db.query(
      `UPDATE challenges SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  /**
   * Delete question
   */
  async deleteQuestion(questionId: number): Promise<void> {
    await db.query('DELETE FROM questions WHERE id = $1', [questionId]);
  }

  /**
   * Update question
   */
  async updateQuestion(
    questionId: number,
    updates: {
      question_text?: string;
      option_a?: string;
      option_b?: string;
      option_c?: string;
      option_d?: string;
      correct_answer?: 'A' | 'B' | 'C' | 'D';
    }
  ): Promise<void> {
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

    values.push(questionId);

    await db.query(
      `UPDATE questions SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  /**
   * Get upcoming challenges
   */
  async getUpcomingChallenges(limit: number = 5): Promise<Challenge[]> {
    const result = await db.query(
      `SELECT * FROM challenges 
       WHERE status = 'scheduled' AND date >= CURRENT_DATE
       ORDER BY date ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get past challenges
   */
  async getPastChallenges(limit: number = 10): Promise<Challenge[]> {
    const result = await db.query(
      `SELECT * FROM challenges 
       WHERE status = 'completed'
       ORDER BY date DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Check if challenge exists for date
   */
  async challengeExistsForDate(date: Date): Promise<boolean> {
    const result = await db.query(
      'SELECT id FROM challenges WHERE date = $1',
      [date]
    );

    return result.rows.length > 0;
  }

  /**
   * Get next challenge date
   */
  async getNextChallengeDate(): Promise<Date | null> {
    const result = await db.query(
      `SELECT date FROM challenges 
       WHERE status = 'scheduled' AND date >= CURRENT_DATE
       ORDER BY date ASC
       LIMIT 1`
    );

    return result.rows[0]?.date || null;
  }
}

export const challengeService = new ChallengeService();
