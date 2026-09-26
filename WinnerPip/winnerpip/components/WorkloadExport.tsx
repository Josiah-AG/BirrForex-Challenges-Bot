'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  app: string;
  getJson: (path: string, signal: AbortSignal) => Promise<any>;
};

export default function WorkloadExport({ app, getJson }: Props) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function download() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setStatus('Preparing export…');
    try {
      const until = new Date().toISOString();
      const summary = await getJson(`workload-report?days=${days}`, abort.signal);
      const parts: BlobPart[] = [JSON.stringify({ app, days, exported_at: until, summary }).slice(0, -1)];
      let count = 0;
      for (const kind of ['requests', 'jobs']) {
        parts.push(`,"${kind}":[`);
        let offset: number | null = 0;
        let first = true;
        while (offset !== null) {
          const page = await getJson(`workload-events?days=${days}&kind=${kind}&until=${encodeURIComponent(until)}&offset=${offset}`, abort.signal);
          if (!Array.isArray(page.rows)) throw new Error('Invalid export response. Please try again.');
          if (page.rows.length) {
            parts.push((first ? '' : ',') + page.rows.map((row: unknown) => JSON.stringify(row)).join(','));
            first = false;
            count += page.rows.length;
          }
          setStatus(`Preparing ${count.toLocaleString()} records…`);
          const next = page.next_offset;
          if (next !== null && (!Number.isInteger(next) || next <= offset)) throw new Error('Invalid export page. Please try again.');
          offset = next;
        }
        parts.push(']');
      }
      parts.push('}');
      if (abort.signal.aborted) throw new Error('Export cancelled.');
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${app}-workload-${days}days-${until.slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus(`Download started: ${count.toLocaleString()} records.`);
    } catch (error: any) {
      setStatus(abort.signal.aborted ? 'Export cancelled.' : (error.message || 'Export failed. Please try again.'));
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="my-4 rounded-xl border border-gray-500/30 p-4">
      <h3 className="font-semibold">Workload history export</h3>
      <p className="text-sm opacity-70 mt-1">Download request history, job events and a summary in one JSON file.</p>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <label className="text-sm">Period
          <select aria-label="Workload export period" value={days} disabled={busy} onChange={e => setDays(Number(e.target.value))} className="ml-2 rounded border border-gray-500 bg-gray-900 text-white px-3 py-2">
            {[1, 7, 14, 30, 90].map(n => <option key={n} value={n}>Last {n} {n === 1 ? 'day' : 'days'}</option>)}
          </select>
        </label>
        <button type="button" onClick={download} disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Preparing…' : 'Export workload data'}
        </button>
        {busy && <button type="button" onClick={() => controller.current?.abort()} className="text-sm underline">Cancel export</button>}
      </div>
      <p role="status" aria-live="polite" className="text-sm mt-2">{status}</p>
    </section>
  );
}
