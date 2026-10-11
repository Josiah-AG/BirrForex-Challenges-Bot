/** Native broker balance immediately before an entry, reconstructed backwards from
 * the verified snapshot. Includes all cash movements exactly once, never equity. */
export function balancesAtEntry(trades:any[],deals:any[],verifiedBalance:number,verifiedThrough:any):Map<string,number>{
 const cutoff=+new Date(verifiedThrough);
 if(!Number.isFinite(verifiedBalance)||!Number.isFinite(cutoff))throw Error('Risk allowance requires a verified balance snapshot');
 const events=deals.map(d=>{
  const at=+new Date(d.time),values=[d.profit,d.commission??0,d.swap??0,d.fee??0].map(Number);
  if(!Number.isFinite(at)||!values.every(Number.isFinite))throw Error('Invalid risk balance ledger');
  const type=String(d.deal_type).toLowerCase();
  if(['13','14','buy_canceled','sell_canceled'].includes(type))throw Error('Cancelled deal requires broker reconciliation');
  return {...d,at,net:['3','credit'].includes(type)?0:values.reduce((a,b)=>a+b,0)};
 }).filter(d=>d.at<=cutoff).sort((a,b)=>a.at-b.at||Number(a.ticket)-Number(b.ticket));
 const result=new Map<string,number>();
 for(const t of trades){
  const id=String(t.position_id??t.ticket);if(result.has(id))continue;
  const at=+new Date(t.open_time);
  if(!Number.isFinite(at)||at>cutoff)throw Error('Entry lies outside verified risk history');
  const entry=events.find(d=>String(d.position_id)===id&&Number(d.entry)===0);
  // Broker timestamps can have finer precision than the imported trade. Prefer
  // the original opening deal, and order simultaneous movements by deal ticket.
  const entryAt=entry?entry.at:at,entryTicket=entry?Number(entry.ticket):null;
  const after=events.filter(d=>d.at>entryAt||(d.at===entryAt&&(entryTicket===null||Number(d.ticket)>=entryTicket)));
  const balance=verifiedBalance-after.reduce((n,d)=>n+d.net,0);
  if(!Number.isFinite(balance)||balance<=0)throw Error('Non-positive or invalid balance at position entry');
  result.set(id,balance);
 }
 return result;
}
/** A position must be fully closed and every closing part qualified to count once. */
export function qualifiedPositionCounts(trades:any[],qualifiedTickets:Set<string>,deals:any[]){
 const groups=new Map<string,any[]>();
 for(const t of trades){const id=String(t.position_id??t.ticket);groups.set(id,[...(groups.get(id)||[]),t]);}
 let qualified=0,flagged=0;
 for(const [id,parts] of groups){
  const allQualified=parts.every(t=>qualifiedTickets.has(String(t.ticket)));
  if(!allQualified){flagged++;continue;}
  const history=deals.filter(d=>String(d.position_id)===id).sort((a,b)=>+new Date(a.time)-+new Date(b.time)||Number(a.ticket)-Number(b.ticket));
  // Without entry/exit evidence, do not award minimum-trade eligibility.
  if(!history.some(d=>Number(d.entry)===0)||history.some(d=>d.entry==null))continue;
  let remaining=0,valid=true;
  for(const d of history){const v=Number(d.volume),e=Number(d.entry);if(!Number.isFinite(v)||v<0){valid=false;break;}if(e===0)remaining+=v;else if(e===1||e===3)remaining-=v;else if(e===2)remaining=v-remaining;if(remaining< -1e-7)valid=false;}
  if(valid&&Math.abs(remaining)<1e-7)qualified++;
 }
 return {total:groups.size,qualified,flagged};
}
