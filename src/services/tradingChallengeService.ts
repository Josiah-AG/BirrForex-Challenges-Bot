import { db } from '../database/db';

export interface TradingChallenge {
  id: number;
  title: string;
  type: 'demo' | 'real' | 'hybrid';
  status: string;
  start_date: Date;
  end_date: Date;
  starting_balance: number;
  target_balance: number;
  pdf_url: string | null;
  video_url: string | null;
  real_winners_count: number;
  demo_winners_count: number;
  real_prizes: number[] | null;
  demo_prizes: number[] | null;
  prize_pool_text: string | null;
  announcement_posted: boolean;
  submission_deadline: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TradingRegistration {
  id: number;
  challenge_id: number;
  telegram_id: number;
  username: string | null;
  account_type: 'demo' | 'real';
  email: string;
  account_number: string;
  mt5_server: string | null;
  client_uid: string | null;
  status: string;
  registered_at: Date;
}

export interface TradingSubmission {
  id: number;
  registration_id: number;
  challenge_id: number;
  final_balance: number;
  balance_screenshot_file_id: string | null;
  screenshot_link: string | null;
  screenshot_message_id: number | null;
  investor_password: string;
  submitted_at: Date;
}

export interface TradingWinner {
  id: number;
  challenge_id: number;
  registration_id: number;
  category: 'demo' | 'real';
  position: number;
  prize_amount: string;
  claimed: boolean;
}

class TradingChallengeService {

  // ==================== CHALLENGE CRUD ====================

  async createChallenge(data: {
    title: string;
    type: 'demo' | 'real' | 'hybrid';
    start_date: Date;
    end_date: Date;
    starting_balance: number;
    target_balance: number;
    pdf_url?: string;
    video_url?: string;
    real_winners_count: number;
    demo_winners_count: number;
    real_prizes: number[];
    demo_prizes: number[];
    prize_pool_text?: string;
  }): Promise<TradingChallenge> {
    const result = await db.query(
      `INSERT INTO trading_challenges 
       (title, type, status, start_date, end_date, starting_balance, target_balance,
        pdf_url, video_url, real_winners_count, demo_winners_count, real_prizes, demo_prizes, prize_pool_text)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        data.title, data.type, data.start_date, data.end_date,
        data.starting_balance, data.target_balance,
        data.pdf_url || null, data.video_url || null,
        data.real_winners_count, data.demo_winners_count,
        JSON.stringify(data.real_prizes), JSON.stringify(data.demo_prizes),
        data.prize_pool_text || null,
      ]
    );
    return result.rows[0];
  }

  async getChallengeById(id: number): Promise<TradingChallenge | null> {
    const result = await db.query('SELECT * FROM trading_challenges WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getAllChallenges(): Promise<TradingChallenge[]> {
    const result = await db.query('SELECT * FROM trading_challenges ORDER BY created_at DESC');
    return result.rows;
  }

  async getActiveChallenges(): Promise<TradingChallenge[]> {
    const result = await db.query(
      `SELECT * FROM trading_challenges WHERE status NOT IN ('draft', 'completed', 'deleted') ORDER BY start_date ASC`
    );
    return result.rows;
  }

  async updateChallengeStatus(id: number, status: string): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }

  async updateChallengePdf(id: number, pdfUrl: string): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET pdf_url = $1, updated_at = NOW() WHERE id = $2',
      [pdfUrl, id]
    );
  }

  async updateChallengeVideo(id: number, videoUrl: string): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET video_url = $1, updated_at = NOW() WHERE id = $2',
      [videoUrl, id]
    );
  }

  async updateChallengePrizePool(id: number, prizePoolText: string): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET prize_pool_text = $1, updated_at = NOW() WHERE id = $2',
      [prizePoolText, id]
    );
  }

  async markAnnouncementPosted(id: number): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET announcement_posted = true, status = $1, updated_at = NOW() WHERE id = $2',
      ['registration_open', id]
    );
  }

  async setSubmissionDeadline(id: number, deadline: Date): Promise<void> {
    await db.query(
      'UPDATE trading_challenges SET submission_deadline = $1, updated_at = NOW() WHERE id = $2',
      [deadline, id]
    );
  }

  async deleteChallenge(id: number): Promise<void> {
    // CASCADE deletes registrations, submissions, winners, daily_stats
    await db.query('DELETE FROM trading_challenges WHERE id = $1', [id]);
  }

  // ==================== REGISTRATIONS ====================

  async registerUser(data: {
    challenge_id: number;
    telegram_id: number;
    username: string | null;
    account_type: 'demo' | 'real';
    email: string;
    account_number: string;
    mt5_server: string | null;
    client_uid: string | null;
  }): Promise<TradingRegistration> {
    const result = await db.query(
      `INSERT INTO trading_registrations
       (challenge_id, telegram_id, username, account_type, email, account_number, mt5_server, client_uid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.challenge_id, data.telegram_id, data.username,
        data.account_type, data.email, data.account_number,
        data.mt5_server, data.client_uid,
      ]
    );
    return result.rows[0];
  }

  async getRegistration(challengeId: number, telegramId: number): Promise<TradingRegistration | null> {
    const result = await db.query(
      'SELECT * FROM trading_registrations WHERE challenge_id = $1 AND telegram_id = $2',
      [challengeId, telegramId]
    );
    return result.rows[0] || null;
  }

  async getRegistrationByEmail(challengeId: number, email: string): Promise<TradingRegistration | null> {
    const result = await db.query(
      'SELECT * FROM trading_registrations WHERE challenge_id = $1 AND LOWER(email) = LOWER($2)',
      [challengeId, email]
    );
    return result.rows[0] || null;
  }

  async getAllRegistrations(challengeId: number): Promise<TradingRegistration[]> {
    const result = await db.query(
      'SELECT * FROM trading_registrations WHERE challenge_id = $1 ORDER BY registered_at ASC',
      [challengeId]
    );
    return result.rows;
  }

  async getRegistrationCounts(challengeId: number): Promise<{ total: number; demo: number; real: number }> {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN account_type = 'demo' THEN 1 END) as demo,
         COUNT(CASE WHEN account_type = 'real' THEN 1 END) as real
       FROM trading_registrations WHERE challenge_id = $1`,
      [challengeId]
    );
    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      demo: parseInt(row.demo),
      real: parseInt(row.real),
    };
  }

  async updateAccountNumber(registrationId: number, accountNumber: string, mt5Server: string | null): Promise<void> {
    await db.query(
      'UPDATE trading_registrations SET account_number = $1, mt5_server = $2, updated_at = NOW() WHERE id = $3',
      [accountNumber, mt5Server, registrationId]
    );
  }

  async deleteRegistration(registrationId: number): Promise<void> {
    await db.query('DELETE FROM trading_registrations WHERE id = $1', [registrationId]);
  }

  async deleteRegistrationByUsername(challengeId: number, username: string): Promise<TradingRegistration | null> {
    const result = await db.query(
      'DELETE FROM trading_registrations WHERE challenge_id = $1 AND LOWER(username) = LOWER($2) RETURNING *',
      [challengeId, username.replace('@', '')]
    );
    return result.rows[0] || null;
  }

  async deleteRegistrationByEmail(challengeId: number, email: string): Promise<TradingRegistration | null> {
    const result = await db.query(
      'DELETE FROM trading_registrations WHERE challenge_id = $1 AND LOWER(email) = LOWER($2) RETURNING *',
      [challengeId, email]
    );
    return result.rows[0] || null;
  }

  // ==================== SUBMISSIONS ====================

  async createSubmission(data: {
    registration_id: number;
    challenge_id: number;
    final_balance: number;
    balance_screenshot_file_id: string | null;
    screenshot_link: string | null;
    screenshot_message_id: number | null;
    investor_password: string;
  }): Promise<TradingSubmission> {
    const result = await db.query(
      `INSERT INTO trading_submissions
       (registration_id, challenge_id, final_balance, balance_screenshot_file_id, screenshot_link, screenshot_message_id, investor_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.registration_id, data.challenge_id, data.final_balance, data.balance_screenshot_file_id, data.screenshot_link, data.screenshot_message_id, data.investor_password]
    );
    return result.rows[0];
  }

  async getSubmissionByRegistration(registrationId: number): Promise<TradingSubmission | null> {
    const result = await db.query(
      'SELECT * FROM trading_submissions WHERE registration_id = $1',
      [registrationId]
    );
    return result.rows[0] || null;
  }

  async updateSubmission(registrationId: number, data: {
    final_balance: number;
    balance_screenshot_file_id: string | null;
    screenshot_link: string | null;
    screenshot_message_id: number | null;
    investor_password: string;
  }): Promise<TradingSubmission> {
    const result = await db.query(
      `UPDATE trading_submissions
       SET final_balance = $1, balance_screenshot_file_id = $2, screenshot_link = $3, screenshot_message_id = $4, investor_password = $5, submitted_at = NOW()
       WHERE registration_id = $6
       RETURNING *`,
      [data.final_balance, data.balance_screenshot_file_id, data.screenshot_link, data.screenshot_message_id, data.investor_password, registrationId]
    );
    return result.rows[0];
  }

  async getSubmissions(challengeId: number): Promise<(TradingSubmission & TradingRegistration)[]> {
    const result = await db.query(
      `SELECT s.*, r.telegram_id, r.username, r.account_type, r.email, r.account_number, r.mt5_server
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       WHERE s.challenge_id = $1
       ORDER BY s.final_balance DESC`,
      [challengeId]
    );
    return result.rows;
  }

  async getSubmissionsByCategory(challengeId: number, category: 'demo' | 'real'): Promise<(TradingSubmission & TradingRegistration)[]> {
    const result = await db.query(
      `SELECT s.*, r.telegram_id, r.username, r.account_type, r.email, r.account_number, r.mt5_server
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       WHERE s.challenge_id = $1 AND r.account_type = $2
       ORDER BY s.final_balance DESC`,
      [challengeId, category]
    );
    return result.rows;
  }

  async getSubmissionCount(challengeId: number): Promise<{ total: number; demo: number; real: number }> {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN r.account_type = 'demo' THEN 1 END) as demo,
         COUNT(CASE WHEN r.account_type = 'real' THEN 1 END) as real
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       WHERE s.challenge_id = $1`,
      [challengeId]
    );
    const row = result.rows[0];
    return { total: parseInt(row.total), demo: parseInt(row.demo), real: parseInt(row.real) };
  }

  // ==================== WINNERS ====================

  async createWinner(data: {
    challenge_id: number;
    registration_id: number;
    category: 'demo' | 'real';
    position: number;
    prize_amount: string;
  }): Promise<TradingWinner> {
    const result = await db.query(
      `INSERT INTO trading_winners (challenge_id, registration_id, category, position, prize_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.challenge_id, data.registration_id, data.category, data.position, data.prize_amount]
    );
    return result.rows[0];
  }

  async getWinners(challengeId: number): Promise<(TradingWinner & { username: string; email: string; account_number: string; account_type: string; final_balance: number; telegram_id: number })[]> {
    const result = await db.query(
      `SELECT w.*, r.username, r.email, r.account_number, r.account_type, r.telegram_id, s.final_balance
       FROM trading_winners w
       JOIN trading_registrations r ON w.registration_id = r.id
       LEFT JOIN trading_submissions s ON s.registration_id = r.id
       WHERE w.challenge_id = $1
       ORDER BY w.category, w.position ASC`,
      [challengeId]
    );
    return result.rows;
  }

  async deleteWinners(challengeId: number): Promise<void> {
    await db.query('DELETE FROM trading_winners WHERE challenge_id = $1', [challengeId]);
  }

  // ==================== DAILY STATS ====================

  async updateDailyStat(challengeId: number, field: string): Promise<void> {
    const now = new Date();
    const eatOffset = 3;
    const eatTime = new Date(now.getTime() + eatOffset * 60 * 60 * 1000);
    const dateStr = `${eatTime.getUTCFullYear()}-${(eatTime.getUTCMonth() + 1).toString().padStart(2, '0')}-${eatTime.getUTCDate().toString().padStart(2, '0')}`;

    await db.query(
      `INSERT INTO trading_daily_stats (challenge_id, date, ${field})
       VALUES ($1, $2, 1)
       ON CONFLICT (challenge_id, date)
       DO UPDATE SET ${field} = trading_daily_stats.${field} + 1`,
      [challengeId, dateStr]
    );
  }

  async getDailyStats(challengeId: number, date: string): Promise<any> {
    const result = await db.query(
      'SELECT * FROM trading_daily_stats WHERE challenge_id = $1 AND date = $2',
      [challengeId, date]
    );
    return result.rows[0] || null;
  }

  async getTotalStats(challengeId: number): Promise<any> {
    const result = await db.query(
      `SELECT 
         SUM(new_registrations) as total_registrations,
         SUM(demo_registrations) as total_demo,
         SUM(real_registrations) as total_real,
         SUM(allocation_failures) as total_allocation_failures,
         SUM(kyc_failures) as total_kyc_failures,
         SUM(real_acct_failures) as total_real_acct_failures,
         SUM(manual_reviews) as total_manual_reviews,
         SUM(account_changes) as total_account_changes,
         SUM(category_switches) as total_category_switches,
         SUM(allocation_recoveries) as total_allocation_recoveries,
         SUM(kyc_recoveries) as total_kyc_recoveries,
         SUM(real_acct_recoveries) as total_real_acct_recoveries
       FROM trading_daily_stats WHERE challenge_id = $1`,
      [challengeId]
    );
    return result.rows[0];
  }

  // ==================== FAILED ATTEMPTS ====================

  async logFailedAttempt(challengeId: number, telegramId: number, username: string | null, email: string | null, failureType: string): Promise<void> {
    await db.query(
      `INSERT INTO trading_failed_attempts (challenge_id, telegram_id, username, email, failure_type, attempted_at, engaged)
       VALUES ($1, $2, $3, $4, $5, NOW(), false)
       ON CONFLICT (challenge_id, telegram_id)
       DO UPDATE SET failure_type = $5, email = COALESCE($4, trading_failed_attempts.email), username = COALESCE($3, trading_failed_attempts.username), attempted_at = NOW(), engaged = false`,
      [challengeId, telegramId, username, email, failureType]
    );
  }

  async markConverted(challengeId: number, telegramId: number): Promise<void> {
    await db.query(
      `UPDATE trading_failed_attempts SET converted = true, converted_at = NOW() WHERE challenge_id = $1 AND telegram_id = $2`,
      [challengeId, telegramId]
    );
  }

  async getEngageableFailedAttempts(challengeId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT fa.* FROM trading_failed_attempts fa
       LEFT JOIN trading_registrations tr ON fa.challenge_id = tr.challenge_id AND fa.telegram_id = tr.telegram_id
       WHERE fa.challenge_id = $1
       AND fa.attempted_at < NOW() - INTERVAL '24 hours'
       AND tr.id IS NULL
       AND fa.converted = false
       ORDER BY fa.failure_type, fa.attempted_at`,
      [challengeId]
    );
    return result.rows;
  }

  async getDueForEngagement(challengeId: number, isLast3Days: boolean): Promise<any[]> {
    // First engagement: 24h after failure, no previous engagement
    // Subsequent: every 48h (or 24h in last 3 days)
    const interval = isLast3Days ? '24 hours' : '48 hours';
    const result = await db.query(
      `SELECT fa.* FROM trading_failed_attempts fa
       LEFT JOIN trading_registrations tr ON fa.challenge_id = tr.challenge_id AND fa.telegram_id = tr.telegram_id
       WHERE fa.challenge_id = $1
       AND tr.id IS NULL
       AND fa.converted = false
       AND (
         (fa.engage_count = 0 AND fa.attempted_at < NOW() - INTERVAL '24 hours')
         OR
         (fa.engage_count > 0 AND fa.last_engaged_at < NOW() - INTERVAL '${interval}')
       )
       ORDER BY fa.engage_count ASC, fa.attempted_at ASC`,
      [challengeId]
    );
    return result.rows;
  }

  async getAllFailedAttempts(challengeId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT fa.*, 
       CASE WHEN tr.id IS NOT NULL THEN true ELSE false END as later_registered
       FROM trading_failed_attempts fa
       LEFT JOIN trading_registrations tr ON fa.challenge_id = tr.challenge_id AND fa.telegram_id = tr.telegram_id
       WHERE fa.challenge_id = $1
       ORDER BY fa.attempted_at DESC`,
      [challengeId]
    );
    return result.rows;
  }

  async markEngaged(challengeId: number, telegramId: number, successful: boolean): Promise<void> {
    await db.query(
      `UPDATE trading_failed_attempts 
       SET engaged = true, engage_count = engage_count + 1, last_engaged_at = NOW(), engage_successful = $3
       WHERE challenge_id = $1 AND telegram_id = $2`,
      [challengeId, telegramId, successful]
    );
  }
}

export const tradingChallengeService = new TradingChallengeService();
