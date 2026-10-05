/** Inline qualified count; winning-position highlighting is independent of this requirement. */
export default function MinimumTradesBadge({ entry, required, hidden = false }: { entry: any; required?: number | null; hidden?: boolean }) {
  if (hidden) return null;
  const minimum = Number(entry.minimumTradesRequired ?? required ?? 0);
  const count = Number(entry.qualifiedTrades || 0);
  const unmet = minimum > 0 && count < minimum;
  return <span className={unmet ? "text-red-400" : undefined} title={`Only closed trades that pass the challenge rules count.${minimum > 0 ? ` Minimum: ${minimum} qualified trades.` : ""}`}>
    {count} qualified{unmet && <span> (Minimum qualified trades not met)</span>}
  </span>;
}
