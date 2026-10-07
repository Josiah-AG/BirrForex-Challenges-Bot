/** Form dates always use the challenge timezone, independently of the browser. */
export function utcToWallClock(iso: string | Date, timezone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function wallClockToUtcISO(local: string, timezone: string): string {
  if (!local) return '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Invalid local date');
  const naive = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(naive)) throw new Error('Invalid local date');
  // Probe offsets on either side of a DST boundary and keep only exact roundtrips.
  const matches = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const probe = naive + hours * 3600000;
    const rendered = Date.parse(`${utcToWallClock(new Date(probe), timezone)}:00Z`);
    const candidate = naive - (rendered - probe);
    if (utcToWallClock(new Date(candidate), timezone) === local) matches.add(candidate);
  }
  if (matches.size !== 1) throw new Error(matches.size ? 'This time occurs twice when clocks change. Choose an unambiguous time.' : 'This local time does not exist when clocks change. Choose another time.');
  return new Date(Array.from(matches)[0]).toISOString();
}

/** Display stored instants in the selected challenge zone, never the browser zone. */
export function challengeTimestamp(value: string | Date | number | null | undefined, timezone='Africa/Nairobi', date=false, seconds=false): string {
 if(value==null || value==='')return '—';
 const instant=new Date(value); if(!Number.isFinite(instant.getTime()))return '—';
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(seconds ? {second:'2-digit' as const}:{}),timeZoneName:'short'}).format(instant);
 return date ? `${utcToWallClock(instant,timezone).slice(0,10)} ${time}` : time;
}
