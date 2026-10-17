'use client';
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Users,X} from 'lucide-react';
import {challengeTimestamp} from '@/lib/challengeTime';
export default function NewChallengeClients({challengeId,timezone}:{challengeId:string;timezone:string}){
 const [data,setData]=useState<any>(null),[open,setOpen]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let alive=true;const load=async()=>{try{const r=await fetch(`/api/management/challenge/${challengeId}/new-clients`,{cache:'no-store'});if(!r.ok)throw Error();const d=await r.json();if(alive){setData(d);setError(false);}}catch{if(alive)setError(true);}};void load();const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer);};},[challengeId]);
 useEffect(()=>{if(!open)return;const y=window.scrollY,b=document.body,old={position:b.style.position,top:b.style.top,width:b.style.width,overflow:b.style.overflow};Object.assign(b.style,{position:'fixed',top:`-${y}px`,width:'100%',overflow:'hidden'});const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',key);return()=>{Object.assign(b.style,old);window.scrollTo(0,y);document.removeEventListener('keydown',key);};},[open]);
 if(data?.enabled===false)return null;
 return <><button onClick={()=>setOpen(true)} className="glass rounded-2xl border border-white/10 p-4 mb-6 text-left w-full sm:max-w-sm hover:border-blue-400/50">
 <span className="flex gap-2 items-center text-xs text-gray-400"><Users size={16}/>New Clients from This Challenge</span>
 <strong className="block text-3xl text-blue-400 mt-2">{data?.count==null?'—':data.count.toLocaleString()}</strong>
 <span className="block text-xs text-gray-400 mt-1">{error||data?.error?'Update delayed':data?.historical?'Historical partial':data?.partial?'Partially verified':'New registrations who joined this challenge'}</span>
 {data?.updatedAt&&<span className="block text-[10px] text-gray-500 mt-2">Updated {challengeTimestamp(data.updatedAt,timezone,true)}</span>}
 </button>
 {open&&createPortal(<div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-3" onClick={()=>setOpen(false)}><section role="dialog" aria-modal="true" aria-label="New Clients from This Challenge" className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#101827] p-4 sm:p-6 text-white" onClick={e=>e.stopPropagation()}>
 <div className="flex gap-4 justify-between items-start mb-4"><h2 className="font-semibold">New Clients from This Challenge</h2><button aria-label="Close" onClick={()=>setOpen(false)}><X size={20}/></button></div>
 <p className="text-xs text-gray-400 mb-3">Latest client balance ranges · Highest first · Each client counted once</p>
 {data?.notice&&<p className="text-xs text-amber-300 mb-3">{data.notice}</p>}
 {!!data?.unresolved&&<p className="text-xs text-amber-300 mb-3">{data.unresolved} participants awaiting identity or registration-date verification.</p>}
 {(error||data?.error)&&<p className="text-xs text-amber-300 mb-3">Refresh delayed. Any displayed results are from the last successful update.</p>}
 {data?.windowStart&&<p className="text-[11px] text-gray-400 mb-3">Window: {challengeTimestamp(data.windowStart,timezone,true)} → {challengeTimestamp(data.windowEnd,timezone,true)}</p>}
 <div className="divide-y divide-white/10">{(data?.rows||[]).map((r:any,i:number)=><div key={i} className="py-3 flex justify-between items-start gap-3"><div className="min-w-0"><p className="font-medium text-sm break-words">{r.nickname}</p><p className="text-xs text-gray-400 break-words">{r.accounts.join(', ')} · {r.category}</p><p className="text-[10px] text-gray-500">Registered {challengeTimestamp(r.registeredAt,timezone,true)}</p></div><strong className="text-emerald-400 text-sm whitespace-nowrap">{r.balanceRange}</strong></div>)}</div>
 {!data?.rows?.length&&<p className="text-sm text-gray-400 py-8">{data?.count===0?'No confirmed new clients in this window.':'Awaiting report data.'}</p>}
 {data?.nextRefreshAt&&<p className="text-[10px] text-gray-500 mt-4">Next update: {challengeTimestamp(data.nextRefreshAt,timezone,true)}</p>}
 </section></div>,document.body)}</>;
}
