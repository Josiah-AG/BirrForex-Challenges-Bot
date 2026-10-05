/** Trade path plus a separately labelled published adjustment. Never invent the
 * historical time of a penalty when only its published total is available. */
export function qualifiedBalanceSeries(startingBalance: number, startTime: string, trades: any[], published: any) {
  const round = (value: number) => Math.round(value * 100) / 100;
  let gross = startingBalance, adjusted = startingBalance;
  const series = [{time:startTime,gross,adjusted,label:'Start'}];
  for (const t of trades) {
    const net = Number(t.profit || 0) + Number(t.commission || 0) + Number(t.swap || 0);
    gross += net;
    if (t.is_qualified === true || net <= 0) adjusted += net;
    series.push({time:t.close_time,gross:round(gross),adjusted:round(adjusted),label:''});
  }
  if (published) {
    const withdrawn = Number(published.total_withdrawn || 0);
    const finalGross = round(Number(published.current_balance) - withdrawn);
    const finalAdjusted = round(Number(published.adjusted_balance) - withdrawn);
    if (finalGross !== round(gross) || finalAdjusted !== round(adjusted)) {
      series.push({time:published.last_updated, gross:finalGross, adjusted:finalAdjusted, label:'Published balance'});
      return {series, adjustmentNote:'The final balance includes evaluated penalties and withdrawals.'};
    }
  }
  return {series, adjustmentNote:null};
}
