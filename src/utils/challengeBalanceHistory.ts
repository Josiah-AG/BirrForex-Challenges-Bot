/** Display only published cash operations within the challenge's UTC window.
 * Keep the complete underlying ledger intact for reconciliation.
 */
export const challengeBalanceHistorySql = `SELECT o.deal_ticket, o.op_time, o.amount, o.op_type, o.comment
  FROM wp_visible_balance_ops_for($2) o
  JOIN trading_challenges c ON c.id=o.challenge_id
  WHERE o.challenge_id=$1 AND o.registration_id=$2
    AND o.op_time >= (c.start_date AT TIME ZONE 'UTC')
    AND o.op_time <= (c.end_date AT TIME ZONE 'UTC')
  ORDER BY o.op_time DESC`;
