import {db} from '../database/db';
import {negativeBalanceResetTickets} from './negativeBalanceReset';
import {brokerCashOperationType} from './brokerCashOperation';
/** Display only published cash operations within the challenge's UTC window.
 * Keep the complete underlying ledger intact for reconciliation.
 */
export const challengeBalanceHistorySql = `SELECT o.deal_ticket, o.op_time, o.amount, o.op_type, o.comment, d.deal_type
  FROM wp_visible_balance_ops_for($2) o
  LEFT JOIN wp_deals d ON d.registration_id=o.registration_id AND d.ticket=o.deal_ticket
  JOIN trading_challenges c ON c.id=o.challenge_id
  WHERE o.challenge_id=$1 AND o.registration_id=$2
    AND o.op_time >= (c.start_date AT TIME ZONE 'UTC')
    AND o.op_time <= (c.end_date AT TIME ZONE 'UTC')
  ORDER BY o.op_time DESC`;

/** Labels use the same verified reset evidence as the recharge rule, without
 * changing the underlying balance-operation type or financial calculations. */
export async function labelBalanceHistory(registrationId: number, rows: any[]): Promise<any[]> {
  let resets = new Set<string>();
  if(rows.some(o=>String(o.comment||'').trim().toUpperCase()==='D-NULL')) {
    const registration=(await db.query(`SELECT history_verified_balance,history_verified_through,history_sync_state
      FROM trading_registrations WHERE id=$1`,[registrationId])).rows[0];
    if(registration) {
      const deals=(await db.query(`SELECT ticket,time,deal_type,profit,commission,swap,fee,comment
        FROM wp_deals WHERE registration_id=$1 ORDER BY time,ticket`,[registrationId])).rows;
      resets=negativeBalanceResetTickets(deals,registration.history_verified_balance==null ? NaN : Number(registration.history_verified_balance),registration.history_verified_through,registration.history_sync_state);
    }
  }
  return rows.map(o=>({...o,op_type:resets.has(String(o.deal_ticket)) ? 'negative_balance_reset' : brokerCashOperationType(o.op_type,o.comment,o.deal_type)}));
}
