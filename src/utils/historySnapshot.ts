/** Protocol validation is independent of HTTP status or a worker's success flag. */
export function validateHistorySnapshot(data: any, account: string, server: string, requestId: string) {
  if (!data?.success || data.protocol_version !== 2 || data.complete !== true)
    throw new Error(data?.message || 'Worker has not returned verified history protocol 2');
  if (String(data.account) !== String(account).replace(/[^0-9]/g, '') || String(data.server).toLowerCase() !== server.toLowerCase())
    throw new Error('Snapshot account identity mismatch');
  if (data.request_id !== requestId) throw new Error('Snapshot request identity mismatch');
  for (const field of ['balance','equity','ledger_expected','ledger_tolerance']) {
    if (typeof data[field] !== 'number' || !Number.isFinite(data[field])) throw new Error(`Invalid snapshot ${field}`);
  }
  if (data.ledger_tolerance <= 0 || data.ledger_tolerance > 1 || Math.abs(data.balance-data.ledger_expected)>data.ledger_tolerance+1e-8)
    throw new Error('Snapshot ledger does not reconcile');
  const cutoff = new Date(data.source_cutoff).getTime();
  if (!Number.isFinite(cutoff) || cutoff > Date.now()+60000) throw new Error('Invalid source cutoff');
  if (!Array.isArray(data.trades) || !Array.isArray(data.deals) || !Array.isArray(data.balance_ops) || !Array.isArray(data.closing_tickets))
    throw new Error('Incomplete history response');
  for (const d of data.deals) {
    if (!Number.isSafeInteger(d.ticket) || d.ticket <= 0 || !Number.isFinite(Date.parse(d.time))) throw new Error('Invalid raw deal identity/time');
    for (const key of ['profit','commission','swap','fee','volume','price'])
      if (typeof d[key] !== 'number' || !Number.isFinite(d[key])) throw new Error(`Invalid raw deal ${key}`);
  }
  for (const op of data.balance_ops) {
    if (!Number.isSafeInteger(op.ticket) || op.ticket <= 0 || !Number.isFinite(Date.parse(op.time)) || Date.parse(op.time)>cutoff
      || typeof op.amount !== 'number' || !Number.isFinite(op.amount) || !['deposit','withdrawal','adjustment'].includes(op.op_type)) throw new Error('Invalid balance operation');
  }
  const tickets=data.trades.map((t:any)=>String(t.ticket)).sort();
  if (new Set(tickets).size!==tickets.length || JSON.stringify(tickets)!==JSON.stringify(data.closing_tickets.map(String).sort()))
    throw new Error('Closing ticket manifest mismatch');
  const deals=new Map(data.deals.map((d:any)=>[String(d.ticket),d]));
  if(deals.size!==data.deals.length)throw new Error('Duplicate raw deal tickets');
  for(const t of data.trades){
    if(!deals.has(String(t.ticket)))throw new Error('Closing deal missing from raw history');
    if(!t.open_time || !t.close_time || !Number.isFinite(Date.parse(t.open_time)) || !Number.isFinite(Date.parse(t.close_time)) || Date.parse(t.open_time)>Date.parse(t.close_time) || Date.parse(t.close_time)>cutoff)
      throw new Error('Unverified trade execution times');
    for(const k of ['volume','open_price','close_price','profit','commission','swap'])if(typeof t[k]!=='number'||!Number.isFinite(t[k]))throw new Error(`Invalid trade ${k}`);
    if(t.open_price<=0 || t.volume<=0)throw new Error('Unverified trade execution price/volume');
  }
  if(!/^[a-f0-9]{64}$/.test(data.history_digest)||!Number.isInteger(data.history_count)||data.history_count<0)throw new Error('Invalid history manifest');
  return data;
}
