// Broker lots/reward_usd are already normalized. Only native MT5 cent lots are scaled.
export const normalizeCommercialAccount = (v: unknown) => String(v ?? '').trim().replace(/^#/, '');
export const normalizedTradeLots = (lots: unknown, cent: boolean) => Number(lots) / (cent ? 100 : 1);
export const sumCommercial = (rows: any[], field: string) => rows.reduce((sum, r) => sum + Math.round(Number(r[field] || 0) * 1e8), 0) / 1e8;
export function commercialCutoff(start: any, end: any, now: number, pull: any, independent: boolean, completed: boolean): number | null {
  const ceiling = Math.min(now, new Date(end).getTime());
  const cutoff = independent || completed ? ceiling : pull ? Math.min(ceiling, new Date(pull).getTime()) : NaN;
  return Number.isFinite(cutoff) && cutoff >= new Date(start).getTime() ? cutoff : null;
}
export function eligibleCommercialOrder(order: any, start: number, cutoff: number | null) {
  const closed = Date.parse(order.close_date);
  return cutoff !== null && Number.isFinite(closed) && closed >= start && closed <= cutoff;
}
export function historicalRate(orders: any[], account: string, symbol: string, type: string, at: number): number | null {
  // Empirical estimate, never a claim about the partner's current named tier.
  const candidates = orders.filter(o => o.client_account === account && o.symbol === symbol && o.client_account_type === type
    && Date.parse(o.close_date) <= at && Date.parse(o.close_date) >= at - 30 * 86400000
    && Number(o.volume_lots) > 0 && Number(o.reward_usd) >= 0)
    .sort((a,b) => Date.parse(b.close_date)-Date.parse(a.close_date)).slice(0,5);
  if (!candidates.length) return null;
  const rates = candidates.map(o => Number(o.reward_usd)/Number(o.volume_lots)).sort((a,b)=>a-b);
  return rates[Math.floor(rates.length/2)];
}
export function commercialSummary(trades: any[]) {
  const confirmed = sumCommercial(trades.filter(t=>t.state==='confirmed'), 'revenue');
  const estimated = sumCommercial(trades.filter(t=>t.state==='estimated'), 'revenue');
  const activities=[...new Map(trades.map((t,i)=>[t.activityKey||t.key||String(i),t])).values()];
  const instruments: Record<string,number> = {};
  for (const t of activities) instruments[t.symbol] = (instruments[t.symbol] || 0) + Number(t.lots || 0);
  return {confirmed, estimated, total: sumCommercial([{n:confirmed},{n:estimated}], 'n'),
    lots: sumCommercial(activities,'lots'), volumeUSD: sumCommercial(activities,'volumeUSD'),
    volumePending: trades.filter(t=>t.volumeUSD == null).length,
    pending: trades.filter(t=>t.state==='pending').length, estimatedCount: trades.filter(t=>t.state==='estimated').length,
    transactions: activities.length, topInstrument: Object.entries(instruments).sort((a,b)=>b[1]-a[1])[0]?.[0] || null};
}
