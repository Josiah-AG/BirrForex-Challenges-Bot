"use client";
import {useEffect,useState} from 'react';
import {challengeTimestamp} from '@/lib/challengeTime';
import TimeWithZone from './TimeWithZone';
import TradeProtectionLevel from './TradeProtectionLevel';

export default function AdminParticipantTrades({challengeId,registrationId,timezone}:{challengeId:string;registrationId:number;timezone:string}) {
  const [page,setPage]=useState(1),[data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    fetch(`/api/management/challenge/${challengeId}/participant/${registrationId}/trades?page=${page}`,{signal:controller.signal,cache:'no-store'})
      .then(async r=>{if(!r.ok)throw new Error('Could not load history. Please try again.');return r.json();})
      .then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[challengeId,registrationId,page]);
  const money=(v:any)=>`${Number(v||0).toFixed(2)}${data?.isCent?'¢':' USD'}`;
  const time=(v:any)=>v?<TimeWithZone text={challengeTimestamp(v,timezone,true)}/>:<>—</>;
  const labels:Record<string,string>={deposit:'Deposit',withdrawal:'Withdrawal',dividend:'Dividend adjustment',negative_balance_reset:'Negative balance reset',adjustment:'Broker adjustment',commission:'Commission',swap:'Swap',fee:'Broker fee',interest:'Interest',tax:'Tax'};
  return <section className="min-w-0 space-y-3" aria-busy={loading}>
    {data?.stats&&<div className="grid grid-cols-2 gap-3 text-center text-xs"><div className="bg-white/5 rounded-xl p-3"><p className="text-gray-400">Win rate (qualified)</p><strong>{Number(data.stats.wins)+Number(data.stats.losses)>0?`${Math.round(100*Number(data.stats.wins)/(Number(data.stats.wins)+Number(data.stats.losses)))}%`:'—'}</strong></div><div className="bg-white/5 rounded-xl p-3"><p className="text-gray-400">Average win / loss</p><strong>{Number(data.stats.average_loss)<0?(Number(data.stats.average_win)/Math.abs(Number(data.stats.average_loss))).toFixed(2):'—'}</strong></div></div>}
    <h3 className="text-sm font-semibold text-gray-300">Trade history{data?` · ${data.total} trades`:''}</h3>
    {error&&<p role="alert" className="text-red-400">{error}</p>}
    {loading&&<p className="text-xs text-gray-400">Loading trades…</p>}
    {!loading&&!error&&data?.trades.map((t:any)=><details key={t.ticket} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
      <summary className="cursor-pointer space-y-1">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{t.trade_type} {t.symbol} · #{t.ticket}</span><span className={Number(t.profit)+Number(t.commission)+Number(t.swap)>=0?'text-emerald-400':'text-red-400'}>{money(Number(t.profit)+Number(t.commission||0)+Number(t.swap||0))}</span></div>
        <div className="text-gray-400">{t.volume} lots · {time(t.close_time)} · {t.is_qualified?'Qualified':'Flagged'}</div>
        {data.commercial&&<div className="text-blue-300" title={t.generatedRevenue?.method}>Partner revenue: {t.generatedRevenue?`${(t.generatedRevenue.confirmed+t.generatedRevenue.estimated).toFixed(4)} USD (${t.generatedRevenue.confirmed.toFixed(4)} confirmed, ${t.generatedRevenue.estimated.toFixed(4)} estimated)${t.generatedRevenue.pending?' · Pending confirmation':''}`:'Pending'}</div>}
      </summary>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 break-words">
        {[["Opened",time(t.open_time)],["Closed",time(t.close_time)],["Open price",t.open_price],["Close price",t.close_price],["Gross profit",money(t.profit)],["Trading commission / fees",money(t.commission)],["Swap",money(t.swap)],["Position",String(t.position_id||t.ticket)],["Risk check",t.sl_check_pending?'Pending':t.sl_check_result||'—']].map(([label,value])=><div key={String(label)}><dt className="text-gray-500">{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="grid grid-cols-2 gap-3 mt-3"><TradeProtectionLevel trade={t} kind="sl"/><TradeProtectionLevel trade={t} kind="tp"/></div>
      {t.violations?.length>0&&<ul className="text-red-400 pt-3">{t.violations.map((v:any,i:number)=><li key={i}>{typeof v==='string'?v:v.detail||v.rule}</li>)}</ul>}
    </details>)}
    {!loading&&!error&&data?.total===0&&<p className="text-gray-500 text-sm">No trades recorded.</p>}
    {data&&<nav aria-label="Trade history pages" className="flex flex-wrap items-center justify-between gap-3 text-xs"><button disabled={loading||data.page<=1} onClick={()=>setPage(data.page-1)} className="px-3 py-2 rounded border border-white/10 disabled:opacity-30">Previous</button><span className="text-gray-400">Page {data.page} of {data.pages} · {data.total} trades</span><button disabled={loading||data.page>=data.pages} onClick={()=>setPage(data.page+1)} className="px-3 py-2 rounded border border-white/10 disabled:opacity-30">Next</button></nav>}
    {data?.balanceOps?.length>0&&<details className="border-t border-white/10 pt-3 text-xs"><summary className="cursor-pointer">Balance operations · {data.balanceOps.length}</summary><div className="max-h-64 overflow-auto space-y-2 mt-3">{data.balanceOps.map((op:any)=><div key={op.deal_ticket} className="bg-white/5 rounded p-3"><div className="flex justify-between gap-2"><span>{labels[op.op_type]||'Broker adjustment'}</span><span>{money(op.amount)}</span></div><p className="text-gray-400">{time(op.op_time)} · {op.comment}</p></div>)}</div></details>}
  </section>;
}
