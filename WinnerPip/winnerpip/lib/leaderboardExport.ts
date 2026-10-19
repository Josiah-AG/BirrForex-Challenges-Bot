export function exportLeaderboardResult(challenge: any, entry: any): string {
  if (entry.isDisqualified) return 'DQ';
  const category = entry.accountType;
  const split = challenge.type === 'hybrid' && (challenge.splitCategorySettings ?? challenge.split_category_settings);
  const mode = (split ? (challenge[`${category}DepositMode`] ?? challenge[`${category}_deposit_mode`]) : null)
    ?? challenge.depositMode ?? challenge.deposit_mode ?? 'fixed';
  if (mode !== 'fixed') {
    const growth = Number(entry.growthPercent || 0);
    return `${growth > 0 ? '+' : ''}${growth.toFixed(2)}%`;
  }
  const balance = Number(entry.adjustedBalance || 0) - Number(entry.totalWithdrawn || 0);
  return entry.isCent ? `${balance.toFixed(0)}¢` : `$${balance.toFixed(2)}`;
}
export function exportMinimumTradesDot(entry: any): string {
  const unmet = Number(entry.minimumTradesRequired || 0) > Number(entry.qualifiedTrades || 0);
  return `<span class="minimum-dot"${unmet ? ' title="Minimum qualified trades not met" aria-label="Minimum qualified trades not met"' : ' aria-hidden="true"'} style="visibility:${unmet ? 'visible' : 'hidden'}">●</span>`;
}
export const exportLeaderboardAlignment = `.lb-row{display:grid;grid-template-columns:50px minmax(0,1fr) 65px 160px 140px;gap:16px}.lb-name{min-width:0;overflow-wrap:anywhere}.lb-type{text-align:center}.lb-balance{display:flex;justify-content:flex-end;align-items:center;gap:8px;white-space:nowrap;font-variant-numeric:tabular-nums}.minimum-dot{color:#f87171;font-size:14px;width:12px;flex:none}.lb-trades{min-width:0}`;
