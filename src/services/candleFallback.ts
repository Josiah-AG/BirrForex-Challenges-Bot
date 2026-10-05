export type CandleRange = {symbol: string; from_time: string; to_time: string};
/** Bulk requests use one worker; missing symbols need the router's multi-worker route. */
export async function recoverMissingCandles(
  ranges: CandleRange[], results: Record<string, any>,
  fetchOne: (range: CandleRange) => Promise<any>,
  report: (message: string) => void,
): Promise<Record<string, any>> {
  const recovered = {...results};
  const missing = ranges.filter(r => !results[r.symbol]?.success || !results[r.symbol]?.candles?.length);
  // Bound concurrent candle work so account pulls keep terminal capacity.
  for (let i = 0; i < missing.length; i += 2) {
    await Promise.all(missing.slice(i, i + 2).map(async range => {
      report(`OHLC ${range.symbol}: bulk returned ${results[range.symbol]?.message || 'no candles'}; trying alternate-worker route`);
      try {
        const data = await fetchOne(range);
        if (data?.success && data.candles?.length) recovered[range.symbol] = data;
        else report(`OHLC ${range.symbol}: recovery pending: ${data?.message || 'no candles'}`);
      } catch (error) { report(`OHLC ${range.symbol}: recovery failed: ${(error as Error).message}`); }
    }));
  }
  return recovered;
}
