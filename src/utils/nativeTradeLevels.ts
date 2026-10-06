/** Closing-deal evidence is display-only: never replace entry/order risk inputs. */
export function validatedNativeLevels(trade: any): any | null {
  const e = trade.native_sl_tp;
  if (!e || e.source !== 'native_closing_deal' || String(e.ticket) !== String(trade.ticket)
      || String(e.position_id) !== String(trade.position_id)
      || !Number.isFinite(e.time_msc) || Math.floor(e.time_msc / 1000) !== Math.floor(Date.parse(trade.close_time) / 1000)
      || !Number.isFinite(e.sl) || !Number.isFinite(e.tp) || e.sl < 0 || e.tp < 0) return null;
  return { source: e.source, ticket: e.ticket, position_id: e.position_id, time_msc: e.time_msc, sl: e.sl, tp: e.tp };
}
