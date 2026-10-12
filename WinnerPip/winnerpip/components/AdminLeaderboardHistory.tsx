"use client";
import {useEffect,useState} from 'react';
import {challengeTimestamp} from '@/lib/challengeTime';
import {balanceOperationTime} from '@/lib/balanceOperationTime';
import TimeWithZone from './TimeWithZone';
function TradeRevenue({value}:{value:any}) {
 const money=(n:number)=>Number(n).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
 return <p className="text-[10px] text-blue-300 mt-1">Revenue {value ? <><strong>{money(Number(value.confirmed||0)+Number(value.estimated||0))}</strong>{Number(value.estimated)>0?' · Estimated':''}{value.pending?' · More pending':''}</> : 'Pending'}</p>;
}
export default function AdminLeaderboardHistory({challengeId,selectedParticipant,selectedChall,challengeTz,setSelectedTrade}:{challengeId:string;selectedParticipant:any;selectedChall:any;challengeTz:string;setSelectedTrade:(trade:any)=>void}) {
 const [selectedParticipantTrades,setTrades]=useState<any[]>([]),[selectedParticipantBalanceOps,setOps]=useState<any[]>([]),[revenues,setRevenues]=useState<Record<string,any>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{const controller=new AbortController();const signal=controller.signal;
 const api=process.env.NEXT_PUBLIC_API_URL||'https://api.winnerpip.com';
 fetch(`${api}/api/challenges/${challengeId}/user-trades?nickname=${encodeURIComponent(selectedParticipant.nickname)}`,{signal,cache:'no-store'})
 .then(async r=>{if(!r.ok)throw Error('Could not load account history.');return r.json()})
 .then(d=>{setTrades(d.trades||[]);setOps(d.balanceOps||[])})
 .catch(e=>{if(e.name!=='AbortError')setError(e.message)})
 .finally(()=>{if(!signal.aborted)setLoading(false)});
 if(selectedParticipant.accountType==='real') (async()=>{
  let page=1,pages=1;do{
   const r=await fetch(`/api/management/challenge/${challengeId}/participant/${selectedParticipant.registrationId}/trades?page=${page}`,{signal,cache:'no-store'});
   if(!r.ok)throw Error('Revenue unavailable');const d=await r.json();if(signal.aborted)return;
   setRevenues(previous=>({...previous,...Object.fromEntries(d.trades.map((t:any)=>[String(t.ticket),t.generatedRevenue]))}));pages=d.pages;page++;
  }while(page<=pages&&!signal.aborted);
 })().catch(()=>{/* Missing revenue remains pending; account history stays available. */});
 return()=>controller.abort();
 },[challengeId,selectedParticipant.nickname,selectedParticipant.registrationId,selectedParticipant.accountType]);
 return <section>{loading&&<p className="text-xs text-gray-400">Loading history…</p>}{error&&<p role="alert" className="text-xs text-loss">{error}</p>}
              {selectedParticipantTrades.length > 0 && (() => {
                const _wins = selectedParticipantTrades.filter((t: any) => t.profit > 0 && t.isQualified !== false);
                const _losses = selectedParticipantTrades.filter((t: any) => t.profit < 0);
                const _decided = _wins.length + _losses.length;
                const _wr = _decided > 0 ? Math.round((_wins.length / _decided) * 100) : 0;
                const _aw = _wins.length > 0 ? _wins.reduce((s: number, t: any) => s + t.profit, 0) / _wins.length : 0;
                const _al = _losses.length > 0 ? Math.abs(_losses.reduce((s: number, t: any) => s + t.profit, 0) / _losses.length) : 0;
                const _rr = _al > 0 ? _aw / _al : 0;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate (Qualified)</p><p className={`text-lg font-bold ${_wr >= 50 ? "text-profit" : "text-loss"}`}>{_wr}%</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{_rr > 0 ? _rr.toFixed(2) : "—"}</p></div>
                  </div>
                );
              })()}
              {(selectedParticipantTrades.length > 0 || selectedParticipantBalanceOps.length > 0) && (() => {
                const fmtEAT = (d: string) => challengeTimestamp(d, challengeTz);
                const fmtDateEAT = (d: string) => challengeTimestamp(d, challengeTz, true).slice(0,10);
                const c = (v: number) => selectedParticipant.isCent ? `${v.toFixed(2)}¢` : `$${v.toFixed(2)}`;
                const opMeta: Record<string, { icon: string; label: string; bg: string; border: string; textColor: string; sign: (a: number) => string }> = {
                  deposit:    { icon: '💰', label: 'Deposit',    bg: 'bg-profit/10', border: 'border-profit/20', textColor: 'text-profit',      sign: () => '+' },
                  withdrawal: { icon: '🚪', label: 'Withdrawal', bg: 'bg-loss/10',   border: 'border-loss/20',   textColor: 'text-loss',        sign: () => '-' },
                  swap:       { icon: '🔄', label: 'Swap',       bg: 'bg-amber-500/10', border: 'border-amber-500/20', textColor: 'text-amber-400', sign: (a) => a < 0 ? '-' : '+' },
                  dividend:   { icon: '📊', label: 'Dividend adjustment',   bg: 'bg-royal/10',  border: 'border-royal/20',  textColor: 'text-royal',       sign: (a) => a < 0 ? '-' : '+' },
                };
                opMeta.adjustment = { ...opMeta.dividend, icon: '🔄', label: 'Broker adjustment' };
                opMeta.negative_balance_reset = { ...opMeta.dividend, icon: '🔄', label: 'Negative balance reset' };
                for (const [kind,label] of Object.entries({commission:'Commission',fee:'Broker fee',interest:'Interest',tax:'Tax'})) opMeta[kind] = {...opMeta.dividend,label};
                // Group trades by positionId
                const posMap = new Map<number, any[]>();
                for (const t of selectedParticipantTrades) {
                  const key = t.positionId ?? t.ticket;
                  if (!posMap.has(key)) posMap.set(key, []);
                  posMap.get(key)!.push(t);
                }
                Array.from(posMap.values()).forEach(g => g.sort((a: any, b: any) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()));
                // Build unified feed: each entry has a sortTime and a type
                type FeedItem = { sortTime: number } & ({ kind: 'trade'; group: any[] } | { kind: 'op'; op: any });
                const feed: FeedItem[] = [];
                posMap.forEach(group => {
                  feed.push({ kind: 'trade', group, sortTime: new Date(group[0].closeTime).getTime() });
                });
                for (const op of selectedParticipantBalanceOps) {
                  feed.push({ kind: 'op', op, sortTime: new Date(op.closeTime).getTime() });
                }
                // Newest first — most recent trades at top
                feed.sort((a, b) => b.sortTime - a.sortTime);
                const tradeCount = posMap.size;
                return (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-400 mb-2">Account History · {tradeCount} trade{tradeCount !== 1 ? 's' : ''}</p>
                    <div className="space-y-2 max-h-[360px] overflow-y-auto">
                      {feed.map((item, idx) => {
                        if (item.kind === 'op') {
                          const op = item.op;
                          const isPostStart = selectedChall?.startDate && new Date(op.closeTime) >= new Date(selectedChall.startDate);
                          const isDeposit = op.opType === 'deposit';
                          const meta = (isDeposit && isPostStart)
                            ? { icon: '⚠️', label: 'Deposit (Post-Start)', bg: 'bg-loss/10', border: 'border-loss/20', textColor: 'text-loss', sign: () => '+' }
                            : (opMeta[op.opType] || opMeta.adjustment);
                          return (
                            <div key={`op-${op.ticket}`} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${meta.bg} ${meta.border}`}>
                              <div>
                                <p className="text-xs text-white font-medium">{meta.icon} {meta.label}</p>
                                <p className="text-[10px] text-gray-500">{balanceOperationTime(op.closeTime, selectedChall?.timezone || 'Africa/Addis_Ababa')}{op.comment ? ` · ${op.comment}` : ''}</p>
                              </div>
                              <p className={`text-xs font-bold ${meta.textColor}`}>{meta.sign(op.amount)}{c(Math.abs(op.amount))}</p>
                            </div>
                          );
                        }
                        const group = item.group;
                        if (group.length === 1) {
                          const t = group[0];
                          return (
                            <div key={`t-${t.ticket}-${idx}`} onClick={() => setSelectedTrade(t)} className={`py-2 px-3 rounded-lg cursor-pointer hover:brightness-125 transition-all ${t.slCheckResult === 'conflicting' ? 'bg-amber-500/5 border border-amber-400/20' : !t.isQualified ? 'bg-loss/10 border border-loss/20' : 'bg-white/5'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.type?.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{t.type}</span>
                                  <div>
                                    <p className="text-xs text-white font-medium">{t.symbol}</p>
                                    <p className="text-[10px] text-gray-500">{t.openTime ? fmtDateEAT(t.openTime) : ''} <TimeWithZone text={t.openTime ? fmtEAT(t.openTime) : ''}/> → <TimeWithZone text={t.closeTime ? fmtEAT(t.closeTime) : ''}/></p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{c(t.profit)}</p>
                                  <p className="text-[10px] text-gray-500">{t.volume} lot {t.slCheckResult === 'conflicting' ? <span className="text-amber-400 ml-1">?</span> : t.slCheckPending ? <span className="text-gold ml-1" title="Max risk check pending — result may change">?</span> : !t.isQualified ? <span className="text-loss">🚩</span> : null}</p>
                                </div>
                              </div>
                              {selectedParticipant.accountType === 'real' && <TradeRevenue value={revenues[String(t.ticket)]} />}
                              {!t.isQualified && t.violations?.length > 0 && <p className="text-[10px] text-loss mt-1 pl-7">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : (t.violations[0] as any)?.detail || 'Rule violation'}</p>}
                            </div>
                          );
                        }
                        const totalProfit = group.reduce((s: number, t: any) => s + Number(t.profit), 0);
                        const totalVol = group.reduce((s: number, t: any) => s + Number(t.volume), 0);
                        const anyFlagged = group.some((t: any) => !t.isQualified);
                        const anyConflict = group.some((t: any) => t.slCheckResult === 'conflicting');
                        const first = group[0];
                        return (
                          <div key={`g-${first.positionId ?? first.ticket}-${idx}`} className={`rounded-lg overflow-hidden ${anyFlagged ? 'border border-loss/20' : anyConflict ? 'border border-amber-400/20' : 'border border-white/10'}`}>
                            <div onClick={() => setSelectedTrade({ ...first, ticket: first.positionId ?? first.ticket, _isGroupHeader: true, _group: group, profit: totalProfit, volume: totalVol })} className={`py-2 px-3 cursor-pointer hover:brightness-125 transition-all ${anyFlagged ? 'bg-loss/10' : anyConflict ? 'bg-amber-500/5' : 'bg-white/5'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${first.type?.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{first.type}</span>
                                  <div>
                                    <p className="text-xs text-white font-medium">{first.symbol} <span className="text-gray-500 font-normal">{group.length} closes</span></p>
                                    <p className="text-[10px] text-gray-500">{first.openTime ? fmtDateEAT(first.openTime) : ''} <TimeWithZone text={first.openTime ? fmtEAT(first.openTime) : ''}/></p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>{c(totalProfit)}</p>
                                  <p className="text-[10px] text-gray-500">{totalVol.toFixed(2)} lot {anyFlagged ? <span className="text-loss">🚩</span> : anyConflict ? <span className="text-amber-400">?</span> : null}</p>
                                </div>
                              </div>
                            </div>
                            {group.map((t: any) => (
                              <div key={t.ticket} onClick={() => setSelectedTrade(t)} className={`py-1.5 px-3 pl-6 border-t border-white/5 cursor-pointer hover:brightness-125 transition-all ${!t.isQualified ? 'bg-loss/5' : ''}`}>
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] text-gray-500">└ → <TimeWithZone text={fmtEAT(t.closeTime)}/> · {t.volume} lot</p>
                                  <p className={`text-[10px] font-semibold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{c(t.profit)}</p>
                                </div>
                                {selectedParticipant.accountType === 'real' && <TradeRevenue value={revenues[String(t.ticket)]} />}
                              {!t.isQualified && t.violations?.length > 0 && <p className="text-[10px] text-loss mt-1 pl-2">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : (t.violations[0] as any)?.detail || 'Rule violation'}</p>}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

</section>;
}
