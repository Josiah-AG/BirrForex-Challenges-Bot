"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { TrendingUp, Trophy, AlertTriangle, Target, Activity, ArrowLeft, FileText, Clock, ChevronDown, ChevronUp, Shield, Award, X } from "lucide-react";

// ==================== TYPES ====================
interface Trade {
  ticket: number; date: string; symbol: string; type: string; volume: number;
  openPrice: number; closePrice: number; stopLoss: number; takeProfit: number;
  profit: number; rr: number; duration: string; isQualified: boolean; violations: string[];
}
interface LeaderboardEntry {
  rank: number; nickname: string; balance: number; trades: number; winRate: number; avgRR: number; isMe?: boolean;
  recentTrades: { symbol: string; type: string; profit: number; rr: number; date: string; flagged?: boolean }[];
}

export default function DemoDashboard() {
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "leaderboard" | "violations">("trades");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);

  // Lock body scroll when any modal is open
  const anyModalOpen = showRules || !!selectedTrade || showLeaderboardModal || showViolationsModal;
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [anyModalOpen]);

  // ==================== PLACEHOLDER DATA ====================
  const challenge = { id: "15", title: "Challenge 15 — Hybrid (Demo & Real)", status: "active", daysLeft: 7, startingBalance: 30, targetBalance: 60 };
  const myStats = { nickname: "TradeNinja", rank: 12, totalParticipants: 2847, currentBalance: 48.75, qualifiedProfit: 15.50, grossProfit: 22.30, totalTrades: 28, flaggedTrades: 3, winRate: 64, avgRR: 1.8, bestTrade: 4.20, worstTrade: -2.10, lastUpdated: "2 hours ago" };

  const recentTrades: Trade[] = [
    { ticket: 100001, date: "May 14, 14:30", symbol: "EURUSD", type: "Buy", volume: 0.02, openPrice: 1.08450, closePrice: 1.08670, stopLoss: 1.08250, takeProfit: 1.08850, profit: 4.20, rr: 1.1, duration: "2h 15m", isQualified: true, violations: [] },
    { ticket: 100002, date: "May 14, 10:15", symbol: "GBPUSD", type: "Sell", volume: 0.05, openPrice: 1.26800, closePrice: 1.26550, stopLoss: 1.27050, takeProfit: 1.26300, profit: 12.50, rr: 2.0, duration: "4h 30m", isQualified: false, violations: ["Lot size exceeded (0.05 > 0.02 max)"] },
    { ticket: 100003, date: "May 13, 16:45", symbol: "USDJPY", type: "Buy", volume: 0.02, openPrice: 155.200, closePrice: 155.050, stopLoss: 154.900, takeProfit: 155.500, profit: -2.10, rr: 0, duration: "5h 10m", isQualified: true, violations: [] },
    { ticket: 100004, date: "May 13, 11:20", symbol: "EURUSD", type: "Sell", volume: 0.02, openPrice: 1.08900, closePrice: 1.08750, stopLoss: 1.09100, takeProfit: 1.08500, profit: 3.00, rr: 0.75, duration: "3h 45m", isQualified: true, violations: [] },
    { ticket: 100005, date: "May 12, 09:30", symbol: "GBPJPY", type: "Buy", volume: 0.02, openPrice: 195.400, closePrice: 195.600, stopLoss: 195.100, takeProfit: 196.000, profit: 2.80, rr: 0.67, duration: "6h 20m", isQualified: true, violations: [] },
    { ticket: 100006, date: "May 12, 08:00", symbol: "XAUUSD", type: "Buy", volume: 0.02, openPrice: 2350.50, closePrice: 2352.80, stopLoss: 2348.00, takeProfit: 2356.00, profit: 2.30, rr: 0.92, duration: "1h 50m", isQualified: true, violations: [] },
    { ticket: 100007, date: "May 11, 15:10", symbol: "EURUSD", type: "Buy", volume: 0.02, openPrice: 1.08200, closePrice: 1.08350, stopLoss: 1.08000, takeProfit: 1.08600, profit: 3.00, rr: 0.75, duration: "26h 40m", isQualified: false, violations: ["Position held > 24 hours"] },
    { ticket: 100008, date: "May 11, 10:00", symbol: "USDJPY", type: "Sell", volume: 0.02, openPrice: 155.800, closePrice: 155.650, stopLoss: 156.100, takeProfit: 155.200, profit: 2.10, rr: 0.5, duration: "2h 30m", isQualified: true, violations: [] },
  ];

  const leaderboard: LeaderboardEntry[] = [
    { rank: 1, nickname: "GoldPipKing", balance: 58.50, trades: 34, winRate: 71, avgRR: 2.3, recentTrades: [{ symbol: "XAUUSD", type: "Buy", profit: 5.20, rr: 2.5, date: "May 14" }, { symbol: "EURUSD", type: "Sell", profit: 3.80, rr: 1.9, date: "May 14" }, { symbol: "GBPUSD", type: "Buy", profit: 4.10, rr: 2.1, date: "May 13", flagged: true }] },
    { rank: 2, nickname: "ForexEagle", balance: 55.80, trades: 29, winRate: 69, avgRR: 2.1, recentTrades: [{ symbol: "EURUSD", type: "Buy", profit: 4.50, rr: 2.2, date: "May 14" }, { symbol: "USDJPY", type: "Sell", profit: 3.20, rr: 1.6, date: "May 13", flagged: true }] },
    { rank: 3, nickname: "SilentTrader", balance: 53.40, trades: 31, winRate: 65, avgRR: 1.9, recentTrades: [{ symbol: "GBPJPY", type: "Sell", profit: 3.90, rr: 2.0, date: "May 14" }, { symbol: "EURUSD", type: "Buy", profit: 2.80, rr: 1.4, date: "May 13" }] },
    { rank: 4, nickname: "PipMachine", balance: 51.90, trades: 27, winRate: 67, avgRR: 1.7, recentTrades: [{ symbol: "EURUSD", type: "Buy", profit: 3.10, rr: 1.5, date: "May 14" }] },
    { rank: 5, nickname: "AlphaFX", balance: 50.10, trades: 25, winRate: 64, avgRR: 1.6, recentTrades: [{ symbol: "XAUUSD", type: "Sell", profit: 2.90, rr: 1.4, date: "May 13" }] },
    { rank: 6, nickname: "NightOwl", balance: 49.50, trades: 30, winRate: 60, avgRR: 1.5, recentTrades: [] },
    { rank: 7, nickname: "ScalpMaster", balance: 48.80, trades: 42, winRate: 62, avgRR: 1.2, recentTrades: [] },
    { rank: 8, nickname: "TrendRider", balance: 47.60, trades: 22, winRate: 68, avgRR: 2.0, recentTrades: [] },
    { rank: 9, nickname: "SwingKing", balance: 46.90, trades: 18, winRate: 72, avgRR: 2.4, recentTrades: [] },
    { rank: 10, nickname: "PipSniper", balance: 46.20, trades: 26, winRate: 58, avgRR: 1.3, recentTrades: [] },
    { rank: 11, nickname: "FXWarrior", balance: 45.80, trades: 24, winRate: 63, avgRR: 1.5, recentTrades: [] },
    { rank: 12, nickname: "TradeNinja", balance: 45.50, trades: 28, winRate: 64, avgRR: 1.8, isMe: true, recentTrades: [{ symbol: "EURUSD", type: "Buy", profit: 4.20, rr: 1.1, date: "May 14" }, { symbol: "USDJPY", type: "Buy", profit: -2.10, rr: 0, date: "May 13" }] },
    { rank: 13, nickname: "MarketPro", balance: 44.90, trades: 20, winRate: 60, avgRR: 1.4, recentTrades: [] },
    { rank: 14, nickname: "ChartWiz", balance: 44.20, trades: 23, winRate: 57, avgRR: 1.2, recentTrades: [] },
    { rank: 15, nickname: "PipHunter", balance: 43.80, trades: 19, winRate: 63, avgRR: 1.6, recentTrades: [] },
  ];

  const violations = recentTrades.filter(t => !t.isQualified);
  const progressPercent = Math.min(100, ((myStats.currentBalance - challenge.startingBalance) / (challenge.targetBalance - challenge.startingBalance)) * 100);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-profit/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-white/5">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/challenges"><button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ArrowLeft size={20} /></button></Link>
              <div className="flex items-center gap-2">
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={32} height={32} className="rounded-lg" />
                <div className="hidden sm:block">
                  <p className="text-sm font-bold text-white leading-tight">{challenge.title}</p>
                  <p className="text-xs text-gray-500">{myStats.nickname} • #87654321</p>
                </div>
              </div>
            </div>
            <button onClick={() => setShowRules(true)} className="flex items-center gap-2 px-3 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all text-sm"><FileText size={14} /><span className="hidden sm:inline">Rules</span></button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl relative">

        {/* ==================== DASHBOARD ==================== */}
        {/* TOP STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <button onClick={() => setShowLeaderboardModal(true)} className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-left hover:border-gold/30 transition-all">
            <div className="flex items-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Rank</p></div>
            <p className="text-3xl md:text-4xl font-bold gradient-text">#{myStats.rank}</p>
            <p className="text-xs text-gray-500 mt-1">of {myStats.totalParticipants}</p>
          </button>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Profit</p></div>
            <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>${myStats.qualifiedProfit.toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">Gross: ${myStats.grossProfit.toFixed(2)}</p>
          </div>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Balance</p></div>
            <p className="text-3xl md:text-4xl font-bold text-white">${myStats.currentBalance}</p>
            <p className="text-xs text-gray-500 mt-1">Target: ${challenge.targetBalance}</p>
          </div>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Time Left</p></div>
            <p className="text-3xl md:text-4xl font-bold text-gold">{challenge.daysLeft}</p>
            <p className="text-xs text-gray-500 mt-1">days remaining</p>
          </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
          <div className="flex items-center justify-between mb-3"><p className="text-sm font-medium text-gray-300">Progress to Target</p><p className="text-sm font-bold text-white">{progressPercent.toFixed(0)}%</p></div>
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-royal to-profit transition-all duration-500" style={{ width: `${progressPercent}%` }} /></div>
          <div className="flex justify-between mt-2 text-xs text-gray-500"><span>${challenge.startingBalance}</span><span>${challenge.targetBalance}</span></div>
        </div>

        {/* MINI STATS */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <MiniStat label="Trades" value={myStats.totalTrades.toString()} icon={<Activity size={14} />} />
          <MiniStat label="Win Rate" value={`${myStats.winRate}%`} icon={<Award size={14} />} />
          <MiniStat label="Avg RR" value={myStats.avgRR.toFixed(1)} icon={<Target size={14} />} color="text-royal" />
          <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
            <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
            <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
          </button>
          <MiniStat label="Best" value={`$${myStats.bestTrade}`} icon={<ChevronUp size={14} />} color="text-profit" />
          <MiniStat label="Worst" value={`$${myStats.worstTrade}`} icon={<ChevronDown size={14} />} color="text-loss" />
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6">
          <TabBtn active={activeTab === "trades"} onClick={() => setActiveTab("trades")} label="Trades" count={myStats.totalTrades} />
          <TabBtn active={activeTab === "leaderboard"} onClick={() => setActiveTab("leaderboard")} label="Leaderboard" />
          <TabBtn active={activeTab === "violations"} onClick={() => setActiveTab("violations")} label="Flagged" count={myStats.flaggedTrades} />
        </div>

        {/* TRADES TAB */}
        {activeTab === "trades" && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Recent Trades</p>
            <p className="text-xs text-gray-500">Tap a trade for details</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px]">
              <thead><tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Date</th>
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Symbol</th>
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Type</th>
                <th className="text-right py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Profit</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">RR</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Status</th>
              </tr></thead>
              <tbody>{recentTrades.map((t) => (
                <tr key={t.ticket} onClick={() => setSelectedTrade(t)} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${!t.isQualified ? "bg-loss/5" : ""}`}>
                  <td className="py-3 px-4 text-xs text-gray-400">{t.date}</td>
                  <td className="py-3 px-4 text-sm text-white font-semibold">{t.symbol}</td>
                  <td className="py-3 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span></td>
                  <td className={`py-3 px-4 text-right text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                  <td className="py-3 px-4 text-center text-xs text-gray-400">{t.rr > 0 ? `${t.rr.toFixed(1)}R` : "—"}</td>
                  <td className="py-3 px-4 text-center">{t.isQualified ? <span className="text-profit">✓</span> : <span className="text-loss">🚩</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="p-3 border-t border-white/5 text-center"><p className="text-xs text-gray-600">Last updated: {myStats.lastUpdated}</p></div>
        </div>
        )}

        {/* LEADERBOARD TAB */}
        {activeTab === "leaderboard" && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Leaderboard</p></div>
            <p className="text-xs text-gray-500">Ranked by balance • Tap for details</p>
          </div>
          <div className="divide-y divide-white/5">
            {leaderboard.map((entry) => (
              <button key={entry.rank} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""}`}>
                <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"}`}>{entry.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>{entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}</div>
                  <p className="text-[10px] text-gray-500">{entry.trades} trades • {entry.winRate}% win • {entry.avgRR.toFixed(1)}R</p>
                </div>
                <p className="text-sm font-bold text-white">${entry.balance.toFixed(2)}</p>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* VIOLATIONS TAB */}
        {activeTab === "violations" && (
        <div className="space-y-3">
          {violations.length === 0 ? (
            <div className="glass rounded-2xl border border-white/10 p-8 text-center">
              <Shield className="w-12 h-12 text-profit mx-auto mb-3" />
              <p className="text-white font-semibold">No violations!</p>
              <p className="text-sm text-gray-400 mt-1">All your trades follow the rules</p>
            </div>
          ) : (<>
            <div className="glass rounded-xl border border-loss/20 p-4"><p className="text-xs text-gray-300"><span className="text-loss font-semibold">{violations.length} flagged trades</span> — Profits removed. Losses still count.</p></div>
            {violations.map((t) => (
              <div key={t.ticket} onClick={() => setSelectedTrade(t)} className="glass rounded-2xl border border-loss/20 p-4 bg-loss/5 cursor-pointer hover:border-loss/40 transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-loss/20 rounded-lg flex-shrink-0"><AlertTriangle size={14} className="text-loss" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-semibold">{t.symbol}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                      <span className="text-xs text-gray-500">{t.date}</span>
                    </div>
                    <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>Lots: {t.volume}</span>
                      <span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span>
                      <span>RR: {t.rr > 0 ? `${t.rr.toFixed(1)}R` : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>)}
        </div>
        )}
      </div>

      {/* ==================== TRADE DETAIL MODAL ==================== */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setSelectedTrade(null)}>
          <div className="glass rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${selectedTrade.type === "Buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>{selectedTrade.type}</span>
                <span className="text-lg font-bold text-white">{selectedTrade.symbol}</span>
              </div>
              <button onClick={() => setSelectedTrade(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DRow label="Ticket" value={`#${selectedTrade.ticket}`} />
                <DRow label="Date" value={selectedTrade.date} />
                <DRow label="Volume" value={`${selectedTrade.volume} lots`} />
                <DRow label="Duration" value={selectedTrade.duration} />
                <DRow label="Entry" value={selectedTrade.openPrice.toString()} />
                <DRow label="Exit" value={selectedTrade.closePrice.toString()} />
                <DRow label="Stop Loss" value={selectedTrade.stopLoss.toString()} color="text-loss" />
                <DRow label="Take Profit" value={selectedTrade.takeProfit.toString()} color="text-profit" />
                <DRow label="Risk:Reward" value={selectedTrade.rr > 0 ? `${selectedTrade.rr.toFixed(1)}R` : "Hit SL"} color="text-royal" />
                <DRow label="Profit/Loss" value={`${selectedTrade.profit >= 0 ? "+" : ""}$${selectedTrade.profit.toFixed(2)}`} color={selectedTrade.profit >= 0 ? "text-profit" : "text-loss"} />
              </div>
              <div className={`p-4 rounded-xl border ${selectedTrade.isQualified ? "bg-profit/10 border-profit/20" : "bg-loss/10 border-loss/20"}`}>
                {selectedTrade.isQualified ? (
                  <p className="text-sm text-profit font-semibold flex items-center gap-2"><Shield size={16} />Qualified — counts toward your balance</p>
                ) : (
                  <div><p className="text-sm text-loss font-semibold flex items-center gap-2 mb-2"><AlertTriangle size={16} />Flagged — profit removed</p><p className="text-sm text-white">{selectedTrade.violations[0]}</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LEADERBOARD MODAL ==================== */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => { setShowLeaderboardModal(false); setSelectedUser(null); }}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-gold/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><Trophy size={20} className="text-gold" /><h3 className="text-lg font-bold text-white">Leaderboard</h3></div>
              <button onClick={() => { setShowLeaderboardModal(false); setSelectedUser(null); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            {!selectedUser ? (
              <div className="divide-y divide-white/5">
                {leaderboard.map((entry) => (
                  <button key={entry.rank} onClick={() => setSelectedUser(entry)} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"}`}>{entry.rank}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>{entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}</div>
                      <p className="text-[10px] text-gray-500">{entry.trades} trades • {entry.winRate}% win • {entry.avgRR.toFixed(1)}R avg</p>
                    </div>
                    <p className="text-sm font-bold text-white">${entry.balance.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back to leaderboard</button>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${selectedUser.rank <= 3 ? "bg-gold/20 text-gold" : "bg-white/10 text-gray-400"}`}>#{selectedUser.rank}</div>
                  <div>
                    <p className="text-xl font-bold text-white">{selectedUser.nickname}</p>
                    <p className="text-sm text-gray-400">Balance: <span className="text-white font-semibold">${selectedUser.balance.toFixed(2)}</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Trades</p><p className="text-lg font-bold text-white">{selectedUser.trades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate</p><p className="text-lg font-bold text-white">{selectedUser.winRate}%</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{selectedUser.avgRR.toFixed(1)}R</p></div>
                </div>
                {selectedUser.recentTrades.length > 0 ? (
                  <div><p className="text-sm font-semibold text-gray-300 mb-3">Recent Trades</p><div className="space-y-2">{selectedUser.recentTrades.map((t, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-xl border ${t.flagged ? "bg-loss/5 border-loss/20" : "bg-white/5 border-white/10"}`}>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                        <div><p className="text-sm text-white font-semibold">{t.symbol}</p><p className="text-[10px] text-gray-500">{t.date}</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right"><p className={`text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>${t.profit.toFixed(2)}</p><p className="text-[10px] text-gray-500">{t.rr > 0 ? `${t.rr.toFixed(1)}R` : "—"}</p></div>
                        {t.flagged && <span className="text-loss text-sm">🚩</span>}
                      </div>
                    </div>
                  ))}</div></div>
                ) : (<p className="text-sm text-gray-500 text-center py-4">No recent trades to show</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== VIOLATIONS MODAL ==================== */}
      {showViolationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setShowViolationsModal(false)}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-loss/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><AlertTriangle size={20} className="text-loss" /><h3 className="text-lg font-bold text-white">Flagged Trades ({violations.length})</h3></div>
              <button onClick={() => setShowViolationsModal(false)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 rounded-xl bg-loss/10 border border-loss/20 mb-2"><p className="text-xs text-gray-300"><span className="text-loss font-semibold">Note:</span> Profits from flagged trades are removed. Losses still count.</p></div>
              {violations.map((t) => (
                <div key={t.ticket} className="p-4 rounded-xl bg-white/5 border border-loss/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                      <span className="text-white font-semibold">{t.symbol}</span>
                    </div>
                    <span className="text-xs text-gray-500">{t.date}</span>
                  </div>
                  <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>
                  <div className="flex gap-4 text-xs text-gray-400"><span>Lots: {t.volume}</span><span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span><span>RR: {t.rr > 0 ? `${t.rr.toFixed(1)}R` : "—"}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== RULES MODAL ==================== */}
      {showRules && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setShowRules(false)}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-royal/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><FileText size={20} className="text-royal" /><h3 className="text-lg font-bold text-white">Challenge Rules</h3></div>
              <button onClick={() => setShowRules(false)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <RuleItem code="1" text="Maximum lot size per trade: 0.02" />
              <RuleItem code="2" text="Maximum 3 trades open at the same time" />
              <RuleItem code="3" text="Maximum 2 trades on the same pair simultaneously" />
              <RuleItem code="4" text="Stop loss required on all trades (max risk: $5)" />
              <RuleItem code="5" text="Daily loss cap: $10 from day's opening balance" />
              <RuleItem code="6" text="Maximum trade duration: 24 hours" />
              <RuleItem code="7" text="No weekend trading (Friday 22:00 — Sunday 22:00 UTC)" />
              <RuleItem code="8" text="Minimum 7 active trading days to qualify" />
              <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
                <RuleItem code="•" text="No recharging (additional deposits) allowed during the challenge" />
                <RuleItem code="•" text="Unlimited trades per day — as long as all rules are followed" />
                <RuleItem code="•" text="No leverage limit" />
                <RuleItem code="•" text="Trades against the rules will have profits disqualified (losses still count)" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-4">
                <p className="text-xs text-gray-400"><span className="text-loss font-semibold">Penalty:</span> Profits from flagged trades are removed from your qualified balance. Losses from flagged trades still count. Repeated or severe violations may result in disqualification.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (<div className="glass rounded-xl p-3 border border-white/10 text-center"><div className={`flex items-center justify-center gap-1 mb-1 ${color || "text-gray-400"}`}>{icon}<p className="text-[9px] uppercase tracking-wider font-medium">{label}</p></div><p className={`text-lg font-bold ${color || "text-white"}`}>{value}</p></div>);
}
function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (<button onClick={onClick} className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${active ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{label}{count !== undefined && count > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${active ? "bg-royal/30 text-royal" : "bg-white/10 text-gray-500"}`}>{count}</span>}</button>);
}
function RuleItem({ code, text }: { code: string; text: string }) {
  return (<div className="flex gap-3 items-start"><span className="px-2 py-1 bg-royal/20 text-royal text-xs font-bold rounded flex-shrink-0">{code}</span><p className="text-sm text-gray-300">{text}</p></div>);
}
function DRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (<div className="bg-white/5 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p><p className={`text-sm font-semibold ${color || "text-white"}`}>{value}</p></div>);
}
