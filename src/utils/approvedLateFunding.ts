/** A manual late admission can identify its verified initial funding deal.
 * Never infer this exception from dates or registration status alone.
 */
export function rechargeDepositsForRegistration(deposits: any[], registration: any, challengeStart: number, setupWithdrawals: any[] = []): any[] {
  const prefix = 'approved_late_initial_deposit:';
  if (!String(registration.funding_origin || '').startsWith(prefix)) return deposits;
  const ticket = String(registration.funding_origin).slice(prefix.length);
  const first = deposits[0];
  const registeredAt = new Date(registration.registered_at).getTime();
  const fundedAt = first ? new Date(first.time).getTime() : NaN;
  const amount = Number(first?.profit);
  const baseline = Number(registration.registration_balance);
  // Verified pre-admission withdrawals may reset initial funding to the required balance.
  // A withdrawal after admission cannot retroactively justify the opening baseline.
  let resetCents = 0;
  for (const withdrawal of setupWithdrawals) {
    const time = new Date(withdrawal.time).getTime();
    const value = Number(withdrawal.profit);
    if (!Number.isFinite(value) || value >= 0 || !(time >= fundedAt && time < registeredAt)) {
      throw new Error('Approved late-entry setup withdrawal evidence does not match');
    }
    resetCents += Math.round(value * 100);
  }
  if (!/^\d+$/.test(ticket) || String(first?.ticket) !== ticket
      || !Number.isFinite(registeredAt) || !(registeredAt > challengeStart)
      || !(fundedAt >= challengeStart && fundedAt < registeredAt)
      || !Number.isFinite(amount) || !(baseline > 0)
      || Math.round(amount * 100) + resetCents !== Math.round(baseline * 100)) {
    throw new Error('Approved late-entry initial funding evidence does not match');
  }
  // Any additional deposit, including one before manual admission, remains recharging.
  return deposits.slice(1);
}
