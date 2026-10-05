/** Presentation only: never round the risk used by evaluation or deductions. */
export function riskViolationDisplay(message: string, risk: number, balance: number, percent: number | null, isCent: boolean): string {
  const amount = `${isCent ? '¢' : '$'}${risk.toFixed(2)}`;
  const explanation = percent && percent > 0
    ? `${amount} (${percent}% of balance at trade open: ${isCent ? '¢' : '$'}${balance.toFixed(2)})`
    : amount;
  return message
    .replace(/maximum allowed risk \([$¢][\d.]+(?:, virtual SL @ [\d.]+)?\)/gi, `maximum allowed risk of ${explanation}`)
    .replace(/max allowed loss of [$¢][\d.]+/gi, `max allowed loss of ${amount}`);
}

export function riskViolationTime(timestamp: string, timezone: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
}
