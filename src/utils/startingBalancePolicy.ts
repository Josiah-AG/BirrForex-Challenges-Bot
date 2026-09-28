/** All values are in the broker account's units (USD or USC), after conversion. */
export type BalanceProblem = 'high' | 'low' | 'invalid' | null;
export function startingBalanceProblem(balance: number, required: number, mode = 'fixed', policy = 'decimal'): BalanceProblem {
  if (!Number.isFinite(balance) || !Number.isFinite(required) || balance < 0 || required <= 0) return 'invalid';
  if (policy === 'legacy_percent') {
    if (mode === 'min_limit') return balance > 0 && balance < required * .99 ? 'low' : null;
    return balance > required * 1.01 ? 'high' : null;
  }
  // Compare money rounded to the broker's displayed two decimal places, not binary floats.
  const actual = Math.round((balance + Number.EPSILON) * 100);
  const minimum = Math.round((required + Number.EPSILON) * 100);
  const upperExclusive = (Math.floor(minimum / 100) + 1) * 100;
  if (mode !== 'max_limit' && actual < minimum) return 'low';
  if (mode !== 'min_limit' && actual >= upperExclusive) return 'high';
  return null;
}
export function preStartLeadHours(participants: number, saved?: number | null): number {
  return saved === 2 || saved === 3 ? saved : participants > 500 ? 3 : 2;
}
export function balanceCheckTimes(start: string | Date, participants: number, saved?: number | null) {
  const lead = preStartLeadHours(participants, saved);
  const finalAt = new Date(new Date(start).getTime() - lead * 3600000);
  return {lead, finalAt, warningAt: new Date(finalAt.getTime() - 3 * 3600000)};
}
