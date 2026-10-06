/** Legacy challenge/registration timestamps are stored as UTC without a zone;
 * cash-operation timestamps are timestamptz. Make the conversion explicit so
 * neither the server session timezone nor pre-start account resets affect totals.
 */
export function challengeWithdrawalWindowSql(): string {
  return `o.op_time >= (GREATEST(c.start_date, r.registered_at) AT TIME ZONE 'UTC')
          AND o.op_time <= (c.end_date AT TIME ZONE 'UTC')`;
}

export function rebuildChallengeWithdrawalsSql(singleRegistration = false): string {
  return `UPDATE wp_leaderboard l SET total_withdrawn=ledger.total,
    is_withdrawn=(ledger.total>0 AND l.current_balance<=0)
    FROM (SELECT r.id,COALESCE(SUM(ABS(o.amount)) FILTER(
      WHERE o.op_type='withdrawal' AND ${challengeWithdrawalWindowSql()}),0) AS total
      FROM trading_registrations r JOIN trading_challenges c ON c.id=r.challenge_id
      LEFT JOIN wp_balance_ops o ON o.registration_id=r.id AND o.challenge_id=r.challenge_id
      WHERE r.challenge_id=$1 GROUP BY r.id) ledger
    WHERE l.registration_id=ledger.id AND l.challenge_id=$1${singleRegistration ? ' AND l.registration_id=$2' : ''}`;
}
