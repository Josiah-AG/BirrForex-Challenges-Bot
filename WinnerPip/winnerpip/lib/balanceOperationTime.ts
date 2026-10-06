/** The timestamp is an absolute API instant; display it in the challenge zone. */
export function balanceOperationTime(value: string, timeZone = 'Africa/Addis_Ababa'): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
  }).format(date);
}
