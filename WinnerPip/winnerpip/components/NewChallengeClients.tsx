'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Users,X} from 'lucide-react';
import {challengeTimestamp} from '@/lib/challengeTime';
export default function NewChallengeClients({challengeId,timezone}:{challengeId:string;timezone:string}){
 const [data,setData]=useState<any>(null),[open,setOpen]=useState(false),[error,setError]=useState(false),[filter,setFilter]=useState<'all'|'demo'|'real'>('all');
 useEffect(()=>{let alive=true;const load=async()=>{try{const r=await fetch(`/api/management/challenge/${challengeId}/new-clients`,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(alive){setData(d);setError(false);}}catch{if(alive)setError(true);}};void load();const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer);};},[challengeId]);
 useEffect(()=>{if(!open)return;const y=window.scrollY,b=document.body,old={position:b.style.position,top:b.style.top,width:b.style.width,overflow:b.style.overflow};Object.assign(b.style,{position:'fixed',top:`-${y}px`,width:'100%',overflow:'hidden'});const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',key);return()=>{Object.assign(b.style,old);window.scrollTo(0,y);document.removeEventListener('keydown',key);};},[open]);
 if(data?.enabled===false)return null;
 const rows=data?.rows||[];
 const demoCount=rows.filter((r:any)=>r.category==='demo').length;
 const realCount=rows.filter((r:any)=>r.category==='real').length;
 const visibleRows=rows.filter((r:any)=>filter==='all'||r.category===filter);
 return <><button onClick={()=>{setFilter('all');setOpen(true);}} className="min-w-0 max-w-full [overflow-wrap:anywhere] glass rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 text-left w-full hover:border-blue-400/50">
 <span className="flex gap-1.5 items-center text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-400 [&>svg]:shrink-0"><Users size={16}/>New Clients from This Challenge</span>
 <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-2"><strong className="text-lg sm:text-2xl md:text-3xl font-bold text-blue-400">{data?.count==null?'—':data.count.toLocaleString()}{data?.periodRegistrations!=null?`/${data.periodRegistrations.toLocaleString()}`:''}</strong><strong className="text-sm sm:text-base text-emerald-400">{data?.conversionPercent==null?'':`${Number(data.conversionPercent).toLocaleString(undefined,{maximumFractionDigits:2})}%`}</strong></span>
 {data?.challengeType==='hybrid'&&data?.count!=null&&<span className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs mt-1"><span className="text-blue-400">Demo: {demoCount}</span><span className="text-red-400">Real: {realCount}</span></span>}

 </button>
 {open&&createPortal(<div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-3" onClick={()=>setOpen(false)}><section role="dialog" aria-modal="true" aria-label="New Clients from This Challenge" className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#101827] p-4 sm:p-6 text-white" onClick={e=>e.stopPropagation()}>
 <div className="flex gap-4 justify-between items-start mb-4"><h2 className="font-semibold">New Clients from This Challenge</h2><button aria-label="Close" onClick={()=>setOpen(false)}><X size={20}/></button></div>
 {data?.periodRegistrations!=null&&<p className="text-sm text-gray-300 mb-3"><strong className="text-blue-400">{data.count}</strong> of {data.periodRegistrations.toLocaleString()} new registrations joined · <strong className="text-emerald-400">{data.conversionPercent==null?'—':`${Number(data.conversionPercent).toLocaleString(undefined,{maximumFractionDigits:2})}%`}</strong></p>}
 {data?.updatedAt&&<p className="text-[10px] text-gray-500 mb-3">Updated {challengeTimestamp(data.updatedAt,timezone,true)}</p>}
 <p className="text-xs text-gray-400 mb-3">Latest client balance ranges · Highest first · Each client counted once</p>
 {data?.notice&&<p className="text-xs text-amber-300 mb-3">{data.notice}</p>}
 {!!data?.unresolved&&<p className="text-xs text-amber-300 mb-3">{data.unresolved} participants awaiting identity or registration-date verification.</p>}
 {(error||data?.error)&&<p className="text-xs text-amber-300 mb-3">Refresh delayed. Any displayed results are from the last successful update.</p>}
 {data?.windowStart&&<p className="text-[11px] text-gray-400 mb-3">Window: {challengeTimestamp(data.windowStart,timezone,true)} → {challengeTimestamp(data.windowEnd,timezone,true)}</p>}
 <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by account type">{(['all','demo','real'] as const).map(value=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)} className={`px-3 py-1.5 rounded-lg text-xs border ${filter===value?'bg-white/10 border-white/30':'border-white/10'} ${value==='demo'?'text-blue-400':value==='real'?'text-red-400':'text-gray-200'}`}>{value==='all'?'All':value==='demo'?'Demo':'Real'} ({value==='all'?rows.length:value==='demo'?demoCount:realCount})</button>)}</div>
 <div className="divide-y divide-white/10">{visibleRows.map((r:any,i:number)=><div key={i} className="py-3 flex justify-between items-start gap-3"><div className="min-w-0"><p className="font-medium text-sm break-words">{r.nickname}</p>{r.email&&<p className="text-xs text-gray-400 break-all">{r.email}</p>}<p className="text-xs text-gray-400 break-words">{r.accounts.join(', ')} · <span className={r.category==='demo'?'text-blue-400':'text-red-400'}>{r.category==='demo'?'Demo':'Real'}</span></p><p className="text-[10px] text-gray-500">Registered {challengeTimestamp(r.registeredAt,timezone,true)}</p></div><strong className="text-emerald-400 text-sm whitespace-nowrap">{r.balanceRange}</strong></div>)}</div>
 {!visibleRows.length&&<p className="text-sm text-gray-400 py-8">{data?.count!=null?'No confirmed new clients for this filter.':'Awaiting report data.'}</p>}
 {data?.nextRefreshAt&&<p className="text-[10px] text-gray-500 mt-4">Next update: {challengeTimestamp(data.nextRefreshAt,timezone,true)}</p>}
 </section></div>,document.body)}</>;
}
