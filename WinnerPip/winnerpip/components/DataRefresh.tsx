"use client";
import {RefreshCw} from 'lucide-react';
export default function DataRefresh({state}:{state:{refresh:()=>void;busy:boolean;updated:Date|null;error:string}}){
 return <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2 border-b border-white/5 text-xs" aria-live="polite">
  <span className={state.error?'text-amber-300':'text-gray-400'}>{state.error || (state.updated?`Updated ${state.updated.toLocaleTimeString()}`:'Waiting for data')}</span>
  <button type="button" onClick={state.refresh} disabled={state.busy} className="inline-flex items-center gap-2 rounded-lg border border-royal/30 bg-royal/10 px-3 py-2 text-royal font-semibold hover:bg-royal/20 disabled:opacity-60"><RefreshCw size={14} className={state.busy?'animate-spin':''}/>{state.busy?'Refreshing…':'Refresh data'}</button>
 </div>;
}
