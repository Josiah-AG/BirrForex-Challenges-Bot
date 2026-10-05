export default function MinimumTradesBadge({ entry, required, hidden = false }: { entry: any; required?: number | null; hidden?: boolean }) {
  const minimum = entry.minimumTradesRequired ?? required ?? 0;
  const count = Number(entry.totalTrades || 0);
  if (hidden || entry.isDisqualified || entry.isWithdrawn || entry.isBlown || minimum <= 0 || count >= minimum) return null;
  return <span className="mt-1 inline-flex max-w-full rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold leading-snug text-amber-300" title="The trophy shows a current winning position. Minimum trades must still be completed before the challenge ends.">Minimum trades pending · {count}/{minimum}</span>;
}
