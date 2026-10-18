/** Server choices observed in the user's MT5 catalogue on 2026-10-18. */
export const MT5_SERVERS: Record<'demo' | 'real', string[]> = {
  demo: ['', ...Array.from({length: 11}, (_, i) => String(i + 2)), '14', '15', '16', '17'].map(n => `Exness-MT5Trial${n}`),
  real: ['', ...Array.from({length: 11}, (_, i) => String(i + 2)), ...Array.from({length: 30}, (_, i) => String(i + 14)), '46', '51'].map(n => `Exness-MT5Real${n}`),
};
const normalize = (s: string) => s.trim().toLowerCase().replace(/[-_\s]/g, '');
function distance(a: string, b: string): number {
  let row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1]+1, row[j]+1, row[j-1]+Number(a[i-1] !== b[j-1]));
    row = next;
  }
  return row[b.length];
}
/** Search returns choices, never changes or invents a server number. */
export function serverChoices(input: string, type: string): string[] {
  const list = type === 'demo' ? MT5_SERVERS.demo : type === 'real' ? MT5_SERVERS.real : [];
  const q = normalize(input);
  if (!q) return list;
  if ((type === 'real' && q.includes('trial')) || (type === 'demo' && q.includes('real'))) return [];
  const exact = list.find(s => normalize(s) === q);
  if (exact) return [exact];
  if (/^\d+$/.test(q)) return list.filter(s => (s.match(/\d+$/)?.[0] || '').includes(q));
  const number = q.match(/\d+$/)?.[0];
  return list.filter(s => {
    const n = normalize(s);
    if (number !== n.match(/\d+$/)?.[0]) return false;
    return n.includes(q) || distance(q, n) <= 3;
  });
}
/** Only complete, recognized server names may be submitted. */
export function selectedServer(input: string, type: string): string | null {
  return (type === 'demo' ? MT5_SERVERS.demo : type === 'real' ? MT5_SERVERS.real : []).find(s => normalize(s) === normalize(input)) || null;
}
