"use client";
import {useCallback,useEffect,useRef,useState} from 'react';

// A response belongs to the challenge/tab that requested it, never the next selection.
export function useDataRefresh(scope:string, enabled:boolean, auto=true) {
  const current=useRef(scope);current.current=scope;
  const sequence=useRef(new Map<string,number>());
  const mounted=useRef(true);
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(0);
  const [updated,setUpdated]=useState<Date|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setUpdated(null);setError('');},[scope]);
  const refresh=useCallback(()=>{setError('');setRevision(n=>n+1);window.dispatchEvent(new Event("winnerpip:refresh"));},[]);
  useEffect(()=>{
    if(!enabled || !auto)return;
    const reload=()=>{if(document.visibilityState==='visible')refresh();};
    const timer=setInterval(reload,30000);
    window.addEventListener('focus',reload);document.addEventListener('visibilitychange',reload);
    return()=>{clearInterval(timer);window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',reload);};
  },[enabled,auto,refresh]);
  const scopedFetch=useCallback(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const key=String(input),read=!init?.method || init.method==='GET';
    const serial=(sequence.current.get(key)||0)+1;sequence.current.set(key,serial);
    const valid=()=>mounted.current && current.current===scope && (!read || sequence.current.get(key)===serial);
    const controller = read && !init?.signal ? new AbortController() : null;
    const timeout = controller ? setTimeout(()=>controller.abort(),20000) : null;
    if(mounted.current)setBusy(n=>n+1);
    try {
      const response=await globalThis.fetch(input,{...init,...(controller?{signal:controller.signal}:{}),...(read?{cache:'no-store' as RequestCache}:{})});
      const json=response.json.bind(response);
      response.json=async()=>{const data=await json();if(!valid())throw new DOMException('Outdated response','AbortError');return data;};
      if(!valid())throw new DOMException('Outdated response','AbortError');
      if(response.ok){setUpdated(new Date());}else if(read)setError('Some data could not be refreshed. Please retry.');
      return response;
    }catch(e){if(valid() && ((e as Error).name!=='AbortError' || controller?.signal.aborted))setError('Connection problem. Please retry.');throw e;}
    finally{if(timeout)clearTimeout(timeout);if(mounted.current)setBusy(n=>Math.max(0,n-1));}
  },[scope]);
  return {fetch:scopedFetch,revision,refresh,busy:busy>0,updated,error};
}
