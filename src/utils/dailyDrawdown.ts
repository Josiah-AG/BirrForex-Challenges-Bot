import {getLocalTime,formatTimeInTimezone} from './timezone';
/** Realized P/L ledger in native account units. Cash transfers change balance but are not trading losses. */
export function dailyDrawdown(trades:any[],operations:any[],startingBalance:number,timezone:string,fixedCap:number|null,percent:number|null){
 const flagged=new Set<number>(),breaches=new Map<string,{time:string;cap:number}>();
 const costs=new Set(['dividend','commission','fee','interest','tax','swap']);
 const events=[...trades.map(t=>({at:+new Date(t.close_time),ticket:Number(t.ticket),trade:true,amount:Number(t.profit)+Number(t.commission||0)+Number(t.swap||0),counts:true})),
 ...operations.map(o=>({at:+new Date(o.op_time),ticket:Number(o.deal_ticket||0),trade:false,amount:Number(o.amount),counts:costs.has(o.op_type)}))].sort((a,b)=>a.at-b.at||a.ticket-b.ticket);
 let balance=startingBalance,day='',net=0,cap=0;
 for(const e of events){
  if(!Number.isFinite(e.at)||!Number.isFinite(e.amount))throw new Error('Invalid realized drawdown ledger');
  const date=getLocalTime(new Date(e.at),timezone).dateStr;
  if(date!==day){day=date;net=0;cap=percent!==null?balance*percent/100:Number(fixedCap||0);}
  balance+=e.amount;
  if(e.counts)net+=e.amount;
  if(cap>0 && -net>=cap && !breaches.has(day))breaches.set(day,{time:formatTimeInTimezone(new Date(e.at),timezone),cap});
  if(e.trade && e.amount>0 && breaches.has(day))flagged.add(e.ticket);
 }
 return {flagged,breaches};
}
