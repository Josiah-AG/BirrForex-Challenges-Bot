import type { CandleRange } from '../services/candleFallback';
/** Request the complete traded window, including entry/exit minutes, rather than
 * treating closed-market minutes outside trades as missing candles. */
export function tradeCandleRanges(trades: Array<{symbol:string;open_time:any;close_time:any}>, now=Date.now()): CandleRange[] {
  const ranges=new Map<string,{from:number;to:number}>();
  for(const t of trades){
    const open=+new Date(t.open_time),close=+new Date(t.close_time);
    if(!t.symbol||t.open_time==null||t.close_time==null||!Number.isFinite(open)||!Number.isFinite(close)||close<open||open>now)continue;
    const symbol=t.symbol.replace(/[a-z]$/,'')+'m';
    const from=Math.floor(open/60000)*60000-60000,to=Math.min(close,now);
    const prior=ranges.get(symbol);
    ranges.set(symbol,{from:Math.min(prior?.from??from,from),to:Math.max(prior?.to??to,to)});
  }
  return [...ranges].map(([symbol,r])=>({symbol,from_time:new Date(r.from).toISOString(),to_time:new Date(r.to).toISOString()}));
}
