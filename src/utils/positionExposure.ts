/** Reconstruct peak lots from actual MT5 position entry/exit deals (0=in, 1=out, 2=in/out). */
export function peakPositionVolume(deals: any[]): number | null {
  if(!deals.length || deals.some(d=>d.entry==null) || !deals.some(d=>Number(d.entry)===0))return null;
  let exposure=0,peak=0;
  const ordered=deals.slice().sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime() || Number(a.ticket)-Number(b.ticket));
  for(const deal of ordered){
    const volume=Number(deal.volume),entry=Number(deal.entry);
    if(!Number.isFinite(volume) || volume<0)return null;
    if(entry===0)exposure+=volume;
    else if(entry===1 || entry===3)exposure-=volume;
    else if(entry===2)exposure=volume-exposure;
    else continue;
    if(exposure< -1e-7)return null; // Incomplete entry history; do not invent exposure.
    peak=Math.max(peak,exposure);
  }
  return Math.round(peak*1e8)/1e8;
}
