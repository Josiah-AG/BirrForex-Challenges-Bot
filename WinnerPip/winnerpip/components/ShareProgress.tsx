"use client";
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Share2,Instagram} from 'lucide-react';
type Props={challenge:{id:number;title:string;status:string;timezone?:string};stats:{nickname:string;accountType:string;rank:number|null;qualifiedProfit:number;qualifiedTrades:number;totalTrades:number;lastUpdated:string|null;disqualified:boolean};growth:number;growthMode:boolean;isCent:boolean;host:{hostId?:number;hostDisplayName?:string}|null;beforeStart?:boolean};
export default function ShareProgress({challenge,stats,growth,growthMode,isCent,host,beforeStart=false}:Props){
 const [open,setOpen]=useState(false),[hideMoney,setHideMoney]=useState(false),[url,setUrl]=useState(''),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const label=beforeStart?'Share my participation':challenge.status==='completed'?'Share my result':'Share my progress';
 const link=`https://winnerpip.com/challenge/${challenge.id}`;
 const caption=`${beforeStart?"I’m participating in":"Follow my progress in"} ${challenge.title} on WinnerPip!\nSee the challenge and standings: ${link}\n#winnerpip`;
 useEffect(()=>{if(!open)return;const y=window.scrollY;const body=document.body;const old={position:body.style.position,top:body.style.top,width:body.style.width,overflow:body.style.overflow};Object.assign(body.style,{position:'fixed',top:`-${y}px`,width:'100%',overflow:'hidden'});const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('keydown',key);return()=>{Object.assign(body.style,old);window.scrollTo(0,y);document.removeEventListener('keydown',key)}},[open]);
 useEffect(()=>{
  if(!open||!host)return;let cancelled=false,objectUrl='';setFile(null);setUrl('');setError('');
  (async()=>{
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');if(!c)throw Error('Image creation is unavailable');
   const gradient=c.createLinearGradient(0,0,1080,1350);gradient.addColorStop(0,'#142c4b');gradient.addColorStop(1,'#080f20');c.fillStyle=gradient;c.fillRect(0,0,1080,1350);
   const text=(value:string,x:number,y:number,size:number,color='#eff4ff',bold=false,max=936)=>{c.font=`${bold?700:400} ${size}px Arial`;while(c.measureText(value).width>max&&size>16){size--;c.font=`${bold?700:400} ${size}px Arial`}c.fillStyle=color;c.fillText(value,x,y,max)};
   const logo=async(src:string,x:number,size=90)=>{const img=new Image();img.src=src;await img.decode();const scale=Math.min(size/img.width,size/img.height);c.drawImage(img,x,65,img.width*scale,img.height*scale)};
   if(!host.hostId)await logo('/birrforex-logo.png',72);await logo('/share-winnerpip.png',host.hostId?72:190,110);text('WinnerPip',host.hostId?205:325,125,36,'#fff',true,500);
   text(host.hostId?(host.hostDisplayName||'Independent host'):'BirrForex',72,235,23,'#82baff',false);
   text(challenge.title,72,307,64,'#fff',true);text(`${stats.nickname} · ${stats.accountType==='real'?'Real':'Demo'} account`,72,363,30,'#abb9cd');
   const state=stats.disqualified?'Disqualified':beforeStart?'Registered':challenge.status==='active'?'In progress':challenge.status==='completed'?'Completed':'Awaiting final results';
   text(state.toUpperCase(),72,436,24,'#d4b777',true);
   if(beforeStart){text('I’m taking',72,600,92,'#fff',true);text('the challenge.',72,708,92,'#66e0b6',true);text('Follow my journey on WinnerPip.',72,805,32,'#b7c7dc');}
   else{
    text(growthMode?'QUALIFIED ACCOUNT GROWTH':hideMoney?'MY CHALLENGE PROGRESS':'QUALIFIED PROFIT',72,520,23,'#aabbd2');
    const profit=stats.qualifiedProfit/(isCent?100:1);const primary=growthMode?(Number.isFinite(growth)?`${growth>=0?'+':''}${growth.toFixed(2)}%`:'—'):hideMoney?`${stats.qualifiedTrades} qualified trades`:`${profit>=0?'+':'−'}$${Math.abs(profit).toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2})}`;
    text(primary,72,650,112,(growthMode?growth:profit)>=0?'#66e0b6':'#ff7c8b',true);
    if(growthMode&&!hideMoney)text(`Qualified profit: ${profit<0?'−':''}$${Math.abs(profit).toFixed(2)} USD`,72,705,29,'#acbdd3');
    c.fillStyle='#ffffff0a';c.fillRect(72,770,936,180);text('RANK',102,818,21,'#aabbd2');text(!stats.disqualified&&stats.rank?`#${stats.rank}`:'—',102,900,67,'#ffdb90',true,370);text('QUALIFIED TRADES',570,818,21,'#aabbd2');text(String(stats.qualifiedTrades),570,900,67,'#fff',true,400);
   }
   c.fillStyle='#ffffff22';c.fillRect(72,1020,936,1);text('Follow my challenge.',72,1085,28,'#fff',true);text('winnerpip.com',72,1135,34,'#82baff',true);text('See the standings. Find your next challenge.',72,1175,20,'#aabbd2');
   const stamp=stats.lastUpdated?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:challenge.timezone||'UTC'}).format(new Date(stats.lastUpdated)):'No evaluated trades yet';
   text(beforeStart?'Registration snapshot':`Stats updated: ${stamp} · ${challenge.timezone||'UTC'}`,72,1255,17,'#889bb5');text('Snapshot of challenge progress · Not a winner announcement',72,1285,17,'#889bb5');
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not create image')),'image/png'));if(cancelled)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);setFile(new File([blob],'winnerpip-progress.png',{type:'image/png'}));
  })().catch(()=>{if(!cancelled)setError('Could not prepare your image. Close and try again.');});return()=>{cancelled=true;if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[open,hideMoney,challenge,stats,growth,growthMode,isCent,host,beforeStart]);
 async function share(){if(!file)return;try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:challenge.title,text:caption});}else setNotice('Use Save image, then upload it in your social app. You can also copy the caption.');}catch(e){if((e as Error).name!=='AbortError')setNotice('Sharing was unavailable. Save the image and upload it in your social app.');}}
 return <><div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 mb-4 min-w-0">
 <button disabled={!host} onClick={()=>{setOpen(true);setNotice('')}} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500/15 border border-blue-400/25 px-3 py-2.5 text-xs sm:text-sm font-semibold text-blue-300 hover:bg-blue-500/25 disabled:opacity-50 min-w-0"><Share2 size={16} className="shrink-0"/><span>{label}</span></button>
 <div className="flex items-center gap-3 text-gray-400 shrink-0" aria-label="Photo cards for Instagram and TikTok"><Instagram size={20} aria-label="Instagram"/><svg role="img" aria-label="TikTok" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.7 1h-3.6v14.5a3.1 3.1 0 1 1-2.7-3.1V8.8a6.7 6.7 0 1 0 6.3 6.7V8.1a9 9 0 0 0 5.3 1.7V6.2a5.4 5.4 0 0 1-5.3-5.2Z"/></svg></div>
 </div>{open&&createPortal(<div className="fixed inset-0 z-[200] bg-black/80 flex justify-center items-center p-3" onClick={()=>setOpen(false)}><section role="dialog" aria-modal="true" aria-label="Share your progress" className="w-full max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain rounded-2xl bg-[#101827] p-4" onClick={e=>e.stopPropagation()}><div className="flex justify-between items-center mb-3"><h2 className="font-semibold">{label}</h2><button aria-label="Close share preview" onClick={()=>setOpen(false)}>✕</button></div><p className="text-xs text-gray-400 mb-3">Photo post · 1080 × 1350 · Instagram & TikTok</p><label className="flex gap-2 text-sm mb-3"><input type="checkbox" checked={hideMoney} onChange={e=>setHideMoney(e.target.checked)}/>Hide money amounts</label>{url?<img src={url} alt="Your WinnerPip share card" className="w-full rounded-xl"/>:<p className="p-8 text-sm">{error||'Preparing your image…'}</p>}<div className="flex flex-wrap gap-2 mt-4"><button disabled={!file} onClick={share} className="bg-blue-600 rounded-lg px-4 py-2 disabled:opacity-40">Share</button>{url&&<a href={url} download="winnerpip-progress.png" className="border border-white/20 rounded-lg px-4 py-2">Save image</a>}<button onClick={async()=>{try{await navigator.clipboard.writeText(caption);setNotice('Caption and challenge link copied.')}catch{setNotice(caption)}}} className="border border-white/20 rounded-lg px-4 py-2">Copy caption</button></div>{notice&&<p className="text-sm text-blue-200 mt-3 whitespace-pre-line">{notice}</p>}</section></div>,document.body)}</>;
}
