"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  TrendingUp,
  Trophy,
  BarChart3,
  AlertTriangle,
  Target,
  Activity,
  LogOut,
  Bell,
  Settings as SettingsIcon,
  ArrowLeft,
  FileText,
  Zap,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

export default function ChallengeDashboard() {
  const params = useParams();
  const [notifications] = useState(3);
  const [selectedViolation, setSelectedViolation] = useState<string | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showViolations, setShowViolations] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [tradesPage, setTradesPage] = useState(1);
  const TRADES_PER_PAGE = 15;

  // Mock data
  const stats = {
    qualifiedProfit: 127.50,
    grossProfit: 142.30,
    rank: 12,
    totalParticipants: 847,
    totalTrades: 45,
    totalLots: 0.90,
    qualifiedTrades: 42,
    illegalTrades: 3,
    bestTradeProfit: 18.50,
    bestInstrument: "EURUSD",
  };

  const allTrades = [
    { id: 1,  date: "2026-03-13 14:30", pair: "EURUSD", type: "Buy",  lots: 0.02, profit:  12.50, isQualified: true },
    { id: 2,  date: "2026-03-13 10:15", pair: "GBPUSD", type: "Sell", lots: 0.05, profit:  18.30, isQualified: false, violation: "TR1: Lot size exceeded (0.05 > 0.02 max)" },
    { id: 3,  date: "2026-03-12 16:45", pair: "USDJPY", type: "Buy",  lots: 0.02, profit:  -5.20, isQualified: true },
    { id: 4,  date: "2026-03-12 11:20", pair: "EURUSD", type: "Sell", lots: 0.02, profit:   8.75, isQualified: true },
    { id: 5,  date: "2026-03-11 09:30", pair: "GBPJPY", type: "Buy",  lots: 0.02, profit:  15.20, isQualified: true },
    { id: 6,  date: "2026-03-11 07:10", pair: "AUDUSD", type: "Buy",  lots: 0.02, profit:   6.40, isQualified: true },
    { id: 7,  date: "2026-03-10 15:55", pair: "USDCAD", type: "Sell", lots: 0.02, profit:  -2.10, isQualified: true },
    { id: 8,  date: "2026-03-10 13:20", pair: "EURUSD", type: "Buy",  lots: 0.02, profit:  12.10, isQualified: false, violation: "TR5: Position held for 26 hours (max 24 hours)" },
    { id: 9,  date: "2026-03-10 09:45", pair: "GBPUSD", type: "Buy",  lots: 0.02, profit:   9.80, isQualified: true },
    { id: 10, date: "2026-03-09 16:30", pair: "USDJPY", type: "Sell", lots: 0.02, profit:  -3.50, isQualified: true },
    { id: 11, date: "2026-03-09 12:15", pair: "EURCAD", type: "Buy",  lots: 0.02, profit:   7.20, isQualified: true },
    { id: 12, date: "2026-03-09 10:00", pair: "GBPJPY", type: "Sell", lots: 0.02, profit:  11.60, isQualified: true },
    { id: 13, date: "2026-03-08 15:40", pair: "AUDUSD", type: "Sell", lots: 0.02, profit:  -4.30, isQualified: true },
    { id: 14, date: "2026-03-08 11:25", pair: "USDCAD", type: "Buy",  lots: 0.02, profit:   5.90, isQualified: true },
    { id: 15, date: "2026-03-08 09:45", pair: "GBPJPY", type: "Sell", lots: 0.02, profit:   8.50, isQualified: false, violation: "TR4: Same pair traded 3 times (max 2 times)" },
    { id: 16, date: "2026-03-07 17:10", pair: "EURUSD", type: "Buy",  lots: 0.02, profit:  10.30, isQualified: true },
    { id: 17, date: "2026-03-07 14:05", pair: "GBPUSD", type: "Sell", lots: 0.02, profit:   3.70, isQualified: true },
    { id: 18, date: "2026-03-07 11:50", pair: "USDJPY", type: "Buy",  lots: 0.02, profit:  -1.80, isQualified: true },
    { id: 19, date: "2026-03-06 16:20", pair: "AUDUSD", type: "Buy",  lots: 0.02, profit:   6.10, isQualified: true },
    { id: 20, date: "2026-03-06 09:30", pair: "EURCAD", type: "Sell", lots: 0.02, profit:  14.70, isQualified: true },
  ];

  const totalTradePages = Math.ceil(allTrades.length / TRADES_PER_PAGE);
  const recentTrades = allTrades.slice((tradesPage - 1) * TRADES_PER_PAGE, tradesPage * TRADES_PER_PAGE);

  // Mock leaderboard data
  const leaderboardData = [
    { rank: 1, username: "TradeMaster", profit: 245.50, trades: 67, winRate: 68 },
    { rank: 2, username: "ForexKing", profit: 198.30, trades: 52, winRate: 71 },
    { rank: 3, username: "PipHunter", profit: 187.20, trades: 48, winRate: 65 },
    { rank: 12, username: "You", profit: 127.50, trades: 45, winRate: 62, isCurrentUser: true },
    { rank: 13, username: "TraderJoe", profit: 115.80, trades: 41, winRate: 59 },
    { rank: 14, username: "MarketPro", profit: 108.40, trades: 39, winRate: 61 },
  ];

  // Mock violations data
  const violationsData = [
    { id: 2, date: "2026-03-13 10:15", pair: "GBPUSD", type: "Sell", lots: 0.05, profit: 18.30, violation: "TR1: Lot size exceeded (0.05 > 0.02 max)" },
    { id: 8, date: "2026-03-10 15:20", pair: "EURUSD", type: "Buy", lots: 0.02, profit: 12.10, violation: "TR5: Position held for 26 hours (max 24 hours)" },
    { id: 15, date: "2026-03-08 09:45", pair: "GBPJPY", type: "Sell", lots: 0.02, profit: 8.50, violation: "TR4: Same pair traded 3 times (max 2 times)" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-profit/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/trader-dashboard">
                <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                  <ArrowLeft size={20} />
                </button>
              </Link>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50"></div>
                  <Image src="/winnerpip-icon.png" alt="WinnerPip" width={40} height={40} className="rounded-xl relative" />
                </div>
                <div>
                  <span className="text-lg font-bold gradient-text">Challenge {params.id}</span>
                  <p className="text-xs text-gray-500">Performance Dashboard</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center gap-2 px-4 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all"
              >
                <FileText size={16} />
                <span className="hidden sm:inline">Rules</span>
              </button>
              <button 
                onClick={() => setShowNotifications(true)}
                className="relative p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <Bell size={20} />
                {notifications > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-loss rounded-full animate-glow"></span>
                )}
              </button>
              <Link href="/settings">
                <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                  <SettingsIcon size={20} />
                </button>
              </Link>
              <Button variant="ghost" size="sm" className="hover:bg-white/5" onClick={() => window.location.href = "/login"}>
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl relative">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-12">
          {/* Qualified Profit */}
          <Link href="#" className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-profit/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <TrendingUp size={18} className="text-profit" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Qualified Profit</p>
                <Tooltip content="Profit from trades that follow all challenge rules" />
              </div>
              <p className={`text-5xl font-bold mb-2 ${stats.qualifiedProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                ${stats.qualifiedProfit.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500">
                Gross: <span className="text-gray-400 font-medium">${stats.grossProfit.toFixed(2)}</span>
              </p>
            </div>
          </Link>

          {/* Rank */}
          <button onClick={() => setShowLeaderboard(true)} className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 text-left w-full relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <Trophy size={18} className="text-gold" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Leaderboard Rank</p>
              </div>
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-bold gradient-text">#{stats.rank}</p>
                <p className="text-lg text-gray-500">of {stats.totalParticipants}</p>
              </div>
            </div>
          </button>

          {/* Total Trades */}
          <div className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-royal/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <Activity size={18} className="text-royal" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Trades</p>
                <Tooltip content="Number of trades and total volume" />
              </div>
              <p className="text-5xl font-bold text-white mb-2">{stats.totalTrades}</p>
              <p className="text-sm text-gray-500">
                <span className="text-royal font-medium">{stats.totalLots} lots</span> • {stats.qualifiedTrades} qualified
              </p>
            </div>
          </div>

          {/* Flagged Trades */}
          <button onClick={() => setShowViolations(true)} className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 text-left w-full relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-loss/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <AlertTriangle size={18} className="text-loss" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Flagged Trades</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-5xl font-bold text-white">{stats.illegalTrades}</p>
                {stats.illegalTrades > 0 && (
                  <Zap className="text-loss w-8 h-8 animate-pulse" />
                )}
              </div>
            </div>
          </button>

          {/* Best Trade */}
          <div className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-profit/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <Target size={18} className="text-profit" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Best Trade</p>
              </div>
              <p className="text-5xl font-bold text-profit mb-2">${stats.bestTradeProfit.toFixed(2)}</p>
              <p className="text-sm text-gray-500">Single trade profit</p>
            </div>
          </div>

          {/* Best Instrument */}
          <div className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-royal/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 glass rounded-xl border border-white/20">
                  <BarChart3 size={18} className="text-royal" />
                </div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Best Instrument</p>
              </div>
              <p className="text-4xl font-bold text-white mb-2">{stats.bestInstrument}</p>
              <p className="text-sm text-gray-500">Most profitable pair</p>
            </div>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="glass-hover card-glow rounded-2xl overflow-hidden">
          <div className="p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Recent Trades</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Date/Time</th>
                    <th className="text-left py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Pair</th>
                    <th className="text-left py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Type</th>
                    <th className="text-left py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Lots</th>
                    <th className="text-right py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Profit</th>
                    <th className="text-center py-4 px-4 text-xs text-gray-400 font-medium uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => (
                    <tr key={trade.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${!trade.isQualified ? 'bg-loss/5 border-loss/20' : ''}`}>
                      <td className="py-4 px-4 text-gray-400 text-sm">{trade.date}</td>
                      <td className="py-4 px-4 text-white font-semibold">{trade.pair}</td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                          trade.type === 'Buy' 
                            ? 'bg-profit/10 text-profit border border-profit/20' 
                            : 'bg-loss/10 text-loss border border-loss/20'
                        }`}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-400">{trade.lots}</td>
                      <td className={`py-4 px-4 text-right font-bold text-lg ${
                        trade.profit >= 0 ? 'text-profit' : 'text-loss'
                      }`}>
                        ${trade.profit.toFixed(2)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {trade.isQualified ? (
                          <span className="text-profit text-2xl">✓</span>
                        ) : (
                          <button
                            onClick={() => setSelectedViolation(trade.violation || "Rule violation")}
                            className="flex items-center justify-center gap-2 mx-auto px-3 py-1.5 rounded-lg bg-loss/20 border border-loss/40 hover:bg-loss/30 transition-all"
                          >
                            <span className="text-loss text-lg">🚩</span>
                            <span className="text-loss text-xs font-semibold">View</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalTradePages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                <p className="text-sm text-gray-500">
                  Page <span className="text-gray-300 font-medium">{tradesPage}</span> of <span className="text-gray-300 font-medium">{totalTradePages}</span>
                  <span className="ml-2 text-gray-600">({allTrades.length} total trades)</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTradesPage(p => Math.max(1, p - 1))}
                    disabled={tradesPage === 1}
                    className="flex items-center gap-1.5 px-4 py-2 glass border border-white/10 text-gray-300 hover:text-white hover:border-white/20 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                    <span className="text-sm font-medium">Prev</span>
                  </button>
                  <button
                    onClick={() => setTradesPage(p => Math.min(totalTradePages, p + 1))}
                    disabled={tradesPage === totalTradePages}
                    className="flex items-center gap-1.5 px-4 py-2 glass border border-white/10 text-gray-300 hover:text-white hover:border-white/20 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="text-sm font-medium">Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Violation Modal */}
        {selectedViolation && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedViolation(null)}
          >
            <div 
              className="glass-hover card-glow rounded-2xl max-w-md w-full p-8 border border-loss/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-loss/20 rounded-xl border border-loss/30">
                  <AlertTriangle className="text-loss w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-white">Trade Violation</h3>
              </div>
              
              <div className="bg-loss/10 border border-loss/20 rounded-xl p-4 mb-6">
                <p className="text-white text-lg leading-relaxed">{selectedViolation}</p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-400">
                  <span className="text-loss font-semibold">Note:</span> Profits from flagged trades do not count towards your qualified profit, but losses still apply.
                </p>
              </div>
              
              <Button 
                onClick={() => setSelectedViolation(null)}
                className="w-full bg-gradient-brand hover:opacity-90 text-white py-4 rounded-xl font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowLeaderboard(false)}
          >
            <div 
              className="glass-hover card-glow rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-gold/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-gold/20 rounded-xl border border-gold/30">
                      <Trophy className="text-gold w-6 h-6" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white">Leaderboard</h3>
                  </div>
                  <button 
                    onClick={() => setShowLeaderboard(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                  >
                    <span className="text-gray-400 text-2xl">×</span>
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-6 md:p-8">
                <div className="space-y-3">
                  {leaderboardData.map((trader) => (
                    <div 
                      key={trader.rank}
                      className={`glass-hover rounded-xl p-4 md:p-6 border transition-all ${
                        trader.isCurrentUser 
                          ? 'border-royal/50 bg-royal/10' 
                          : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl ${
                          trader.rank === 1 ? 'bg-gradient-to-br from-gold to-gold-600 text-white' :
                          trader.rank === 2 ? 'bg-gradient-to-br from-gray-400 to-gray-500 text-white' :
                          trader.rank === 3 ? 'bg-gradient-to-br from-orange-600 to-orange-700 text-white' :
                          'bg-white/10 text-gray-400'
                        }`}>
                          #{trader.rank}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-white truncate">{trader.username}</p>
                            {trader.isCurrentUser && (
                              <span className="px-2 py-0.5 bg-royal/20 text-royal text-xs rounded-full border border-royal/30">You</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm">
                            <span className="text-gray-400">
                              <span className={trader.profit >= 0 ? 'text-profit font-semibold' : 'text-loss font-semibold'}>
                                ${trader.profit}
                              </span>
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-400">{trader.trades} trades</span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-400">{trader.winRate}% win rate</span>
                          </div>
                        </div>
                        
                        {trader.rank <= 3 && (
                          <Trophy className={`w-6 h-6 ${
                            trader.rank === 1 ? 'text-gold' :
                            trader.rank === 2 ? 'text-gray-400' :
                            'text-orange-600'
                          }`} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Violations Modal */}
        {showViolations && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowViolations(false)}
          >
            <div 
              className="glass-hover card-glow rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden border border-loss/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-loss/20 rounded-xl border border-loss/30">
                      <AlertTriangle className="text-loss w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl md:text-3xl font-bold text-white">Flagged Trades</h3>
                      <p className="text-sm text-gray-400 mt-1">{violationsData.length} rule violations</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowViolations(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                  >
                    <span className="text-gray-400 text-2xl">×</span>
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-6 md:p-8">
                <div className="space-y-4">
                  {violationsData.map((trade) => (
                    <div 
                      key={trade.id}
                      className="glass-hover rounded-xl p-4 md:p-6 border border-loss/30 bg-loss/5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 p-3 bg-loss/20 rounded-xl border border-loss/30">
                          <span className="text-2xl">🚩</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="font-bold text-white text-lg">{trade.pair}</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              trade.type === 'Buy' 
                                ? 'bg-profit/10 text-profit border border-profit/20' 
                                : 'bg-loss/10 text-loss border border-loss/20'
                            }`}>
                              {trade.type}
                            </span>
                            <span className="text-gray-500 text-sm">{trade.date}</span>
                          </div>
                          
                          <div className="bg-loss/10 border border-loss/20 rounded-lg p-3 mb-3">
                            <p className="text-white font-medium">{trade.violation}</p>
                          </div>
                          
                          <div className="flex flex-wrap gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Lots:</span>
                              <span className="text-white font-semibold ml-1">{trade.lots}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Profit:</span>
                              <span className={`font-semibold ml-1 ${trade.profit >= 0 ? 'text-profit' : 'text-loss'}`}>
                                ${trade.profit.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Status:</span>
                              <span className="text-loss font-semibold">Not Counted</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rules Modal */}
        {showRules && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowRules(false)}
          >
            <div 
              className="glass-hover card-glow rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden border border-royal/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                      <FileText className="text-royal w-6 h-6" />
                    </div>
                    <h3 className="text-2xl md:text-3xl font-bold text-white">Challenge Rules</h3>
                  </div>
                  <button 
                    onClick={() => setShowRules(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                  >
                    <span className="text-gray-400 text-2xl">×</span>
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-6 md:p-8">
                <div className="space-y-6">
                  <div className="glass rounded-xl p-6 border border-white/10">
                    <h4 className="text-lg font-bold text-white mb-4">Trading Rules</h4>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR1:</span>
                        <p className="text-gray-300">Maximum lot size per trade is 0.02 (2 Micro Lots)</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR2:</span>
                        <p className="text-gray-300">Maximum number of open trades at same time is 3</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR3:</span>
                        <p className="text-gray-300">All trades must have stop loss. Maximum allowed loss per trade is $5</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR4:</span>
                        <p className="text-gray-300">Cannot open same currency pair trades more than twice</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR5:</span>
                        <p className="text-gray-300">Cannot keep open position more than 24 hours</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR6:</span>
                        <p className="text-gray-300">Maximum allowed loss per day is $10. If you lose $10, skip that day</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR7:</span>
                        <p className="text-gray-300">Profits on trades against the rules will not be counted</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR8:</span>
                        <p className="text-gray-300">Cannot recharge your account</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR9:</span>
                        <p className="text-gray-300">Must be actively trading on at least 7 days of the challenge</p>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-royal font-bold">TR10:</span>
                        <p className="text-gray-300">Cannot trade on weekends</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-6 border border-white/10">
                    <h4 className="text-lg font-bold text-white mb-4">Important Notes</h4>
                    <div className="space-y-3 text-gray-300">
                      <p>• Qualified Profit = Gross Profit - Illegal Trade Profits</p>
                      <p>• Losses from illegal trades still count against your profit</p>
                      <p>• Only qualified profits are used for leaderboard rankings</p>
                      <p>• All trades are monitored in real-time</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Modal */}
        {showNotifications && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowNotifications(false)}
          >
            <div 
              className="glass-hover card-glow rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-white/20 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 md:p-8 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                      <Bell className="text-royal w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl md:text-3xl font-bold text-white">Notifications</h3>
                      <p className="text-sm text-gray-400 mt-1">3 unread messages</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                  >
                    <span className="text-gray-400 text-2xl">×</span>
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(80vh-140px)] p-6 md:p-8">
                <div className="space-y-4">
                  <div className="glass-hover rounded-xl p-4 border border-royal/30 bg-royal/5">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-2 h-2 bg-royal rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">Challenge Update</p>
                        <p className="text-gray-400 text-sm mb-2">You&apos;ve moved up to rank #12! Keep trading to reach the top 10.</p>
                        <p className="text-gray-500 text-xs">2 hours ago</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-hover rounded-xl p-4 border border-loss/30 bg-loss/5">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-2 h-2 bg-loss rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">Trade Flagged</p>
                        <p className="text-gray-400 text-sm mb-2">Your GBPUSD trade was flagged for exceeding lot size limit.</p>
                        <p className="text-gray-500 text-xs">5 hours ago</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass-hover rounded-xl p-4 border border-profit/30 bg-profit/5">
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 w-2 h-2 bg-profit rounded-full mt-2"></div>
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">Great Progress!</p>
                        <p className="text-gray-400 text-sm mb-2">You&apos;ve reached 50% of your target profit. Keep it up!</p>
                        <p className="text-gray-500 text-xs">1 day ago</p>
                      </div>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-4 border border-white/10">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">Challenge Started</p>
                        <p className="text-gray-400 text-sm mb-2">Challenge 15 - Hybrid has officially started. Good luck!</p>
                        <p className="text-gray-500 text-xs">2 days ago</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
