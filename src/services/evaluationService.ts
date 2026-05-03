/**
 * Evaluation Service — DB operations for trade evaluations
 */

import { db } from '../database/db';

export interface EvaluationRecord {
  id: number;
  challenge_id: number;
  registration_id: number;
  account_number: string;
  account_type: string;
  username: string | null;
  telegram_id: number;
  email: string | null;
  file_id: string;
  file_message_id: number | null;
  reported_balance: number;
  adjusted_balance: number;
  total_trades: number;
  flagged_count: number;
  profit_removed: number;
  is_qualified: boolean;
  is_disqualified: boolean;
  disqualify_reason: string | null;
  short_report: string;
  full_report: string;
  flagged_details: any;
  evaluated_at: Date;
}

class EvaluationService {

  // ── Save / Update ──

  async saveEvaluation(data: {
    challenge_id: number;
    registration_id: number;
    account_number: string;
    account_type: string;
    username: string | null;
    telegram_id: number;
    email: string | null;
    file_id: string;
    file_message_id: number | null;
    reported_balance: number;
    adjusted_balance: number;
    total_trades: number;
    flagged_count: number;
    profit_removed: number;
    is_qualified: boolean;
    is_disqualified: boolean;
    disqualify_reason: string | null;
    short_report: string;
    full_report: string;
    flagged_details: any;
  }, isTest: boolean = false): Promise<EvaluationRecord> {
    if (isTest) {
      return this.saveTestEvaluation(data);
    }
    // For real evaluations, use upsert on (challenge_id, account_number)
    const result = await db.query(
      `INSERT INTO trading_evaluations
       (challenge_id, registration_id, account_number, account_type, username, telegram_id, email,
        file_id, file_message_id, reported_balance, adjusted_balance, total_trades, flagged_count,
        profit_removed, is_qualified, is_disqualified, disqualify_reason, short_report, full_report, flagged_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (challenge_id, account_number)
       DO UPDATE SET registration_id=$2, account_type=$4, username=$5, telegram_id=$6, email=$7,
        file_id=$8, file_message_id=$9, reported_balance=$10, adjusted_balance=$11, total_trades=$12,
        flagged_count=$13, profit_removed=$14, is_qualified=$15, is_disqualified=$16,
        disqualify_reason=$17, short_report=$18, full_report=$19, flagged_details=$20, evaluated_at=NOW()
       RETURNING *`,
      [data.challenge_id, data.registration_id, data.account_number, data.account_type,
       data.username, data.telegram_id, data.email || null, data.file_id, data.file_message_id,
       data.reported_balance, data.adjusted_balance, data.total_trades, data.flagged_count,
       data.profit_removed, data.is_qualified, data.is_disqualified, data.disqualify_reason,
       data.short_report, data.full_report, JSON.stringify(data.flagged_details)]
    );
    return result.rows[0];
  }

  async saveTestEvaluation(data: any): Promise<EvaluationRecord> {
    const result = await db.query(
      `INSERT INTO trading_evaluations_test
       (challenge_id, registration_id, account_number, account_type, username, telegram_id, email,
        file_id, file_message_id, reported_balance, adjusted_balance, total_trades, flagged_count,
        profit_removed, is_qualified, is_disqualified, disqualify_reason, short_report, full_report, flagged_details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [data.challenge_id, data.registration_id, data.account_number, data.account_type,
       data.username, data.telegram_id, data.email || null, data.file_id, data.file_message_id,
       data.reported_balance, data.adjusted_balance, data.total_trades, data.flagged_count,
       data.profit_removed, data.is_qualified, data.is_disqualified, data.disqualify_reason,
       data.short_report, data.full_report, JSON.stringify(data.flagged_details)]
    );
    return result.rows[0];
  }

  // ── Queries ──

  async getEvaluation(challengeId: number, accountNumber: string): Promise<EvaluationRecord | null> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations WHERE challenge_id = $1 AND account_number = $2',
      [challengeId, accountNumber]
    );
    return result.rows[0] || null;
  }

  async getEvaluationById(id: number): Promise<EvaluationRecord | null> {
    const result = await db.query('SELECT * FROM trading_evaluations WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getTestEvaluationById(id: number): Promise<EvaluationRecord | null> {
    const result = await db.query('SELECT * FROM trading_evaluations_test WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async getAllEvaluations(challengeId: number): Promise<EvaluationRecord[]> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations WHERE challenge_id = $1 ORDER BY adjusted_balance DESC',
      [challengeId]
    );
    return result.rows;
  }

  async getQualifiedEvaluations(challengeId: number, accountType?: string): Promise<EvaluationRecord[]> {
    let query = 'SELECT * FROM trading_evaluations WHERE challenge_id = $1 AND is_qualified = true';
    const params: any[] = [challengeId];
    if (accountType) {
      query += ' AND account_type = $2';
      params.push(accountType);
    }
    query += ' ORDER BY adjusted_balance DESC';
    const result = await db.query(query, params);
    return result.rows;
  }

  async getTopWinners(challengeId: number, accountType: string, limit: number): Promise<EvaluationRecord[]> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations WHERE challenge_id = $1 AND account_type = $2 AND is_qualified = true ORDER BY adjusted_balance DESC LIMIT $3',
      [challengeId, accountType, limit]
    );
    return result.rows;
  }

  async getEvaluationStatus(challengeId: number): Promise<{
    total_submissions: number;
    evaluated: number;
    real_evaluated: number;
    demo_evaluated: number;
    real_submissions: number;
    demo_submissions: number;
    qualified: number;
    disqualified: number;
  }> {
    // Count submissions
    const subResult = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE r.account_type = 'real') as real_count,
        COUNT(*) FILTER (WHERE r.account_type = 'demo') as demo_count
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       WHERE s.challenge_id = $1`,
      [challengeId]
    );

    // Count evaluations
    const evalResult = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE account_type = 'real') as real_count,
        COUNT(*) FILTER (WHERE account_type = 'demo') as demo_count,
        COUNT(*) FILTER (WHERE is_qualified = true) as qualified,
        COUNT(*) FILTER (WHERE is_disqualified = true) as disqualified
       FROM trading_evaluations WHERE challenge_id = $1`,
      [challengeId]
    );

    return {
      total_submissions: parseInt(subResult.rows[0]?.total || '0'),
      evaluated: parseInt(evalResult.rows[0]?.total || '0'),
      real_evaluated: parseInt(evalResult.rows[0]?.real_count || '0'),
      demo_evaluated: parseInt(evalResult.rows[0]?.demo_count || '0'),
      real_submissions: parseInt(subResult.rows[0]?.real_count || '0'),
      demo_submissions: parseInt(subResult.rows[0]?.demo_count || '0'),
      qualified: parseInt(evalResult.rows[0]?.qualified || '0'),
      disqualified: parseInt(evalResult.rows[0]?.disqualified || '0'),
    };
  }

  async getUnevaluatedSubmissions(challengeId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT s.*, r.account_number, r.account_type, r.username, r.telegram_id, r.email
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       LEFT JOIN trading_evaluations e ON e.challenge_id = s.challenge_id AND e.account_number = r.account_number
       WHERE s.challenge_id = $1 AND e.id IS NULL
       ORDER BY s.final_balance DESC`,
      [challengeId]
    );
    return result.rows;
  }

  // Find submission by account number
  async findSubmissionByAccount(challengeId: number, accountNumber: string): Promise<any | null> {
    const result = await db.query(
      `SELECT s.*, r.account_number, r.account_type, r.username, r.telegram_id, r.email, r.mt5_server
       FROM trading_submissions s
       JOIN trading_registrations r ON s.registration_id = r.id
       WHERE s.challenge_id = $1 AND r.account_number = $2`,
      [challengeId, accountNumber]
    );
    return result.rows[0] || null;
  }

  // ── Test operations ──

  async getAllTestEvaluations(challengeId: number): Promise<EvaluationRecord[]> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations_test WHERE challenge_id = $1 ORDER BY adjusted_balance DESC',
      [challengeId]
    );
    return result.rows;
  }

  async getTestTopWinners(challengeId: number, accountType: string, limit: number): Promise<EvaluationRecord[]> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations_test WHERE challenge_id = $1 AND account_type = $2 AND is_qualified = true ORDER BY adjusted_balance DESC LIMIT $3',
      [challengeId, accountType, limit]
    );
    return result.rows;
  }

  async clearTestData(challengeId?: number): Promise<number> {
    let result;
    if (challengeId) {
      result = await db.query('DELETE FROM trading_evaluations_test WHERE challenge_id = $1', [challengeId]);
    } else {
      result = await db.query('DELETE FROM trading_evaluations_test');
    }
    return result.rowCount || 0;
  }

  // Search evaluation by username, telegram_id, email, or account_number
  async searchEvaluation(challengeId: number, searchTerm: string): Promise<EvaluationRecord[]> {
    const term = searchTerm.replace(/^@/, '').trim();
    const result = await db.query(
      `SELECT * FROM trading_evaluations 
       WHERE challenge_id = $1 AND (
         username ILIKE $2 OR 
         email ILIKE $2 OR 
         account_number = $3 OR 
         telegram_id::text = $3
       ) ORDER BY adjusted_balance DESC`,
      [challengeId, '%' + term + '%', term]
    );
    return result.rows;
  }

  async deleteEvaluation(id: number): Promise<boolean> {
    const result = await db.query('DELETE FROM trading_evaluations WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  async getRankedEvaluations(challengeId: number, accountType: string): Promise<EvaluationRecord[]> {
    const result = await db.query(
      'SELECT * FROM trading_evaluations WHERE challenge_id = $1 AND account_type = $2 ORDER BY adjusted_balance DESC',
      [challengeId, accountType]
    );
    return result.rows;
  }
}

export const evaluationService = new EvaluationService();
