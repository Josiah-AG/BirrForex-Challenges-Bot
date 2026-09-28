/** Reconcile raw broker cash movements; never infer a deposit from a balance jump. */
export function reconcilePrestart(input: {
  snapshotBalance:number; snapshotAt:string|Date; snapshotUntil?:string|Date; startAt:string|Date;
  verifiedBalance:number; verifiedThrough:string|Date;
  deals:Array<{time:any;deal_type:any;profit:any;commission?:any;swap?:any;fee?:any;comment?:any}>;
}) {
  const snapshot=+new Date(input.snapshotAt), start=+new Date(input.startAt), cutoff=+new Date(input.verifiedThrough);
  if(![snapshot,start,cutoff,input.snapshotBalance,input.verifiedBalance].every(Number.isFinite) || snapshot>=start || cutoff<start)throw Error('Pre-start reconciliation needs verified history through challenge start');
  let total=0,preNet=0,preNonFunding=0;
  const during:Array<{time:number;net:number;trading:number}>=[];
  const until=input.snapshotUntil?+new Date(input.snapshotUntil):snapshot;
  if(!Number.isFinite(until)||until<snapshot||until>=start)throw Error('Invalid pre-start snapshot interval');
  for(const d of input.deals){
    const time=+new Date(d.time);
    if(!Number.isFinite(time))throw Error('Pre-start reconciliation contains an invalid deal time');
    if(time<snapshot || time>cutoff)continue;
    const amounts=[d.profit,d.commission??0,d.swap??0,d.fee??0].map(Number);
    if(!amounts.every(Number.isFinite))throw Error('Pre-start reconciliation contains an invalid cash amount');
    const type=String(d.deal_type).toLowerCase();
    if(['13','14'].includes(type))throw Error('Cancelled deal requires broker reconciliation');
    const net=['3','credit'].includes(type)?0:amounts.reduce((a,b)=>a+b,0);total+=net;
    const cashTransfer=['2','balance'].includes(type) && !/^(DIV)|DIVIDEND|SWAP|BONUS|CREDIT|CORRECTION/i.test(String(d.comment||''));
    const trading=cashTransfer?0:net;
    if(time<=until)during.push({time,net,trading});
    if(time<start){
      preNet+=net;
      preNonFunding+=trading;
    }
  }
  // A verification request spans time: a deal during the request may already be
  // reflected in its balance. Match complete timestamp groups, never guess which
  // account movement was included. Ambiguous economic outcomes stay pending.
  const cents=(v:number)=>Math.round(v*100);
  const candidates:Array<{net:number;trading:number}>=[];
  const matches=(net:number)=>Math.abs(cents(input.snapshotBalance+total-net)-cents(input.verifiedBalance))<=1;
  if(matches(0))candidates.push({net:0,trading:0});
  let prefix=0,tradingPrefix=0;
  const sorted=during.sort((a,b)=>a.time-b.time);
  for(let i=0;i<sorted.length;i++){
    prefix+=sorted[i].net;tradingPrefix+=sorted[i].trading;
    if(i+1<sorted.length&&sorted[i+1].time===sorted[i].time)continue;
    if(matches(prefix))candidates.push({net:prefix,trading:tradingPrefix});
  }
  if(!candidates.length)throw Error('Pre-start balance change is unexplained; recover broker history before evaluation');
  if(candidates.some(c=>cents(c.net)!==cents(candidates[0].net)||cents(c.trading)!==cents(candidates[0].trading)))
    throw Error('Pre-start snapshot overlaps ambiguous activity; review broker history before evaluation');
  preNet-=candidates[0].net;preNonFunding-=candidates[0].trading;
  const actualAtStart=input.snapshotBalance+preNet;
  // Pre-start trading gains and non-funding adjustments are excluded from competition and from the excess-funding test.
  // Losses lower the baseline and can be restored before start without an advantage.
  const competitionBalance=Math.max(0,actualAtStart-Math.max(0,preNonFunding));
  return {actualAtStart,competitionBalance,preNonFunding};
}
