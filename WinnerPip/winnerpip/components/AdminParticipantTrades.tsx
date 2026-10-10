"use client";
import {useEffect,useState} from 'react';
import {challengeTimestamp} from '@/lib/challengeTime';
import TimeWithZone from './TimeWithZone';
import {ChevronDown} from 'lucide-react';
import TradeProtectionLevel from './TradeProtectionLevel';

function ParticipantVolume({value}:{value:any}) {
  const amount=value?.volumeUSD;
  return <div className="mt-2 text-xs">
    <p className="flex flex-wrap gap-x-2 gap-y-1"><span className="text-gray-400">Volume</span><strong className="text-blue-300 tabular-nums">{amount==null?'Pending':Number(amount).toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2})}</strong>{value&&<span className="text-gray-400">· {Number(value.lots||0).toLocaleString(undefined,{maximumFractionDigits:4})} lots</span>}</p>
    {value?.volumePending>0&&<p className="text-[10px] text-amber-400 mt-1">{value.volumePending} trade volumes pending</p>}
  </div>;
}
export default function AdminParticipantTrades({challengeId,registrationId,timezone}:{challengeId:string;registrationId:number;timezone:string}) {
  const [page,setPage]=useState(1),[data,setData]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    fetch(`/api/management/challenge/${challengeId}/participant/${registrationId}/trades?page=${page}`,{signal:controller.signal,cache:'no-store'})
      .then(async r=>{if(!r.ok)throw new Error('Could not load history. Please try again.');return r.json();})
      .then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[challengeId,registrationId,page]);
  const money=(v:any)=>`${Number(v||0).toFixed(2)}${data?.isCent?'¢':' USD'}`;
  const revenue=(v:any)=>Number(v||0).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
  const breakdown=(v:any)=>`${revenue(v.confirmed)} confirmed · ${revenue(v.estimated)} estimated`;
  const time=(v:any)=>v?<TimeWithZone text={challengeTimestamp(v,timezone,true)}/>:<>—</>;
  const labels:Record<string,string>={deposit:'Deposit',withdrawal:'Withdrawal',dividend:'Dividend adjustment',negative_balance_reset:'Negative balance reset',adjustment:'Broker adjustment',commission:'Commission',swap:'Swap',fee:'Broker fee',interest:'Interest',tax:'Tax'};
  return <section className="min-w-0 space-y-3" aria-busy={loading}>
    {data?.stats&&<div className="grid grid-cols-2 gap-3 text-center text-xs"><div className="bg-white/5 rounded-xl p-3"><p className="text-gray-400">Win rate (qualified)</p><strong>{Number(data.stats.wins)+Number(data.stats.losses)>0?`${Math.round(100*Number(data.stats.wins)/(Number(data.stats.wins)+Number(data.stats.losses)))}%`:'—'}</strong></div><div className="bg-white/5 rounded-xl p-3"><p className="text-gray-400">Average win / loss</p><strong>{Number(data.stats.average_loss)<0?(Number(data.stats.average_win)/Math.abs(Number(data.stats.average_loss))).toFixed(2):'—'}</strong></div></div>}
    {data&& !data.commercial&&<p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-gray-400">Demo account · These trades do not generate partner revenue.</p>}
    {data?.commercial&&<div className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-4 space-y-3">
      <div><p className="text-xs text-gray-400">Revenue · Challenge account</p><p className="text-2xl font-semibold text-blue-300 mt-1">{data.revenueSummary?revenue(data.revenueSummary.challenge.total):'Pending'}</p>
      {data.revenueSummary&&<p className="text-[11px] text-gray-400 mt-1">{breakdown(data.revenueSummary.challenge)}</p>}<ParticipantVolume value={data.revenueSummary?.challenge}/></div>
      <div className="border-t border-white/10 pt-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-gray-400">All MT5 accounts</span><strong>{data.revenueSummary?revenue(data.revenueSummary.all.total):'Pending'}</strong></div>
      <p className="text-[11px] text-gray-500 mt-1">During this challenge · Includes the challenge account</p>
      {data.revenueSummary&&<p className="text-[11px] text-gray-400 mt-1">{breakdown(data.revenueSummary.all)}</p>}<ParticipantVolume value={data.revenueSummary?.all}/></div>
      {data.revenueSummary?.all.pending>0&&<p className="text-xs text-amber-400">{data.revenueSummary.all.pending} trade revenues pending</p>}
      {data.revenueSummary?.cutoff&&<p className="text-[10px] text-gray-500">Through {time(data.revenueSummary.cutoff)} · Totals cover all pages</p>}
      {data.revenueSummary?.issues?.map((issue:string)=><p key={issue} className="text-xs text-amber-400">{issue}</p>)}
    </div>}
    <h3 className="text-sm font-semibold text-gray-300">Trade history{data?` · ${data.total} trades`:''}</h3>
    {error&&<p role="alert" className="text-red-400">{error}</p>}
    {loading&&<p className="text-xs text-gray-400">Loading trades…</p>}
    {!loading&&!error&&data?.trades.map((t:any)=><details key={t.ticket} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-sm">{t.symbol} <span className={`text-[10px] font-medium ml-1 ${String(t.trade_type).toLowerCase()==='buy'?'text-emerald-400':'text-red-400'}`}>{t.trade_type}</span></p><p className="text-[11px] text-gray-400 mt-1">{Number(t.volume).toLocaleString(undefined,{maximumFractionDigits:4})} lots · {t.is_qualified?'Qualified':'Flagged'}</p></div><div className="text-right shrink-0"><p className="text-[10px] text-gray-500">Net P/L</p><p className={`font-semibold ${Number(t.profit)+Number(t.commission||0)+Number(t.swap||0)>=0?'text-emerald-400':'text-red-400'}`}>{money(Number(t.profit)+Number(t.commission||0)+Number(t.swap||0))}</p></div></div>
        <p className="text-[10px] text-gray-500 mt-2">{time(t.close_time)}</p>
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
          {data.commercial?<span className="text-blue-300">Revenue <strong>{t.generatedRevenue&&!t.generatedRevenue.pending?revenue(t.generatedRevenue.confirmed+t.generatedRevenue.estimated):'Pending'}</strong>{t.generatedRevenue?.estimated>0&&<span className="text-[10px] text-gray-400 ml-1">· Estimated</span>}</span>:<span className="text-gray-500">#{t.ticket}</span>}
          <span className="text-[10px] text-gray-400 flex items-center gap-1">Details <ChevronDown size={13}/></span>
        </div>
      </summary>
      {data.commercial&&<div className="pt-3 text-xs text-blue-300"><p>Generated revenue: {t.generatedRevenue?revenue(t.generatedRevenue.confirmed+t.generatedRevenue.estimated):'Pending'}</p>{t.generatedRevenue&&<p className="text-[11px] text-gray-400 mt-1">{breakdown(t.generatedRevenue)}{t.generatedRevenue.pending?' · Confirmation pending':''}</p>}</div>}
      <p className="text-[10px] text-gray-500 mt-3">Ticket #{t.ticket}</p>
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
