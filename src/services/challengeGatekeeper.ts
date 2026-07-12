/**
 * Challenge Gatekeeper — requires Telegram admin confirmation for create/delete
 * 
 * External sources (WinnerPip dashboard, Discord bot) cannot create or delete
 * challenges without physical confirmation from the admin on Telegram.
 * 
 * Flow:
 * - API receives create/delete request → responds with fake success
 * - Sends silent Telegram message to admin with Confirm/Reject buttons
 * - On Confirm: executes the actual DB operation
 * - On Reject or 30min timeout: discards the pending action
 */

import { db } from '../database/db';
import { config } from '../config';
import crypto from 'crypto';

interface PendingAction {
  token: string;
  type: 'create' | 'delete' | 'status_change';
  data: any;
  createdAt: number;
  messageId?: number;
}

// In-memory store of pending actions (survives until process restarts — fine for 30min window)
const pendingActions = new Map<string, PendingAction>();

// Auto-expire after 30 minutes
const EXPIRY_MS = 30 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function cleanExpired() {
  const now = Date.now();
  for (const [token, action] of pendingActions) {
    if (now - action.createdAt > EXPIRY_MS) {
      pendingActions.delete(token);
    }
  }
}

/**
 * Queue a challenge creation for admin approval.
 * Returns a token that the callback handler uses.
 */
export function queueCreate(data: any): string {
  cleanExpired();
  const token = generateToken();
  pendingActions.set(token, {
    token,
    type: 'create',
    data,
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Queue a challenge deletion for admin approval.
 */
export function queueDelete(challengeId: number, title: string): string {
  cleanExpired();
  const token = generateToken();
  pendingActions.set(token, {
    token,
    type: 'delete',
    data: { challengeId, title },
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Get a pending action by token (for the callback handler).
 */
export function getPending(token: string): PendingAction | undefined {
  cleanExpired();
  return pendingActions.get(token);
}

/**
 * Remove a pending action (after approve or reject).
 */
export function removePending(token: string): void {
  pendingActions.delete(token);
}

/**
 * Store the Telegram message ID so we can edit it after action.
 */
export function setMessageId(token: string, messageId: number): void {
  const action = pendingActions.get(token);
  if (action) action.messageId = messageId;
}

/**
 * Execute the actual challenge creation in DB.
 */
export async function executeCreate(data: any): Promise<{ success: boolean; challenge?: any; error?: string }> {
  try {
    const evalType = data.evaluation_type === 'legacy' ? 'legacy' : 'winnerpip';
    const result = await db.query(
      `INSERT INTO trading_challenges
       (title, type, status, start_date, end_date, registration_deadline, starting_balance, target_balance,
        prize_pool_text, real_winners_count, demo_winners_count, real_prizes, demo_prizes,
        pdf_url, video_url, source, team_only, announcement_posted, evaluation_type,
        pull_times, pull_interval_hours, first_pull_time)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17, $18, $19, $20)
       RETURNING *`,
      [
        data.title, data.type, data.start_date, data.end_date,
        data.registration_deadline || data.end_date,
        data.starting_balance, data.target_balance || 0,
        data.prize_pool_text || '', data.real_winners_count || 0, data.demo_winners_count || 0,
        JSON.stringify(data.real_prizes || []), JSON.stringify(data.demo_prizes || []),
        data.pdf_url || null, data.video_url || null,
        data.source || 'telegram', data.team_only || false,
        evalType,
        JSON.stringify(data.pull_times || ['00:00','04:00','08:00','12:00','16:00','20:00']),
        data.pull_interval_hours || 4,
        data.first_pull_time || '00:00',
      ]
    );
    return { success: true, challenge: result.rows[0] };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Execute the actual challenge deletion in DB.
 */
export async function executeDelete(challengeId: number): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(`UPDATE trading_challenges SET status = 'deleted', updated_at = NOW() WHERE id = $1`, [challengeId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Build the Telegram message for a create confirmation.
 */
export function buildCreateMessage(data: any): string {
  const toEAT = (d: string) => {
    const dt = new Date(new Date(d).getTime() + 3 * 60 * 60 * 1000);
    return dt.toISOString().substring(0, 16).replace('T', ' ') + ' EAT';
  };
  return (
    `🔐 <b>Challenge Creation Request</b>\n\n` +
    `<b>Title:</b> ${data.title}\n` +
    `<b>Type:</b> ${data.type}\n` +
    `<b>Source:</b> ${data.source || 'winnerpip'}\n` +
    `<b>Start:</b> ${toEAT(data.start_date)}\n` +
    `<b>End:</b> ${toEAT(data.end_date)}\n` +
    `<b>Balance:</b> $${data.starting_balance}\n` +
    `<b>Target:</b> $${data.target_balance || 0}\n\n` +
    `⚠️ Confirm to create this challenge.`
  );
}

/**
 * Build the Telegram message for a delete confirmation.
 */
export function buildDeleteMessage(challengeId: number, title: string): string {
  return (
    `🔐 <b>Challenge Deletion Request</b>\n\n` +
    `<b>ID:</b> ${challengeId}\n` +
    `<b>Title:</b> ${title}\n\n` +
    `⚠️ Confirm to permanently delete this challenge.`
  );
}

/**
 * Queue a challenge status change for admin approval.
 */
export function queueStatusChange(challengeId: number, title: string, fromStatus: string, toStatus: string): string {
  cleanExpired();
  const token = generateToken();
  pendingActions.set(token, {
    token,
    type: 'status_change',
    data: { challengeId, title, fromStatus, toStatus },
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Execute the actual status change in DB.
 */
export async function executeStatusChange(challengeId: number, status: string): Promise<{ success: boolean; error?: string }> {
  try {
    await db.query(`UPDATE trading_challenges SET status = $1, updated_at = NOW() WHERE id = $2`, [status, challengeId]);
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Build the Telegram message for a status change confirmation.
 */
export function buildStatusChangeMessage(challengeId: number, title: string, fromStatus: string, toStatus: string): string {
  return (
    `🔐 <b>Status Change Request</b>\n\n` +
    `<b>Challenge:</b> ${title} (ID: ${challengeId})\n` +
    `<b>From:</b> ${fromStatus}\n` +
    `<b>To:</b> ${toStatus}\n\n` +
    `⚠️ Confirm to change status.`
  );
}
