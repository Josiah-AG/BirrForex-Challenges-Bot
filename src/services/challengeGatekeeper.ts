import { formatInTimezone } from '../utils/timezone';
import { validateChallenge, normalizeChallengeInput } from '../utils/configValidation';
import { transitionChallenge } from './challengeState';
/** Challenge mutations are persisted for one-time approval by an authenticated admin. */

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

async function queue(type: PendingAction['type'], data: any): Promise<string> {
  const token=crypto.randomBytes(16).toString('hex');
  await db.query('INSERT INTO challenge_approvals (token,kind,payload) VALUES ($1,$2,$3)',[token,type,JSON.stringify(data)]);
  return token;
}
export async function queueCreate(data: any): Promise<string> {
  data=normalizeChallengeInput(data);
  if(!data.already_inserted)validateChallenge(data);
  return queue('create',data);
}
export async function queueDelete(challengeId: number,title: string): Promise<string> {
  return queue('delete',{challengeId,title});
}
export async function getPending(token: string): Promise<PendingAction | undefined> {
  const result=await db.query("SELECT * FROM challenge_approvals WHERE token=$1 AND state='pending'",[token]);
  const row=result.rows[0];
  return row ? {token,type:row.kind,data:row.payload,createdAt:new Date(row.created_at).getTime(),messageId:row.message_id} : undefined;
}
export async function removePending(_token: string): Promise<void> { /* decisions persist for audit */ }
export async function setMessageId(token: string,messageId: number): Promise<void> {
  await db.query('UPDATE challenge_approvals SET message_id=$2 WHERE token=$1',[token,messageId]);
}
/** Commit decision and its database effects once, before external notifications. */
export async function decide(token: string, approve: boolean): Promise<any> {
  return db.transaction(async()=>{
    const locked=await db.query("SELECT token FROM challenge_approvals WHERE token=$1 AND state='pending' FOR UPDATE",[token]);
    if(!locked.rows.length)return null;
    const pending=await getPending(token);
    if(!pending)return null;
    let result: any={success:true};
    if(approve){
      if(pending.type==='create')result=await executeCreate(pending.data);
      else if(pending.type==='delete')result=await executeDelete(pending.data.challengeId);
      else result=await executeStatusChange(pending.data.challengeId,pending.data.toStatus,pending.data.fromStatus);
      if(!result.success)throw new Error(result.error); // rollback, request remains retryable
    } else if(pending.type==='create' && pending.data.already_inserted){
      await db.query("UPDATE trading_challenges SET status='rejected',updated_at=NOW() WHERE id=$1 AND status='pending_approval'",[pending.data.challenge_id]);
    }
    await db.query('UPDATE challenge_approvals SET state=$2,decided_at=NOW(),result=$3 WHERE token=$1',[token,approve?'approved':'rejected',JSON.stringify(result)]);
    return {pending,result};
  });
}

/**
 * Execute the actual challenge creation in DB.
 */
export async function executeCreate(data: any): Promise<{ success: boolean; challenge?: any; error?: string }> {
  data=normalizeChallengeInput(data);
  return db.transaction(async () => {
  try {
    // Host-created challenges are already inserted with 'pending_approval' status
    if (data.already_inserted && data.challenge_id) {
      const result = await db.query(
        `UPDATE trading_challenges SET status = 'draft', updated_at = NOW() WHERE id = $1 AND status = 'pending_approval' RETURNING *`,
        [data.challenge_id]
      );
      if (!result.rows.length) throw new Error("Approval is stale: challenge is no longer pending");
      return { success: true, challenge: result.rows[0] };
    }

    validateChallenge(data);
    // Admin-created challenges: insert fresh
    const evalType = data.evaluation_type === 'legacy' ? 'legacy' : 'winnerpip';
    const result = await db.query(
      `INSERT INTO trading_challenges
       (title, type, status, start_date, end_date, registration_deadline, starting_balance, target_balance,
        prize_pool_text, real_winners_count, demo_winners_count, real_prizes, demo_prizes,
        pdf_url, video_url, source, team_only, announcement_posted, evaluation_type,
        pull_times, pull_interval_hours, first_pull_time, deposit_mode, target_percent, host_id,
        split_category_settings, demo_starting_balance, demo_target_balance, real_starting_balance, real_target_balance,
        demo_deposit_mode, real_deposit_mode, demo_target_percent, real_target_percent,
        target_enabled, allow_below_start, demo_target_enabled, real_target_enabled, demo_allow_below_start, real_allow_below_start)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, false, $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30, $31, $32,
        $33, $34, $35, $36, $37, $38)
       RETURNING *`,
      [
        data.title, data.type, data.start_date, data.end_date,
        data.registration_deadline || data.start_date,
        data.starting_balance, data.target_balance || 0,
        data.prize_pool_text || '', data.real_winners_count || 0, data.demo_winners_count || 0,
        JSON.stringify(data.real_prizes || []), JSON.stringify(data.demo_prizes || []),
        data.pdf_url || null, data.video_url || null,
        data.source || 'telegram', data.team_only || false,
        evalType,
        JSON.stringify(data.pull_times || ['00:00','04:00','08:00','12:00','16:00','20:00']),
        data.pull_interval_hours || 4,
        data.first_pull_time || '00:00',
        data.deposit_mode || 'fixed',
        data.target_percent || null,
        data.host_id || null,
        data.split_category_settings || false,
        data.demo_starting_balance ?? null,
        data.demo_target_balance ?? null,
        data.real_starting_balance ?? null,
        data.real_target_balance ?? null,
        data.demo_deposit_mode || null,
        data.real_deposit_mode || null,
        data.demo_target_percent || null,
        data.real_target_percent || null,
        // Optional-target flags — default to today's behavior when not provided.
        data.target_enabled === undefined ? true : !!data.target_enabled,
        data.allow_below_start === undefined ? false : !!data.allow_below_start,
        data.demo_target_enabled === undefined || data.demo_target_enabled === null ? null : !!data.demo_target_enabled,
        data.real_target_enabled === undefined || data.real_target_enabled === null ? null : !!data.real_target_enabled,
        data.demo_allow_below_start === undefined || data.demo_allow_below_start === null ? null : !!data.demo_allow_below_start,
        data.real_allow_below_start === undefined || data.real_allow_below_start === null ? null : !!data.real_allow_below_start,
      ]
    );

    const { evaluationEngine } = require('./wpEvaluationEngine');
    if(data.rules) await evaluationEngine.saveRules(result.rows[0].id,data.rules);
    if(data.rules_demo) await evaluationEngine.saveRules(result.rows[0].id,data.rules_demo,'config_demo');
    if(data.rules_real) await evaluationEngine.saveRules(result.rows[0].id,data.rules_real,'config_real');
    await db.query('UPDATE trading_challenges SET timezone=$2 WHERE id=$1',[result.rows[0].id,data.timezone || 'Africa/Nairobi']);

    return { success: true, challenge: result.rows[0] };
  } catch (error) { throw error; }
  });
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
  const toLocal = (d: string) => formatInTimezone(d,data.timezone || 'Africa/Nairobi');
  const depositModeLabel = data.deposit_mode === 'max_limit' ? 'Max Limit' : data.deposit_mode === 'min_limit' ? 'Min Limit' : 'Fixed';
  const targetDisplay = data.deposit_mode && data.deposit_mode !== 'fixed' && data.target_percent
    ? `${data.target_percent}% growth`
    : `$${data.target_balance || 0}`;
  return (
    `🔐 <b>Challenge Creation Request</b>\n\n` +
    `<b>Title:</b> ${data.title}\n` +
    `<b>Type:</b> ${data.type}\n` +
    `<b>Source:</b> ${data.source || 'winnerpip'}\n` +
    `<b>Deposit Mode:</b> ${depositModeLabel}\n` +
    `<b>Start:</b> ${toLocal(data.start_date)}\n` +
    `<b>End:</b> ${toLocal(data.end_date)}\n` +
    `<b>Balance:</b> $${data.starting_balance}\n` +
    `<b>Target:</b> ${targetDisplay}\n\n` +
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
/**
 * Queue a status change for admin approval (used by hosts and admin panel).
 */
export async function queueStatusChange(challengeId: number,title: string,fromStatus: string,toStatus: string,hostName?: string): Promise<string> {
  return queue('status_change',{challengeId,title,fromStatus,toStatus,hostName});
}
export async function executeStatusChange(challengeId: number,status: string,expected?: string): Promise<{success:boolean;error?:string}> {
  await transitionChallenge(challengeId,status,expected);
  return {success:true};
}

/**
 * Build the Telegram message for a status change confirmation.
 */
export function buildStatusChangeMessage(challengeId: number, title: string, fromStatus: string, toStatus: string, hostName?: string): string {
  const hostLine = hostName ? `<b>Host:</b> ${hostName}\n` : '';
  return (
    `🔐 <b>Status Change Request</b>\n\n` +
    hostLine +
    `<b>Challenge:</b> ${title} (ID: ${challengeId})\n` +
    `<b>From:</b> ${fromStatus}\n` +
    `<b>To:</b> ${toStatus}\n\n` +
    `⚠️ Confirm to change status.`
  );
}
