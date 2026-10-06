"use client";
import RaceCountdown from "./RaceCountdown";
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, RefreshCw, Trophy, X } from 'lucide-react';
import { leaderboardBadges } from '@/lib/leaderboardBadges';

export function canViewPublicLeaderboard(challenge: any): boolean {
  return !!challenge && !challenge.teamOnly && ['active','ongoing','reviewing','submission_open','completed','ended'].includes(challenge.displayStatus || challenge.status);
}

export default function PublicLeaderboard({ challenge, onClose }: {challenge: any; onClose: () => void}) {
  const [category, setCategory] = useState('demo');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const id = challenge?.id;
  useEffect(() => { setCategory(challenge?.type === 'real' ? 'real' : 'demo'); setPage(0); setData(null); }, [id, challenge?.type]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const api = process.env.NEXT_PUBLIC_API_URL || 'https://api.winnerpip.com';
    fetch(`${api}/api/challenges/${id}/leaderboard?publicStandings=true&category=${category}&limit=50&offset=${page*50}`, { signal: controller.signal, cache:'no-store' })
      .then(r => { if (!r.ok) throw new Error('Unable to load leaderboard. Please retry.'); return r.json(); })
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(e => { if (!controller.signal.aborted) setError('Unable to load leaderboard. Please use Refresh to retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, category, page, revision]);
  return <Dialog.Root open={!!id} onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-white/15 bg-[#111827] text-white shadow-2xl focus:outline-none">
        <div className="p-5 border-b border-white/10 pr-14">
          <Dialog.Title className="flex items-center gap-2 text-xl font-bold"><Trophy size={21} className="text-emerald-400" />Leaderboard</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-gray-400">{challenge?.title} · Public standings</Dialog.Description>
          <Dialog.Close aria-label="Close leaderboard" className="absolute right-3 top-3 p-2 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"><X size={21}/></Dialog.Close>
        </div>
        <div className="px-5 pt-3"><RaceCountdown startDate={challenge?.startDate} endDate={challenge?.endDate} /></div>
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          {challenge?.type === 'hybrid' ? <div className="flex gap-2">{['demo','real'].map(c=><button key={c} onClick={()=>{setCategory(c);setPage(0);}} aria-pressed={category===c} className={`rounded-lg px-3 py-2 text-sm capitalize ${category===c?'bg-emerald-500/20 text-emerald-300':'bg-white/5 text-gray-400'}`}>{c}</button>)}</div> : <span className="text-sm text-gray-400 capitalize">{category} accounts</span>}
          <button onClick={()=>setRevision(v=>v+1)} disabled={loading} className="flex items-center gap-1.5 text-sm text-emerald-300 disabled:opacity-50"><RefreshCw size={15}/>Refresh</button>
        </div>
        <div className="min-h-24 overflow-auto px-5 pb-4" aria-live="polite">
          {loading ? <p className="flex justify-center gap-2 py-10 text-gray-400"><Loader2 className="animate-spin" size={20}/>Loading standings…</p> : error ? <p role="alert" className="py-8 text-red-400">{error}</p> : !data?.leaderboard?.length ? <p className="py-8 text-center text-gray-400">No published standings yet.</p> :
          <table className="w-full text-sm"><thead className="text-xs text-gray-400"><tr><th className="py-3 text-left">Rank / Trader</th><th className="py-3 text-right">Qualified balance</th></tr></thead>
            <tbody>{data.leaderboard.map((entry:any)=>{const badges=leaderboardBadges(entry,challenge,!!data.preStart);const balance=Number(entry.adjustedBalance||0)-Number(entry.totalWithdrawn||0);return <tr key={`${entry.accountType}:${entry.nickname}`} className={`border-t border-white/5 ${badges.highlight?'bg-emerald-500/10':''}`}>
              <td className="py-3 pr-3"><div className={`break-words font-medium ${badges.highlight?'text-emerald-300':'text-white'}`}><span className="mr-2 text-gray-400">#{entry.rank || '—'}</span>{badges.trophy&&<span aria-label="Prize position">🏆 </span>}{entry.nickname}</div><div className="mt-1 text-xs text-gray-400">{entry.totalTrades || 0} trades · {entry.qualifiedTrades || 0} qualified{entry.isDisqualified?' · Disqualified':entry.isWithdrawn?' · Exited':''}</div></td>
              <td className="py-3 text-right whitespace-nowrap font-semibold">{entry.isCent ? `${balance.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}¢` : balance.toLocaleString('en-US',{style:'currency',currency:'USD'})}</td>
            </tr>;})}</tbody></table>}
        {!loading && !error && data?.hasMore === false && data?.disqualifiedCount > 0 && <p className="pt-4 pb-2 text-xs text-gray-400">{data.disqualifiedCount} {data.disqualifiedCount === 1 ? 'participant disqualified' : 'participants disqualified'} due to challenge rule breaches.</p>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-3 text-sm text-gray-400">
          <button disabled={page===0||loading} onClick={()=>setPage(p=>p-1)} className="p-2 disabled:opacity-30">Previous</button><span>Page {page+1}{data?.total ? ` · ${data.total} participants`:''}</span><button disabled={!data?.hasMore||loading} onClick={()=>setPage(p=>p+1)} className="p-2 disabled:opacity-30">Next</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
