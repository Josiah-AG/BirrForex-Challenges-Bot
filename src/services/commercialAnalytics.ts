import {db} from '../database/db';
import {ExnessService} from './exnessService';
import {commercialCutoff, commercialSummary, eligibleCommercialOrder, historicalRate, normalizeCommercialAccount as account, normalizedTradeLots} from '../utils/commercialMetrics';

// Host capability intentionally not exposed by any host route. Reusable service is admin-only today.
export const HOST_COMMERCIAL_ENABLED = false;
const day = (time: number) => new Date(time).toISOString().slice(0,10);
const cleanError = (e:any) => String(e?.message || 'Commercial refresh failed').slice(0,200);
const queue = new Set<number>(); let draining = false;
export async function captureCommercialCoverage(registrationId:number, cutoff:string) {
  await db.query(`INSERT INTO wp_commercial_coverage(registration_id,challenge_id,cutoff,trades)
    SELECT r.id,r.challenge_id,$2::timestamptz,COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'ticket',t.ticket::text,'symbol',t.symbol,'volume',t.volume,'close_time',t.close_time))
      FROM wp_trades t WHERE t.registration_id=r.id AND t.close_time<=($2::timestamptz AT TIME ZONE 'UTC')),'[]')
    FROM trading_registrations r WHERE r.id=$1 AND r.account_type='real'
    ON CONFLICT(registration_id) DO UPDATE SET cutoff=EXCLUDED.cutoff,trades=EXCLUDED.trades,captured_at=NOW()
    WHERE wp_commercial_coverage.cutoff<=EXCLUDED.cutoff`,[registrationId,cutoff]);
}
async function pages(b:ExnessService,path:string,params:any) {
  const result:any[]=[];
  for(let offset=0;offset<200000;offset+=1000) {
    const data=await b.commercialReport(path,{...params,limit:1000,offset});
    if(!Array.isArray(data?.data))throw new Error('Exness report has no transaction data');
    result.push(...data.data);
    const count=Number(data.totals?.count ?? data.meta?.count);
    if(!Number.isFinite(count))throw new Error('Exness report has no pagination total');
    if(result.length>=count)return result;
    if(!data.data.length)throw new Error('Exness pagination incomplete');
  }
  throw new Error('Exness report too large; refresh incomplete');
}
async function accountReport(b:ExnessService,field:string,values:string[]) {
  const result:any[]=[];
  const unique=[...new Set(values.filter(Boolean))];
  for(let i=0;i<unique.length;i+=100) {
    const batch=unique.slice(i,i+100);
    const rows=await pages(b,'/api/reports/clients/accounts/',{[field]:batch.join(',')});
    if(rows.some(r=>!batch.includes(String(r[field]))))throw new Error('Exness account filter mismatch');
    result.push(...rows);
  }
  return result;
}
function rewardKey(o:any) {return [o.client_account,o.order_id,o.partner_account].join('|');}
function publicTrade(o:any) {return {key:rewardKey(o),activityKey:[o.client_account,o.order_id].join('|'),ticket:String(o.order_id).split(':').pop(),account:o.client_account,
  symbol:o.symbol,lots:Number(o.volume_lots),volumeUSD:Number(o.volume_mln_usd)*1e6,revenue:Number(o.reward_usd),
  state:'confirmed',closeTime:o.close_date,method:'Exness confirmed reward'};}

export async function refreshCommercial(challengeId:number, full=false) {
  const lease=await db.getClient();let locked=false;
  try {
    locked=(await lease.query('SELECT pg_try_advisory_lock(26101010,$1) locked',[challengeId])).rows[0].locked;
    if(!locked)return;
    const c=(await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId])).rows[0];
    if(!c || !['real','hybrid'].includes(c.type) || c.status==='deleted')return;
    await db.query(`INSERT INTO wp_commercial_reports(challenge_id,started_at) VALUES($1,NOW())
      ON CONFLICT(challenge_id) DO UPDATE SET started_at=NOW(),error=NULL`,[challengeId]);
    const {brokerForChallenge}=await import('./partnerScreening');
    const b=await brokerForChallenge(c);if(!b)throw new Error('Challenge Exness integration unavailable');
    const scope=b.commercialScope();const now=Date.now(),start=+new Date(c.start_date),end=+new Date(c.end_date);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new Error('Invalid challenge dates');
    const completed=['completed','reviewing','submission_open'].includes(c.status) || now>=end;
    const regs=(await db.query(`SELECT r.id,r.nickname,r.username,r.account_number,r.client_uid,r.is_cent,r.account_subtype,
      r.disqualified,r.last_known_balance,r.history_verified_through,r.history_sync_state,
      l.rank,l.zero_balance_at FROM trading_registrations r LEFT JOIN wp_leaderboard l
      ON l.registration_id=r.id AND l.challenge_id=r.challenge_id
      WHERE r.challenge_id=$1 AND r.account_type='real' AND r.status IS DISTINCT FROM 'removed'`,[challengeId])).rows;
    const warnings:string[]=[];
    const valid=regs.filter(r=>/^\d+$/.test(account(r.account_number)));
    if(valid.length!==regs.length)warnings.push(`${regs.length-valid.length} registrations have invalid account identifiers.`);
    const exact=await accountReport(b,'client_account',valid.map(r=>account(r.account_number)));
    for(const r of valid) {
      const owners=[...new Set(exact.filter(a=>a.client_account===account(r.account_number)).map(a=>a.client_uid))];
      if(owners.length>1)throw new Error('Ambiguous account owner in Exness report');
      r.resolvedUid=owners[0] || r.client_uid || null;
      r.directoryFound=owners.length===1;
    }
    const directory=await accountReport(b,'client_uid',valid.map(r=>r.resolvedUid).filter(Boolean));
    // Unspecified platform is verified against the MT5 server prefix on each transaction.
    const linked=directory.filter(a=>a.platform==='mt5'||a.platform==null);
    const accounts=[...new Set([...valid.map(r=>account(r.account_number)),...linked.map(a=>String(a.client_account))])];
    const prior=(await db.query('SELECT scope,scanned_through,account_ids FROM wp_commercial_reports WHERE challenge_id=$1',[challengeId])).rows[0];
    const newAccounts=accounts.some(a=>!prior?.account_ids?.includes(a));
    const scanStart=!full&&!newAccounts&&prior?.scope===scope&&prior.scanned_through
      ? Math.max(start,+new Date(prior.scanned_through)-3*86400000) : start;
    let cursor=Date.parse(day(scanStart));const scanEnd=Date.parse(day(now));
    while(cursor<=scanEnd) {
      const until=Math.min(scanEnd,cursor+30*86400000);
      for(let i=0;i<accounts.length;i+=150) {
        const batch=accounts.slice(i,i+150);
        const orders=await pages(b,'/api/reports/orders/',{client_account:batch.join(','),date_from:day(cursor),date_to:day(until)});
        if(orders.some(o=>!batch.includes(String(o.client_account))))throw new Error('Exness transaction filter mismatch');
        const inside=orders.filter(o=>String(o.order_id).startsWith('mt5')&&eligibleCommercialOrder(o,start,Math.min(now,end)));
        if(inside.some(o=>![o.volume_lots,o.volume_mln_usd,o.reward_usd].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)))))throw new Error('Invalid numeric Exness report');
        for(let j=0;j<inside.length;j+=500) {
          const rows=inside.slice(j,j+500).map(o=>({account:String(o.client_account),order_id:String(o.order_id),partner_account:String(o.partner_account),data:o}));
          // One reward record per server/order/partner; confirmation replaces previous values.
          const dedup=[...new Map(rows.map(r=>[[r.account,r.order_id,r.partner_account].join('|'),r])).values()];
          await db.query(`INSERT INTO wp_commercial_orders(challenge_id,scope,account,order_id,partner_account,data)
            SELECT $1,$2,x.account,x.order_id,x.partner_account,x.data FROM jsonb_to_recordset($3::jsonb)
            AS x(account text,order_id text,partner_account text,data jsonb)
            ON CONFLICT(challenge_id,scope,account,order_id,partner_account) DO UPDATE SET data=EXCLUDED.data`,[challengeId,scope,JSON.stringify(dedup)]);
        }
      }
      cursor=until+86400000;
    }
    const allOrders=(await db.query('SELECT data FROM wp_commercial_orders WHERE challenge_id=$1 AND scope=$2',[challengeId,scope])).rows.map(r=>r.data);
    // Bootstrap coverage only from verified history, never from a batch's completed label.
    const existing=(await db.query('SELECT * FROM wp_commercial_coverage WHERE challenge_id=$1',[challengeId])).rows;
    for(const r of valid) if(!existing.some(x=>x.registration_id===r.id)&&r.history_sync_state==='verified'&&r.history_verified_through)
      await captureCommercialCoverage(r.id,new Date(r.history_verified_through).toISOString());
    const coverage=(await db.query('SELECT * FROM wp_commercial_coverage WHERE challenge_id=$1',[challengeId])).rows;
    const raw=(await db.query(`SELECT registration_id,ticket::text,symbol,volume,close_time FROM wp_trades WHERE challenge_id=$1
      AND close_time>=$2 AND close_time<=$3 AND registration_id=ANY($4::int[])`,[challengeId,c.start_date,c.end_date,valid.map(r=>r.id)])).rows;
    const rows:any[]=[];const totalChallenge=new Map<string,any>(),totalAll=new Map<string,any>();
    for(const r of valid) {
      const number=account(r.account_number);const frozen=coverage.find(x=>x.registration_id===r.id);
      const independent=Boolean(r.disqualified||r.zero_balance_at||(r.last_known_balance!=null&&Number(r.last_known_balance)<=0));
      const cutoff=commercialCutoff(c.start_date,c.end_date,now,frozen?.cutoff,independent,completed);
      const source=completed?raw.filter(t=>t.registration_id===r.id):(frozen?.trades||[]);
      const tickets=new Set(source.map((t:any)=>String(t.ticket)));
      const linkedAccounts=new Set([number,...linked.filter(a=>a.client_uid===r.resolvedUid).map(a=>String(a.client_account))]);
      const confirmed=allOrders.filter(o=>linkedAccounts.has(o.client_account)&&eligibleCommercialOrder(o,start,cutoff)
        &&(o.client_account!==number||completed||independent||tickets.has(String(o.order_id).split(':').pop())));
      const challengeTrades=confirmed.filter(o=>o.client_account===number).map(publicTrade);
      const type=exact.find(a=>a.client_account===number)?.client_account_type;
      for(const t of source) {
        if(!eligibleCommercialOrder({close_date:t.close_time},start,cutoff))continue;
        if(challengeTrades.some(x=>x.ticket===String(t.ticket)))continue;
        const lots=normalizedTradeLots(t.volume,type?type==='Standard Cent':Boolean(r.is_cent));
        const rate=type?historicalRate(allOrders,number,t.symbol,type,+new Date(t.close_time)):null;
        const estimated=rate!==null&&Number.isFinite(lots)&&lots>0;
        challengeTrades.push({key:`pull|${number}|${t.ticket}`,activityKey:`pull|${number}|${t.ticket}`,ticket:String(t.ticket),account:number,symbol:t.symbol,lots,
          volumeUSD:null as any,revenue:estimated?Math.round(lots*rate!*1e8)/1e8:0,state:estimated?'estimated':'pending',
          closeTime:t.close_time,method:estimated?'Recent confirmed rate for this account and instrument':'Awaiting Exness reward or supported rate'});
      }
      const allTrades=[...confirmed.filter(o=>o.client_account!==number).map(publicTrade),...challengeTrades];
      for(const t of challengeTrades)totalChallenge.set(t.key,t);
      for(const t of allTrades)totalAll.set(t.key,t);
      const issues:string[]=[];
      if(!r.directoryFound)issues.push('Account not found in current Exness directory');
      if(!r.resolvedUid)issues.push('Linked-account identity unavailable');
      if(cutoff===null)issues.push('Awaiting verified pull coverage');
      rows.push({registrationId:r.id,nickname:r.nickname||r.username||`Account ${number}`,account:number,rank:r.rank||null,
        status:r.disqualified?'Disqualified':independent?'Blown / zero balance':'Active',cutoff:cutoff===null?null:new Date(cutoff).toISOString(),
        coverageSource:independent?'Exness':completed?'Historical Exness':'Verified pull',linkedAccounts:linkedAccounts.size,
        challenge:commercialSummary(challengeTrades),all:commercialSummary(allTrades),issues,trades:challengeTrades});
    }
    const report={enabled:true,challengeId,timezone:c.timezone||'Africa/Nairobi',periodStart:c.start_date,periodEnd:c.end_date,
      updatedAt:new Date(now).toISOString(),nextRefreshAt:new Date(now+3600000).toISOString(),
      challenge:commercialSummary([...totalChallenge.values()]),all:commercialSummary([...totalAll.values()]),rows,
      warnings:[...warnings,...(rows.some(r=>r.issues.length)?['Some participants have incomplete account coverage; see participant details.']:[])],
      notice:'All-account totals include challenge accounts. Other-account activity is limited to available Exness MT5 reports; unreported transactions may be missing. Top instrument is by normalized lots. Estimates use recent confirmed same-account/instrument rates, not guaranteed commission. Revenues include disqualified and blown accounts.'};
    await db.query(`UPDATE wp_commercial_reports SET scope=$2,report=$3,scanned_through=$4,account_ids=$5,updated_at=NOW(),started_at=NULL,error=NULL WHERE challenge_id=$1`,[challengeId,scope,JSON.stringify(report),new Date(now).toISOString(),accounts]);
  } catch(e:any) {
    if(locked)await db.query('UPDATE wp_commercial_reports SET error=$2,started_at=NULL WHERE challenge_id=$1',[challengeId,cleanError(e)]);
    console.error('[commercial]',challengeId,cleanError(e));
  } finally {if(locked)await lease.query('SELECT pg_advisory_unlock(26101010,$1)',[challengeId]);lease.release();}
}
export function queueCommercial(id:number) {queue.add(id);void drain();}
async function drain() {
  if(draining)return;draining=true;
  try{while(queue.size){const id=queue.values().next().value as number;queue.delete(id);await refreshCommercial(id);}}
  finally{draining=false;}
}
export async function readCommercial(id:number) {
  const c=(await db.query('SELECT type,status FROM trading_challenges WHERE id=$1',[id])).rows[0];
  if(!c)return null;
  if(c.type==='demo'||c.status==='deleted')return {enabled:false};
  const row=(await db.query(`SELECT CASE WHEN report IS NULL THEN NULL ELSE (report - 'rows') ||
    jsonb_build_object('rows',COALESCE((SELECT jsonb_agg(r - 'trades') FROM jsonb_array_elements(report->'rows') r),'[]')) END AS report,
    updated_at,started_at,error FROM wp_commercial_reports WHERE challenge_id=$1`,[id])).rows[0];
  return {...(row?.report||{enabled:true,rows:[]}),refreshing:queue.has(id)||Boolean(row?.started_at),error:row?.error||null,hasData:Boolean(row?.report)};
}
export async function readCommercialTrades(challengeId:number,registrationId:number) {
  const row=(await db.query(`SELECT r->'trades' AS trades FROM wp_commercial_reports c
    CROSS JOIN LATERAL jsonb_array_elements(c.report->'rows') r
    WHERE c.challenge_id=$1 AND r->>'registrationId'=$2`,[challengeId,String(registrationId)])).rows[0];
  return row?.trades || [];
}
export function startCommercialScheduler() {
  const run=async()=>{try{const cs=await db.query(`SELECT id FROM trading_challenges WHERE type IN('real','hybrid') AND status IN('active','completed','reviewing','submission_open') ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,id DESC`);for(const c of cs.rows)queueCommercial(c.id);}catch{console.error('[commercial] schedule unavailable');}};
  setTimeout(()=>void run(),15000).unref();setInterval(()=>void run(),3600000).unref();
}
