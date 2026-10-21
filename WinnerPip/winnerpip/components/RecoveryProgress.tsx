"use client";
import {useEffect,useState} from 'react';
import {CheckCircle2,Loader2,Clock} from 'lucide-react';
type Progress={visible:boolean;state:string;total:number;checked:number;recovered:number;credentialFailures:number;pending:number;mainPullRunning:boolean};
export default function RecoveryProgress({url,host=false,token}:{url:string;host?:boolean;token?:string|null}){
 const [data,setData]=useState<Progress|null>(null);
 useEffect(()=>{let disposed=false;let timer:ReturnType<typeof setTimeout>;const abort=new AbortController();setData(null);
  const poll=async()=>{try{const r=await fetch(url,{cache:'no-store',signal:abort.signal,headers:token?{Authorization:`Bearer ${token}`}:{}});if(!r.ok)throw Error('Unavailable');const d=await r.json();if(!disposed)setData(d);}catch{if(!disposed)setData(null);}finally{if(!disposed)timer=setTimeout(poll,5000);}};
  void poll();return()=>{disposed=true;abort.abort();clearTimeout(timer);};
 },[url,token]);
 if(!data?.visible || data.state==='complete' || data.state==='idle')return null;
 const complete=data.state==='complete';const running=data.state==='running';
 const title=host?(complete?'Additional checks complete':'Additional checks'):(complete?'Recovery complete':'Recovering failed accounts');
 const percent=complete?100:data.total?Math.min(100,100*data.checked/data.total):0;
 return <section aria-label={title} className="mt-4 mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
  <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className={`flex items-center gap-2 font-semibold ${complete?'text-profit':'text-royal'}`}>{complete?<CheckCircle2 size={15}/>:running?<Loader2 size={15} className="animate-spin"/>:<Clock size={15}/>} {title}</span><span className="text-gray-400">{data.total?`${data.checked} of ${data.total} checked this pass`:`${data.pending} awaiting checks`}</span></div>
  <div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-all ${complete?'bg-profit':'bg-royal'}`} style={{width:`${percent}%`}}/></div>
  <p className="mt-2 text-[11px] text-gray-400" aria-live="polite">{data.recovered} {host?'updated':'recovered'} · {data.pending} {host?'awaiting checks':'retry pending'}{data.credentialFailures>0?` · ${data.credentialFailures} need updated credentials`:''}{running?' · Checking now':data.pending>0?(data.mainPullRunning?' · Continues after the current pull':' · Waiting for the next retry'):''}</p>
 </section>;
}
