/** Only a broker D-NULL operation that exactly clears a verified negative cash
 * balance is exempt from recharge rules. Amount alone never proves a reset. */
export function negativeBalanceResetTickets(deals: any[], verifiedBalance: number, verifiedThrough: any, state: string): Set<string> {
  const result = new Set<string>();
  const cutoff = +new Date(verifiedThrough);
  if (!['verified', 'published'].includes(state) || !Number.isFinite(verifiedBalance) || !Number.isFinite(cutoff)) return result;
  const rows = deals.map(d => ({...d, at: +new Date(d.time)}));
  if (rows.some(d => !/^\d+$/.test(String(d.ticket)) || !Number.isFinite(d.at) || [d.profit, d.commission ?? 0, d.swap ?? 0, d.fee ?? 0].some(v => !Number.isFinite(Number(v))) || ['13','14'].includes(String(d.deal_type)))) return result;
  rows.sort((a,b) => b.at-a.at || (BigInt(b.ticket)>BigInt(a.ticket)?1:BigInt(b.ticket)<BigInt(a.ticket)?-1:0));
  let after = verifiedBalance;
  for (const d of rows) {
    if (d.at > cutoff) continue;
    const type = String(d.deal_type).toLowerCase();
    const net = ['3','credit'].includes(type) ? 0 : Number(d.profit)+Number(d.commission??0)+Number(d.swap??0)+Number(d.fee??0);
    const before = after-net;
    if (['2','balance'].includes(type) && String(d.comment||'').trim().toUpperCase()==='D-NULL'
        && Number(d.profit)>0 && before<0 && Math.round(after*100)===0
        && Math.round((Number(d.profit)+before)*100)===0) result.add(String(d.ticket));
    after = before;
  }
  return result;
}
