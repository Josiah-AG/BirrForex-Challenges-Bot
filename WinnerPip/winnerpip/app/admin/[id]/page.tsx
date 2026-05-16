"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Trophy, Users, AlertTriangle, Activity, TrendingUp, Target, Shield, Clock, BarChart3, FileText, X, Key, Loader2, ArrowRight, ChevronDown, ChevronUp, Zap } from "lucide-react";

export default function AdminDashboard() {
  const params = useParams();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "leaderboard" | "violations" | "pulls" | "screening" | "participants" | "rules">("overview");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [foundUser, setFoundUser] = useState<any>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [rulesConfig, setRulesConfig] = useState({
    max_lot_size: 0.02,
    max_open_trades: 3,
    pair_limit: 2,
    stop_loss_required: true,
    max_risk_dollars: 5,
    daily_loss_cap: 10,
    max_hold_hours: 24,
    weekend_trading: false,
    min_active_days: 7,
  });
  const [rulesSaved, setRulesSaved] = useState(false);

  // Lock scroll on modal
  useEffect(() => {
    if (selectedParticipant) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedParticipant]);

  const handleAdminLogin = () => {
    setLoginError(""); setLoginLoading(true);
    // Demo admin password — in production this comes from WINNERPIP_ADMIN_KEY env var
    if (adminPass === "admin2026") {
      localStorage.setItem("wp_admin", "true");
      setIsAdmin(true);
    } else {
      setLoginError("Invalid admin key");
    }
    setLoginLoading(false);
  };

  useState(() => { if (typeof window !== "undefined" && localStorage.getItem("wp_admin")) setIsAdmin(true); });

  const handleSearch = () => {
    setSearchPerformed(true);
    const q = searchQuery.trim().toLowerCase();
    // Placeholder: match "goldpipking", "87654321", "goldpip@gmail.com", "123456789"
    if (q.includes("gold") || q === "87654321" || q === "123456789" || q.includes("goldpip")) {
      setFoundUser({
        nickname: "GoldPipKing", username: "goldpipking", email: "goldpip@gmail.com",
        telegramId: 123456789, accountNumber: "87654321", accountType: "demo",
        server: "Exness-MT5Trial9", registeredAt: "May 3, 2026", rank: 1,
        balance: 58.50, qualifiedProfit: 28.50, grossProfit: 32.10, profitRemoved: 3.60,
        totalTrades: 34, qualifiedTrades: 31, flaggedTrades: 3, winRate: 71, avgRR: 2.3,
        totalLots: 0.68, activeDays: 8, lastPull: "May 14, 14:00", pullStatus: "success", partnerStatus: "OK",
        violations: ["TR1: Lot exceeded (May 10)", "TR1: Lot exceeded (May 12)", "TR5: Position >24h (May 8)"],
        recentTrades: [
          { symbol: "XAUUSD", type: "Buy", profit: 5.20, rr: 2.5, date: "May 14, 14:30", lots: 0.02 },
          { symbol: "EURUSD", type: "Sell", profit: 3.80, rr: 1.9, date: "May 14, 10:15", lots: 0.02 },
          { symbol: "GBPUSD", type: "Buy", profit: 4.10, rr: 2.1, date: "May 13, 16:00", lots: 0.02 },
          { symbol: "USDJPY", type: "Sell", profit: -1.50, rr: 0, date: "May 13, 09:30", lots: 0.02 },
          { symbol: "EURUSD", type: "Buy", profit: 2.90, rr: 1.4, date: "May 12, 14:20", lots: 0.02 },
        ],
      });
    } else {
      setFoundUser(null);
    }
  };

  // ==================== PLACEHOLDER DATA ====================
  const challenge = { id: params.id, title: "Challenge 15 — Hybrid", status: "active", type: "hybrid", startDate: "May 5, 2026", endDate: "May 16, 2026", daysLeft: 7, startingBalance: 30, targetBalance: 60 };

  const overview = {
    totalParticipants: 2847, demoParticipants: 1923, realParticipants: 924,
    totalTrades: 42580, avgTradesPerUser: 15, totalVolume: 851.6,
    totalViolations: 312, violationRate: 0.73,
    pullsToday: 4, pullsSuccess: 2835, pullsFailed: 12, passwordChanged: 3,
    avgBalance: 41.20, medianBalance: 38.50, aboveTarget: 89, qualifiedCount: 89,
    lastPullTime: "14:00 EAT", nextPullTime: "18:00 EAT",
  };

  const topViolations = [
    { rule: "TR1: Lot size exceeded", count: 142, percentage: 45.5 },
    { rule: "TR5: Position > 24 hours", count: 87, percentage: 27.9 },
    { rule: "TR4: Same pair > 2 times", count: 45, percentage: 14.4 },
    { rule: "TR6: Hedging detected", count: 22, percentage: 7.1 },
    { rule: "TR3: No stop loss", count: 16, percentage: 5.1 },
  ];

  const pullHistory = [
    { time: "14:00", success: 2835, failed: 12, passwordChanged: 1, newTrades: 1240, duration: "8m 32s" },
    { time: "10:00", success: 2840, failed: 7, passwordChanged: 2, newTrades: 980, duration: "7m 45s" },
    { time: "06:00", success: 2842, failed: 5, passwordChanged: 0, newTrades: 420, duration: "7m 12s" },
    { time: "02:00", success: 2844, failed: 3, passwordChanged: 0, newTrades: 85, duration: "6m 58s" },
  ];

  const terminalStatus = [
    { id: 1, healthy: true, processed: 285, success: 283, failed: 2, avgTime: "1.8s", lastError: null },
    { id: 2, healthy: true, processed: 285, success: 284, failed: 1, avgTime: "1.6s", lastError: null },
    { id: 3, healthy: true, processed: 285, success: 285, failed: 0, avgTime: "1.7s", lastError: null },
    { id: 4, healthy: true, processed: 284, success: 282, failed: 2, avgTime: "1.9s", lastError: null },
    { id: 5, healthy: true, processed: 285, success: 284, failed: 1, avgTime: "1.5s", lastError: null },
    { id: 6, healthy: false, processed: 142, success: 139, failed: 3, avgTime: "2.4s", lastError: "Connection reset after 142 accounts" },
    { id: 7, healthy: true, processed: 285, success: 283, failed: 2, avgTime: "1.8s", lastError: null },
    { id: 8, healthy: true, processed: 285, success: 285, failed: 0, avgTime: "1.6s", lastError: null },
    { id: 9, healthy: true, processed: 284, success: 283, failed: 1, avgTime: "1.7s", lastError: null },
    { id: 10, healthy: true, processed: 285, success: 285, failed: 0, avgTime: "1.5s", lastError: null },
  ];

  const recentPullErrors = [
    { account: "44556677", nickname: "PipSniper", error: "Timeout after 30s", terminal: 6, time: "14:02" },
    { account: "99887766", nickname: "ScalpMaster", error: "Invalid credentials", terminal: 1, time: "14:01" },
    { account: "33221100", nickname: "NewTrader", error: "Server not responding", terminal: 6, time: "14:01" },
    { account: "77665544", nickname: "QuickFX", error: "Timeout after 30s", terminal: 4, time: "14:00" },
    { account: "11009988", nickname: "DemoKing", error: "Invalid credentials", terminal: 2, time: "10:03" },
  ];

  const leaderboard = [
    { rank: 1, nickname: "GoldPipKing", balance: 58.50, trades: 34, winRate: 71, avgRR: 2.3, violations: 0, accountType: "demo" },
    { rank: 2, nickname: "ForexEagle", balance: 55.80, trades: 29, winRate: 69, avgRR: 2.1, violations: 1, accountType: "real" },
    { rank: 3, nickname: "SilentTrader", balance: 53.40, trades: 31, winRate: 65, avgRR: 1.9, violations: 0, accountType: "demo" },
    { rank: 4, nickname: "PipMachine", balance: 51.90, trades: 27, winRate: 67, avgRR: 1.7, violations: 2, accountType: "real" },
    { rank: 5, nickname: "AlphaFX", balance: 50.10, trades: 25, winRate: 64, avgRR: 1.6, violations: 0, accountType: "demo" },
    { rank: 6, nickname: "NightOwl", balance: 49.50, trades: 30, winRate: 60, avgRR: 1.5, violations: 1, accountType: "demo" },
    { rank: 7, nickname: "ScalpMaster", balance: 48.80, trades: 42, winRate: 62, avgRR: 1.2, violations: 3, accountType: "real" },
    { rank: 8, nickname: "TrendRider", balance: 47.60, trades: 22, winRate: 68, avgRR: 2.0, violations: 0, accountType: "demo" },
    { rank: 9, nickname: "SwingKing", balance: 46.90, trades: 18, winRate: 72, avgRR: 2.4, violations: 0, accountType: "real" },
    { rank: 10, nickname: "PipSniper", balance: 46.20, trades: 26, winRate: 58, avgRR: 1.3, violations: 1, accountType: "demo" },
  ];

  const flaggedParticipants = [
    { nickname: "ScalpMaster", account: "99887766", violations: 3, totalProfit: 18.80, profitRemoved: 8.40, rules: ["TR1 x2", "TR5 x1"] },
    { nickname: "PipMachine", account: "55443322", violations: 2, totalProfit: 21.90, profitRemoved: 5.20, rules: ["TR4 x1", "TR6 x1"] },
    { nickname: "ForexEagle", account: "11223344", violations: 1, totalProfit: 25.80, profitRemoved: 3.10, rules: ["TR1 x1"] },
    { nickname: "NightOwl", account: "66778899", violations: 1, totalProfit: 19.50, profitRemoved: 2.80, rules: ["TR5 x1"] },
    { nickname: "PipSniper", account: "44556677", violations: 1, totalProfit: 16.20, profitRemoved: 1.90, rules: ["TR3 x1"] },
  ];

  // ==================== ADMIN LOGIN GATE ====================
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e1a] relative">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-loss/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }}></div>
        </div>
        <div className="w-full max-w-sm relative">
          <div className="glass rounded-3xl border border-white/10 p-8 text-center">
            <Shield className="w-12 h-12 text-royal mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Admin Access</h2>
            <p className="text-gray-400 text-sm mb-6">Enter admin key for Challenge {params.id}</p>
            {loginError && <div className="p-3 rounded-xl bg-loss/10 border border-loss/30 mb-4"><p className="text-sm text-loss">{loginError}</p></div>}
            <div className="space-y-4">
              <Input type="password" placeholder="Admin key" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()} />
              <button onClick={handleAdminLogin} disabled={loginLoading || !adminPass} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold disabled:opacity-50">
                {loginLoading ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />} Access Dashboard
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-4">Demo key: <code className="text-gray-400">admin2026</code></p>
          </div>
        </div>
      </div>
    );
  }

  // ==================== ADMIN DASHBOARD ====================
  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-white/5">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image src="/winnerpip-icon.png" alt="WinnerPip" width={32} height={32} className="rounded-lg" />
              <div><p className="text-sm font-bold text-white">{challenge.title}</p><p className="text-xs text-royal font-semibold">ADMIN PANEL</p></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-profit/20 text-profit text-xs font-semibold border border-profit/30">● Live</span>
              <span className="text-xs text-gray-500">{challenge.daysLeft}d left</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl relative">
        {/* NAV TABS */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto">
          {(["overview", "leaderboard", "violations", "pulls", "screening", "participants", "rules"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSection(tab)} className={`flex-shrink-0 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all capitalize ${activeSection === tab ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{tab}</button>
          ))}
        </div>

        {/* ==================== OVERVIEW ==================== */}
        {activeSection === "overview" && (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<Users size={16} />} label="Participants" value={overview.totalParticipants.toLocaleString()} sub={`Demo: ${overview.demoParticipants} | Real: ${overview.realParticipants}`} color="text-royal" />
            <StatCard icon={<Activity size={16} />} label="Total Trades" value={overview.totalTrades.toLocaleString()} sub={`Avg ${overview.avgTradesPerUser}/user • ${overview.totalVolume} lots`} color="text-white" />
            <StatCard icon={<AlertTriangle size={16} />} label="Violations" value={overview.totalViolations.toString()} sub={`${overview.violationRate}% violation rate`} color="text-loss" />
            <StatCard icon={<Trophy size={16} />} label="Above Target" value={overview.aboveTarget.toString()} sub={`${((overview.aboveTarget / overview.totalParticipants) * 100).toFixed(1)}% qualified`} color="text-gold" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<Target size={16} />} label="Avg Balance" value={`$${overview.avgBalance}`} sub={`Median: $${overview.medianBalance}`} color="text-profit" />
            <StatCard icon={<Zap size={16} />} label="Pulls Today" value={overview.pullsToday.toString()} sub={`Next: ${overview.nextPullTime}`} color="text-royal" />
            <StatCard icon={<Shield size={16} />} label="Pull Success" value={overview.pullsSuccess.toString()} sub={`Failed: ${overview.pullsFailed} | PW Changed: ${overview.passwordChanged}`} color="text-profit" />
            <StatCard icon={<Clock size={16} />} label="Last Pull" value={overview.lastPullTime} sub="All terminals healthy" color="text-gray-300" />
          </div>

          {/* Top Violations Breakdown */}
          <div className="glass rounded-2xl border border-white/10 p-5 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Top Rule Violations</h3>
            <div className="space-y-3">
              {topViolations.map((v, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1"><span className="text-sm text-gray-300">{v.rule}</span><span className="text-xs text-gray-500">{v.count} ({v.percentage}%)</span></div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-loss/60 rounded-full" style={{ width: `${v.percentage}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>)}

        {/* ==================== LEADERBOARD ==================== */}
        {activeSection === "leaderboard" && (
          <div className="glass rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Trophy size={16} className="text-gold" /> Full Leaderboard (Top 10)</h3>
              <span className="text-xs text-gray-500">Ranked by balance</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">#</th>
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Nickname</th>
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-400 uppercase">Balance</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Trades</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Win%</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Avg RR</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Violations</th>
                </tr></thead>
                <tbody>{leaderboard.map(e => (
                  <tr key={e.rank} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setSelectedParticipant(e)}>
                    <td className="py-3 px-4"><span className={`text-sm font-bold ${e.rank <= 3 ? "text-gold" : "text-gray-400"}`}>{e.rank}</span></td>
                    <td className="py-3 px-4 text-sm text-white font-semibold">{e.nickname}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-[10px] font-semibold ${e.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{e.accountType}</span></td>
                    <td className="py-3 px-4 text-right text-sm font-bold text-white">${e.balance.toFixed(2)}</td>
                    <td className="py-3 px-4 text-center text-sm text-gray-400">{e.trades}</td>
                    <td className="py-3 px-4 text-center text-sm text-gray-400">{e.winRate}%</td>
                    <td className="py-3 px-4 text-center text-sm text-royal">{e.avgRR.toFixed(1)}R</td>
                    <td className="py-3 px-4 text-center">{e.violations > 0 ? <span className="text-loss font-bold">{e.violations}</span> : <span className="text-profit">✓</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== VIOLATIONS ==================== */}
        {activeSection === "violations" && (
          <div className="space-y-4">
            <div className="glass rounded-2xl border border-loss/20 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Participants with Violations</h3>
              <div className="space-y-3">
                {flaggedParticipants.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-loss/30 transition-all">
                    <div>
                      <p className="text-white font-semibold">{p.nickname}</p>
                      <p className="text-xs text-gray-500">Acct: {p.account} • {p.rules.join(", ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-loss font-bold">{p.violations} flags</p>
                      <p className="text-xs text-gray-500">-${p.profitRemoved.toFixed(2)} removed</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== PULL HISTORY + TERMINALS ==================== */}
        {activeSection === "pulls" && (
          <div className="space-y-6">
            {/* Terminal Health Grid */}
            <div className="glass rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Zap size={16} className="text-royal" /> Terminal Health (10 Slots)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {terminalStatus.map(t => (
                  <div key={t.id} className={`rounded-xl p-3 border ${t.healthy ? "bg-profit/5 border-profit/20" : "bg-loss/5 border-loss/20"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white">T{t.id}</span>
                      <span className={`w-2 h-2 rounded-full ${t.healthy ? "bg-profit animate-pulse" : "bg-loss"}`}></span>
                    </div>
                    <p className="text-[10px] text-gray-400">{t.processed} processed</p>
                    <p className="text-[10px] text-gray-400">{t.success}✓ {t.failed}✗</p>
                    <p className="text-[10px] text-gray-500">Avg: {t.avgTime}</p>
                    {t.lastError && <p className="text-[10px] text-loss mt-1 truncate">{t.lastError}</p>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>{terminalStatus.filter(t => t.healthy).length}/10 healthy</span>
                <span>Unhealthy terminals auto-recover after 10 min</span>
              </div>
            </div>

            {/* Pull Batch History */}
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5"><h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clock size={16} className="text-royal" /> Pull Batch History (Today)</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px]">
                  <thead><tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Time (EAT)</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Success</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Failed</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">PW Changed</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">New Trades</th>
                    <th className="text-right py-3 px-4 text-[10px] text-gray-400 uppercase">Duration</th>
                  </tr></thead>
                  <tbody>{pullHistory.map((p, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-sm text-white font-semibold">{p.time}</td>
                      <td className="py-3 px-4 text-center text-sm text-profit">{p.success}</td>
                      <td className="py-3 px-4 text-center text-sm text-loss">{p.failed}</td>
                      <td className="py-3 px-4 text-center text-sm text-gold">{p.passwordChanged}</td>
                      <td className="py-3 px-4 text-center text-sm text-gray-300">{p.newTrades}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-400">{p.duration}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>

            {/* Recent Pull Errors */}
            <div className="glass rounded-2xl border border-loss/20 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Recent Pull Errors</h3>
              <div className="space-y-2">
                {recentPullErrors.map((e, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-semibold">{e.nickname}</p>
                        <span className="text-[10px] text-gray-500">#{e.account}</span>
                      </div>
                      <p className="text-xs text-loss">{e.error}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">T{e.terminal}</p>
                      <p className="text-[10px] text-gray-500">{e.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pull Performance Summary */}
            <div className="glass rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 size={16} className="text-royal" /> Performance Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Avg Cycle Time</p><p className="text-lg font-bold text-white">7m 37s</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Success Rate</p><p className="text-lg font-bold text-profit">99.6%</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Avg Per Account</p><p className="text-lg font-bold text-white">1.7s</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Total Trades Synced</p><p className="text-lg font-bold text-royal">42,580</p></div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PARTICIPANTS (Find User + Export) ==================== */}
        {activeSection === "participants" && (
          <div className="space-y-6">
            {/* Search Bar */}
            <div className="glass rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-royal" /> Find User</h3>
              <div className="flex gap-3">
                <Input placeholder="Username, email, account #, or Telegram ID" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} className="flex-1" />
                <button onClick={handleSearch} className="px-5 py-2 bg-gradient-brand hover:opacity-90 text-white rounded-xl font-semibold text-sm">Search</button>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">Try: &quot;goldpipking&quot; or &quot;87654321&quot; or &quot;goldpip@gmail.com&quot;</p>
            </div>

            {searchPerformed && !foundUser && (
              <div className="glass rounded-2xl border border-white/10 p-8 text-center"><Users className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">No user found for &quot;{searchQuery}&quot;</p></div>
            )}

            {foundUser && (
              <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1"><p className="text-xl font-bold text-white">{foundUser.nickname}</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${foundUser.accountType === "real" ? "bg-gold/20 text-gold" : "bg-royal/20 text-royal"}`}>{foundUser.accountType}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-profit/20 text-profit">Rank #{foundUser.rank}</span></div>
                    <p className="text-sm text-gray-400">@{foundUser.username} • {foundUser.email}</p>
                  </div>
                  <button onClick={() => { setFoundUser(null); setSearchPerformed(false); setSearchQuery(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Balance</p><p className="text-lg font-bold text-white">${foundUser.balance.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Qualified Profit</p><p className="text-lg font-bold text-profit">${foundUser.qualifiedProfit.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Profit Removed</p><p className="text-lg font-bold text-loss">${foundUser.profitRemoved.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Win Rate</p><p className="text-lg font-bold text-white">{foundUser.winRate}%</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{foundUser.totalTrades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Avg RR</p><p className="text-lg font-bold text-royal">{foundUser.avgRR.toFixed(1)}R</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${foundUser.flaggedTrades > 0 ? "text-loss" : "text-profit"}`}>{foundUser.flaggedTrades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Active Days</p><p className="text-lg font-bold text-white">{foundUser.activeDays}</p></div>
                </div>
                <div className="px-5 pb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Account #</p><p className="text-sm font-semibold text-white">{foundUser.accountNumber}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Server</p><p className="text-sm font-semibold text-white">{foundUser.server}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Telegram ID</p><p className="text-sm font-semibold text-white">{foundUser.telegramId}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Registered</p><p className="text-sm font-semibold text-white">{foundUser.registeredAt}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Last Pull</p><p className="text-sm font-semibold text-white">{foundUser.lastPull}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Partner</p><p className="text-sm font-semibold text-profit">{foundUser.partnerStatus}</p></div>
                </div>
                {foundUser.violations.length > 0 && (<div className="px-5 pb-3"><p className="text-xs font-semibold text-loss mb-2">Violations ({foundUser.violations.length})</p><div className="space-y-1">{foundUser.violations.map((v: string, i: number) => (<div key={i} className="flex items-center gap-2 p-2 bg-loss/5 rounded-lg border border-loss/10"><AlertTriangle size={12} className="text-loss flex-shrink-0" /><p className="text-xs text-gray-300">{v}</p></div>))}</div></div>)}
                <div className="px-5 pb-3"><p className="text-xs font-semibold text-gray-300 mb-2">Recent Trades</p><div className="space-y-2">{foundUser.recentTrades.map((t: any, i: number) => (<div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"><div className="flex items-center gap-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span><div><p className="text-sm text-white font-semibold">{t.symbol}</p><p className="text-[10px] text-gray-500">{t.date} • {t.lots} lots</p></div></div><div className="text-right"><p className={`text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>${t.profit.toFixed(2)}</p><p className="text-[10px] text-gray-500">{t.rr > 0 ? `${t.rr.toFixed(1)}R` : "SL"}</p></div></div>))}</div></div>
                <div className="p-5 border-t border-white/10"><button onClick={() => alert(`Exporting MT5 data for ${foundUser.nickname} (${foundUser.accountNumber})...\n\nIn production: triggers VPS pull + CSV download.`)} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-royal/20 border border-royal/30 hover:bg-royal/30 text-royal font-semibold transition-all"><FileText size={18} />Export User Data &amp; MT5 Trades (CSV)</button></div>
              </div>
            )}

            {!foundUser && !searchPerformed && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Total</p><p className="text-2xl font-bold text-white">{overview.totalParticipants}</p></div>
                <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Demo</p><p className="text-2xl font-bold text-royal">{overview.demoParticipants}</p></div>
                <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Real</p><p className="text-2xl font-bold text-gold">{overview.realParticipants}</p></div>
                <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Qualified</p><p className="text-2xl font-bold text-profit">{overview.qualifiedCount}</p></div>
              </div>
            )}
          </div>
        )}

        {/* ==================== SCREENING (Allocation/Partner Checks) ==================== */}
        {activeSection === "screening" && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={<Shield size={16} />} label="Total Screened" value="2,847" sub="Last check: Today 22:00" color="text-royal" />
              <StatCard icon={<AlertTriangle size={16} />} label="Partner Changing" value="4" sub="2 Real, 2 Demo" color="text-gold" />
              <StatCard icon={<X size={16} />} label="Left BirrForex" value="2" sub="Auto-disqualified" color="text-loss" />
              <StatCard icon={<Shield size={16} />} label="Warnings Cleared" value="6" sub="Returned to BirrForex" color="text-profit" />
            </div>

            {/* Currently Changing */}
            <div className="glass rounded-2xl border border-gold/20 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-gold" /> Currently Changing Partner (Warned)</h3>
              <div className="space-y-3">
                {[
                  { username: "trader_mike", email: "mike@gmail.com", account: "11223344", type: "real", warnedAt: "May 13, 22:00" },
                  { username: "fx_queen", email: "queen.fx@yahoo.com", account: "55667788", type: "demo", warnedAt: "May 13, 22:00" },
                  { username: "pip_lord", email: "piplord99@gmail.com", account: "99001122", type: "real", warnedAt: "May 12, 22:00" },
                  { username: "scalp_pro", email: "scalppro@outlook.com", account: "33445566", type: "demo", warnedAt: "May 12, 22:00" },
                ].map((u, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gold/5 rounded-xl border border-gold/20">
                    <div>
                      <p className="text-white font-semibold text-sm">@{u.username}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                      <p className="text-[10px] text-gray-600">Acct: {u.account} • {u.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gold font-semibold">⚠️ Warned</p>
                      <p className="text-[10px] text-gray-500">{u.warnedAt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Disqualified */}
            <div className="glass rounded-2xl border border-loss/20 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><X size={16} className="text-loss" /> Disqualified (Left BirrForex)</h3>
              <div className="space-y-3">
                {[
                  { username: "bad_trader", email: "badtrader@gmail.com", account: "77889900", type: "real", dqAt: "May 14, 09:00", reason: "Partner changed from BirrForex" },
                  { username: "gone_user", email: "goneuser@yahoo.com", account: "12345000", type: "demo", dqAt: "May 12, 09:00", reason: "Partner changed from BirrForex" },
                ].map((u, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-loss/5 rounded-xl border border-loss/20">
                    <div>
                      <p className="text-white font-semibold text-sm">@{u.username}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                      <p className="text-[10px] text-gray-600">Acct: {u.account} • {u.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-loss font-semibold">🚫 Disqualified</p>
                      <p className="text-[10px] text-gray-500">{u.dqAt}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Screening History */}
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5"><h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clock size={16} className="text-royal" /> Screening History (Last 7 Days)</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead><tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Date</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Screened</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">All Good</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Changing</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Left</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Cleared</th>
                  </tr></thead>
                  <tbody>
                    {[
                      { date: "May 14", screened: 2847, good: 2841, changing: 4, left: 0, cleared: 2 },
                      { date: "May 13", screened: 2845, good: 2837, changing: 6, left: 2, cleared: 0 },
                      { date: "May 12", screened: 2843, good: 2835, changing: 6, left: 0, cleared: 2 },
                      { date: "May 11", screened: 2840, good: 2832, changing: 8, left: 0, cleared: 0 },
                      { date: "May 10", screened: 2838, good: 2830, changing: 8, left: 0, cleared: 0 },
                      { date: "May 9", screened: 2835, good: 2827, changing: 8, left: 0, cleared: 0 },
                      { date: "May 8", screened: 2830, good: 2822, changing: 8, left: 0, cleared: 0 },
                    ].map((r, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-sm text-white font-semibold">{r.date}</td>
                        <td className="py-3 px-4 text-center text-sm text-gray-300">{r.screened}</td>
                        <td className="py-3 px-4 text-center text-sm text-profit">{r.good}</td>
                        <td className="py-3 px-4 text-center text-sm text-gold">{r.changing}</td>
                        <td className="py-3 px-4 text-center text-sm text-loss">{r.left}</td>
                        <td className="py-3 px-4 text-center text-sm text-profit">{r.cleared}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== RULES TAB (Form-based) ==================== */}
      {activeSection === "rules" && (
        <div className="container mx-auto px-4 max-w-7xl relative">
          <div className="glass rounded-2xl border border-white/10 p-5">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><FileText size={16} className="text-royal" /> Challenge Rules Configuration</h3>
            <p className="text-xs text-gray-500 mb-6">Set the rules for this challenge. Users will see these on their dashboard. Leave fields empty for unlimited.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Max Lot Size */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Max Lot Size</label>
                <Input type="number" step="0.01" placeholder="e.g., 0.02 (empty = unlimited)" value={rulesConfig.max_lot_size || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_lot_size: e.target.value ? parseFloat(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Trades exceeding this lot size will have profits removed</p>
              </div>

              {/* Max Open Trades */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Max Open Trades</label>
                <Input type="number" placeholder="e.g., 3 (empty = unlimited)" value={rulesConfig.max_open_trades || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_open_trades: e.target.value ? parseInt(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Maximum trades open at the same time</p>
              </div>

              {/* Pair Limit */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Pair Limit (Simultaneous)</label>
                <Input type="number" placeholder="e.g., 2 (empty = unlimited)" value={rulesConfig.pair_limit || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, pair_limit: e.target.value ? parseInt(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Max same-pair trades open at the same time</p>
              </div>

              {/* Max Risk Dollars */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Max Risk per Trade ($)</label>
                <Input type="number" step="0.5" placeholder="e.g., 5 (empty = no limit)" value={rulesConfig.max_risk_dollars || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_risk_dollars: e.target.value ? parseFloat(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Maximum SL distance in dollars</p>
              </div>

              {/* Daily Loss Cap */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Daily Loss Cap ($)</label>
                <Input type="number" step="1" placeholder="e.g., 10 (empty = no cap)" value={rulesConfig.daily_loss_cap || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, daily_loss_cap: e.target.value ? parseFloat(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Max drawdown from day&apos;s opening balance. Profits after breach are removed.</p>
              </div>

              {/* Trading Duration */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Max Trade Duration (hours)</label>
                <Input type="number" placeholder="e.g., 24 (empty = unlimited)" value={rulesConfig.max_hold_hours || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_hold_hours: e.target.value ? parseInt(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Trades held longer will have profits removed</p>
              </div>

              {/* Active Trading Days */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Min Active Trading Days</label>
                <Input type="number" placeholder="e.g., 7" value={rulesConfig.min_active_days || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, min_active_days: e.target.value ? parseInt(e.target.value) : 0 })} />
                <p className="text-[10px] text-gray-500">Minimum days user must trade to qualify for prizes</p>
              </div>

              {/* Toggles */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div><p className="text-sm text-white font-medium">Stop Loss Required</p><p className="text-[10px] text-gray-500">All trades must have SL</p></div>
                  <button onClick={() => setRulesConfig({ ...rulesConfig, stop_loss_required: !rulesConfig.stop_loss_required })} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.stop_loss_required ? "bg-profit" : "bg-white/20"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.stop_loss_required ? "translate-x-6" : "translate-x-0.5"}`}></div>
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div><p className="text-sm text-white font-medium">Weekend Trading</p><p className="text-[10px] text-gray-500">Allow trading on weekends</p></div>
                  <button onClick={() => setRulesConfig({ ...rulesConfig, weekend_trading: !rulesConfig.weekend_trading })} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.weekend_trading ? "bg-profit" : "bg-white/20"}`}>
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div>
                  </button>
                </div>
              </div>
            </div>

            {/* Fixed rules info */}
            <div className="mt-6 p-4 bg-royal/10 border border-royal/20 rounded-xl">
              <p className="text-xs text-gray-300 font-semibold mb-2">Always enforced (shown to users):</p>
              <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                <li>No recharging (additional deposits) during the challenge</li>
                <li>Unlimited trades per day — as long as all rules are followed</li>
                <li>No leverage limit</li>
                <li>Trades against rules have profits disqualified (losses still count)</li>
                <li>Cent accounts: thresholds adjusted automatically (÷100)</li>
              </ul>
            </div>

            {/* Save */}
            <div className="mt-6 flex justify-end">
              <button onClick={() => { setRulesSaved(true); setTimeout(() => setRulesSaved(false), 3000); }} className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all ${rulesSaved ? "bg-profit/20 text-profit border border-profit/30" : "bg-gradient-brand hover:opacity-90 text-white shadow-lg shadow-royal/20"}`}>
                {rulesSaved ? "✓ Rules Saved" : "Save Rules"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PARTICIPANT DETAIL MODAL ==================== */}
      {selectedParticipant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setSelectedParticipant(null)}>
          <div className="glass rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white">{selectedParticipant.nickname}</h3>
              <button onClick={() => setSelectedParticipant(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Rank</p><p className="text-2xl font-bold gradient-text">#{selectedParticipant.rank}</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Balance</p><p className="text-2xl font-bold text-white">${selectedParticipant.balance.toFixed(2)}</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Win Rate</p><p className="text-lg font-bold text-white">{selectedParticipant.winRate}%</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Avg RR</p><p className="text-lg font-bold text-royal">{selectedParticipant.avgRR.toFixed(1)}R</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{selectedParticipant.trades}</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Violations</p><p className={`text-lg font-bold ${selectedParticipant.violations > 0 ? "text-loss" : "text-profit"}`}>{selectedParticipant.violations}</p></div>
              </div>
              <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><span className={`px-3 py-1 rounded text-xs font-semibold ${selectedParticipant.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{selectedParticipant.accountType}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 border border-white/10">
      <div className={`flex items-center gap-2 mb-2 ${color}`}>{icon}<p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p></div>
      <p className={`text-2xl md:text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
