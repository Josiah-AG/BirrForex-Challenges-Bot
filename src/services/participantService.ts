import { db } from '../database/db';
import { Participant, Answer, ShuffledOptions } from '../types';

export class ParticipantService {
  /**
   * Create participant entry
   */
  async createParticipant(
    challengeId: number,
    userId: number,
    telegramId: number,
    username: string | undefined,
    score: number,
    totalQuestions: number,
    completionTimeSeconds: number,
    completionOrder: number,
    startedAt: Date,
    completedAt: Date,
    answers: Answer[],
    shuffledOptions: ShuffledOptions[]
  ): Promise<Participant> {
    const result = await db.query(
      `INSERT INTO participants 
       (challenge_id, user_id, telegram_id, username, score, total_questions, 
        completion_time_seconds, completion_order, started_at, completed_at, answers, shuffled_options)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        challengeId,
        userId,
        telegramId,
        username,
        score,
        totalQuestions,
        completionTimeSeconds,
        completionOrder,
        startedAt,
        completedAt,
        JSON.stringify(answers),
        JSON.stringify(shuffledOptions),
      ]
    );

    return result.rows[0];
  }

  /**
   * Check if user already participated
   */
  async hasParticipated(challengeId: number, telegramId: number): Promise<boolean> {
    const result = await db.query(
      'SELECT id FROM participants WHERE challenge_id = $1 AND telegram_id = $2',
      [challengeId, telegramId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get participant
   */
  /**
     * Get participant
     */
    async getParticipant(challengeId: number, telegramId: number): Promise<Participant | null> {
      const result = await db.query(
        'SELECT * FROM participants WHERE challenge_id = $1 AND telegram_id = $2',
        [challengeId, telegramId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      // JSONB columns are already parsed by PostgreSQL driver
      return {
        ...row,
        answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
        shuffled_options: typeof row.shuffled_options === 'string' ? JSON.parse(row.shuffled_options) : row.shuffled_options,
      };
    }

  /**
   * Get all participants for challenge
   */
  /**
     * Get all participants for challenge
     */
    async getParticipants(challengeId: number): Promise<Participant[]> {
      const result = await db.query(
        'SELECT * FROM participants WHERE challenge_id = $1 ORDER BY rank ASC',
        [challengeId]
      );

      return result.rows.map(row => ({
        ...row,
        answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
        shuffled_options: typeof row.shuffled_options === 'string' ? JSON.parse(row.shuffled_options) : row.shuffled_options,
      }));
    }

  /**
   * Get completion order (how many completed before this user)
   */
  async getCompletionOrder(challengeId: number): Promise<number> {
    const result = await db.query(
      'SELECT COUNT(*) as count FROM participants WHERE challenge_id = $1',
      [challengeId]
    );

    return parseInt(result.rows[0].count) + 1;
  }

  /**
   * Calculate and update ranks for all participants
   */
  async calculateRanks(challengeId: number): Promise<void> {
    // Rank by score (descending), then by completed_at timestamp (ascending)
    // This means the first person to complete with perfect score wins
    await db.query(
      `UPDATE participants p
       SET rank = ranked.rank
       FROM (
         SELECT id, 
                ROW_NUMBER() OVER (
                  ORDER BY score DESC, completed_at ASC
                ) as rank
         FROM participants
         WHERE challenge_id = $1
       ) ranked
       WHERE p.id = ranked.id`,
      [challengeId]
    );
  }

  /**
   * Get perfect scorers ordered by completion timestamp
   */
  /**
     * Get perfect scorers ordered by completion timestamp
     */
    async getPerfectScorers(challengeId: number): Promise<Participant[]> {
      const result = await db.query(
        `SELECT * FROM participants 
         WHERE challenge_id = $1 AND score = total_questions
         ORDER BY completed_at ASC`,
        [challengeId]
      );

      return result.rows.map(row => ({
        ...row,
        answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
        shuffled_options: typeof row.shuffled_options === 'string' ? JSON.parse(row.shuffled_options) : row.shuffled_options,
      }));
    }

  /**
   * Get challenge statistics
   */
  async getChallengeStats(challengeId: number): Promise<any> {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total_participants,
         COUNT(CASE WHEN score = total_questions THEN 1 END) as perfect_scores,
         AVG(score) as avg_score,
         MAX(total_questions) as total_questions,
         AVG(completion_time_seconds) as avg_time
       FROM participants
       WHERE challenge_id = $1`,
      [challengeId]
    );

    return result.rows[0];
  }

  /**
   * Get question accuracy
   */
  async getQuestionAccuracy(challengeId: number): Promise<{ [key: number]: number }> {
    const participants = await this.getParticipants(challengeId);
    const accuracy: { [key: number]: { correct: number; total: number } } = {};

    participants.forEach(p => {
      p.answers.forEach(answer => {
        if (!accuracy[answer.question_id]) {
          accuracy[answer.question_id] = { correct: 0, total: 0 };
        }
        accuracy[answer.question_id].total++;
        if (answer.is_correct) {
          accuracy[answer.question_id].correct++;
        }
      });
    });

    const result: { [key: number]: number } = {};
    Object.entries(accuracy).forEach(([qId, stats]) => {
      result[parseInt(qId)] = Math.round((stats.correct / stats.total) * 100);
    });

    return result;
  }

  /**
   * Get user's participation history
   */
  /**
     * Get user's participation history
     */
    async getUserHistory(telegramId: number, limit: number = 10): Promise<any[]> {
      const result = await db.query(
        `SELECT p.*, c.topic, c.date, c.day
         FROM participants p
         JOIN challenges c ON p.challenge_id = c.id
         WHERE p.telegram_id = $1
         ORDER BY c.date DESC
         LIMIT $2`,
        [telegramId, limit]
      );

      return result.rows.map(row => ({
        ...row,
        answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
        shuffled_options: typeof row.shuffled_options === 'string' ? JSON.parse(row.shuffled_options) : row.shuffled_options,
      }));
    }
}

export const participantService = new ParticipantService();
