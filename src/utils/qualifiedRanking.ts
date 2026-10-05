/** Ranking uses the evaluated balance less withdrawals, never broker/gross balance
 * or a cached normalized balance. Values stored on the leaderboard are in account units. */
export function qualifiedRankingSql(alias = 'l'): string {
  return `((COALESCE(${alias}.adjusted_balance, 0) - COALESCE(${alias}.total_withdrawn, 0)) / CASE WHEN ${alias}.is_cent THEN 100.0 ELSE 1 END)`;
}

/** Shared order for public, host and admin leaderboard reads. Category views
 * retain published ranks; combined views compare the evaluated account metric. */
export function leaderboardOrderSql(category: string, growth = false): string {
  return `ORDER BY
    CASE WHEN l.is_disqualified = true OR r.disqualified = true THEN 4
         WHEN l.rank IS NULL THEN 5
         WHEN COALESCE(l.is_withdrawn,false) THEN 1
         WHEN l.zero_balance_at IS NOT NULL THEN 3
         WHEN ${qualifiedRankingSql()} <= 0 THEN 2 ELSE 0 END,
    ${(category === 'demo' || category === 'real') ? 'l.rank ASC NULLS LAST'
      : `${growth ? 'COALESCE(l.growth_percent,0)' : qualifiedRankingSql()} DESC,
         l.total_trades DESC, l.last_trade_time ASC NULLS LAST, r.registered_at ASC, r.id ASC`}`;
}
