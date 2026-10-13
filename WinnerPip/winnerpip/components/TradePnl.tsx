import {ReactNode} from 'react';
export default function TradePnl({trade,group,children}:{trade:any;group?:any[];children:ReactNode}) {
 if(!trade?.tradeGrowthMode)return <>{children}</>;
 const rows=group||[trade];
 const net=rows.reduce((sum,t)=>sum+Number(t.netPnl),0);
 const base=Number(trade.tradeStartingBalance);
 const valid=Number.isFinite(net)&&Number.isFinite(base)&&base>0;
 const pct=valid?net/base*100:null;
 const sign=net>0?'+':net<0?'−':'';
 const amount=Number.isFinite(net)?`${sign}${trade.tradeIsCent?'':'$'}${Math.abs(net).toFixed(2)}${trade.tradeIsCent?'¢':''}`:'—';
 return <span className="inline-flex flex-col items-end tabular-nums" title="Net trade P/L as a percentage of this participant’s challenge starting balance. Includes commission and swap; qualification is shown separately.">
 <span className={net<0?'text-red-400':'text-emerald-400'}>{pct==null?'—':`${pct>0?'+':''}${pct.toFixed(2)}%`}</span>
 <span className="text-[10px] leading-relaxed font-normal text-gray-400">{amount}</span>
 </span>;
}
