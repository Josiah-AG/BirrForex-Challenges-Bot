"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { TrendingUp, Trophy, AlertTriangle, Target, Activity, ArrowLeft, FileText, Clock, ChevronDown, ChevronUp, Shield, Award, Hash, Key, Loader2, MessageCircle, ArrowRight, X, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ==================== TYPES ====================
interface Trade {
  ticket: number; symbol: string; type: string; volume: number;
  openPrice: number; closePrice: number; openTime: string; closeTime: string;
  profit: number; commission: number; swap: number;
  isQualified: boolean; violations: string[];
}
interface LeaderboardEntry {
  nickname: string; accountType: string; rank: number;
  currentBalance: number; adjustedBalance: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  totalTrades: number; qualifiedTrades: number; flaggedTrades: number;
  isQualified: boolean; lastTradeTime: string | null; lastUpdated: string | null;
  isMe?: boolean;
}
interface ChallengeInfo {
  id: number; title: string; status: string;
  startDate: string; endDate: string;
  startingBalance: number; targetBalance: number;
}
interface MyStats {
  nickname: string; accountNumber: string; accountType: string; server: string;
  rank: number | null; currentBalance: number; adjustedBalance: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  totalTrades: number; qualifiedTrades: number; flaggedTrades: number;
  isQualified: boolean; lastUpdated: string | null;
}

export default function ChallengeDashboard() {
  const params = useParams();
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "leaderboard" | "violations">("trades");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginAccount, setLoginAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  const [myStats, setMyStats] = useState<MyStats | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Check auth on mount
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("wp_token")) {
      setIsLoggedIn(true);
    } else {
      setLoading(false);
    }
  }, []);

  // Fetch dashboard data when logged in
  const fetchDashboard = useCallback(async () => {
    const token = localStorage.getItem("wp_token");
    if (!token) { setLoading(false); return; }

    try {
      const res = await fetch(`${API_URL}/api/me/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        localStorage.removeItem("wp_token");
        localStorage.removeItem("wp_user");
        setIsLoggedIn(false);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Failed to load dashboard data. Please try again.");
        setLoading(false);
        return;
      }

      const data = await res.json();

      setChallenge(data.challenge);
      setMyStats({
        nickname: data.me.nickname,
        accountNumber: data.me.accountNumber,
        accountType: data.me.accountType,
        server: data.me.server,
        rank: data.me.rank,
        currentBalance: data.me.currentBalance,
        adjustedBalance: data.me.adjustedBalance,
        qualifiedProfit: data.me.qualifiedProfit,
        grossProfit: data.me.grossProfit,
        profitRemoved: data.me.profitRemoved,
        totalTrades: data.me.totalTrades,
        qualifiedTrades: data.me.qualifiedTrades,
        flaggedTrades: data.me.flaggedTrades,
        isQualified: data.me.isQualified,
        lastUpdated: data.me.lastUpdated,
      });
      setRecentTrades(data.recentTrades || []);
      setError("");
    } catch {
      setError("Unable to connect to server. Please check your connection.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isLoggedIn) fetchDashboard();
  }, [isLoggedIn, fetchDashboard]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    if (!params.id) return;
    setLeaderboardLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/challenges/${params.id}/leaderboard`);
      if (res.ok) {
        const data = await res.json();
        const entries: LeaderboardEntry[] = (data.leaderboard || []).map((entry: LeaderboardEntry) => ({
          ...entry,
          isMe: myStats ? entry.nickname === myStats.nickname : false,
        }));
        setLeaderboard(entries);
      }
    } catch {
      // Silently fail for leaderboard
    }
    setLeaderboardLoading(false);
  }, [params.id, myStats]);

  useEffect(() => {
    if (isLoggedIn && challenge) fetchLeaderboard();
  }, [isLoggedIn, challenge, fetchLeaderboard]);

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

  const handleLogin = async () => {
    setLoginError(""); setLoginLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_number: loginAccount, investor_password: loginPassword }),
      });
      if (res.ok) {
        const d = await res.json();
        localStorage.setItem("wp_token", d.token);
        if (d.user) localStorage.setItem("wp_user", JSON.stringify(d.user));
        setIsLoggedIn(true); setShowLogin(false);
      } else {
        setLoginError("This account and password are not registered. Check credentials or register first.");
      }
    } catch {
      setLoginError("Unable to connect. Please try again.");
    }
    setLoginLoading(false);
  };

  const botUsername = "birrforex_challenge_bot";

  // Computed values
  const violations = recentTrades.filter(t => !t.isQualified);
  const daysLeft = challenge ? Math.max(0, Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const progressPercent = challenge && myStats ? Math.min(100, Math.max(0, ((myStats.currentBalance - challenge.startingBalance) / (challenge.targetBalance - challenge.startingBalance)) * 100)) : 0;
  const totalParticipants = leaderboard.length;

  // Format date helper
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Determine challenge state
  const isNotStarted = challenge && (challenge.status === "registration_open" || challenge.status === "draft");
  const isActive = challenge && challenge.status === "active";
  const isCompleted = challenge && (challenge.status === "completed" || challenge.status === "submission_open" || challenge.status === "reviewing");
  const hasNoData = myStats && myStats.totalTrades === 0 && isActive;

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
                  <p className="text-sm font-bold text-white leading-tight">{challenge?.title || "Challenge Dashboard"}</p>
                  <p className="text-xs text-gray-500">{myStats?.nickname || ""}{myStats?.accountNumber ? ` • #${myStats.accountNumber}` : ""}</p>
                </div>
              </div>
            </div>
            {isLoggedIn && <button onClick={() => setShowRules(true)} className="flex items-center gap-2 px-3 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all text-sm"><FileText size={14} /><span className="hidden sm:inline">Rules</span></button>}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl relative">

        {/* LOADING STATE */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-royal animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Loading dashboard...</p>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && isLoggedIn && (
          <div className="max-w-md mx-auto py-12">
            <div className="glass rounded-3xl border border-loss/20 p-8 text-center">
              <AlertTriangle className="w-12 h-12 text-loss mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
              <p className="text-gray-400 text-sm mb-6">{error}</p>
              <button onClick={() => { setLoading(true); setError(""); fetchDashboard(); }} className="flex items-center justify-center gap-2 mx-auto px-6 py-3 rounded-xl bg-royal/20 border border-royal/30 text-royal font-semibold text-sm hover:bg-royal/30 transition-all">
                <RefreshCw size={16} /> Try Again
              </button>
            </div>
          </div>
        )}

        {/* AUTH GATE */}
        {!loading && !isLoggedIn && !showLogin && (
          <div className="max-w-md mx-auto py-12">
            <div className="glass rounded-3xl border border-white/10 p-8 text-center">
              <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Challenge Dashboard</h2>
              <p className="text-gray-400 text-sm mb-8">Sign in to view your dashboard or register to join</p>
              <div className="space-y-3">
                <button onClick={() => setShowLogin(true)} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold transition-all shadow-lg shadow-royal/20"><Key size={18} />Sign In with Account</button>
                <a href={`https://t.me/${botUsername}?start=tc_register_${params.id}`} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-[#2AABEE]/20 border border-[#2AABEE]/30 hover:bg-[#2AABEE]/30 text-[#2AABEE] font-semibold transition-all"><MessageCircle size={18} />Register via Telegram</a>
              </div>
            </div>
          </div>
        )}

        {/* LOGIN FORM */}
        {!loading && !isLoggedIn && showLogin && (
          <div className="max-w-md mx-auto py-12">
            <div className="glass rounded-3xl border border-white/10 p-8">
              <button onClick={() => setShowLogin(false)} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
              <h2 className="text-2xl font-bold text-white mb-2">Sign In</h2>
              <p className="text-gray-400 text-sm mb-6">Enter your MT5 credentials</p>
              {loginError && <div className="p-3 rounded-xl bg-loss/10 border border-loss/30 mb-4"><p className="text-sm text-loss">{loginError}</p></div>}
              <div className="space-y-4">
                <div><label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2"><Hash size={14} className="text-royal" />Account Number</label><Input type="text" inputMode="numeric" placeholder="e.g., 12345678" value={loginAccount} onChange={(e) => setLoginAccount(e.target.value.replace(/\D/g, ""))} /></div>
                <div><label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2"><Key size={14} className="text-royal" />Investor Password</label><Input type="password" placeholder="Your investor password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></div>
                <button onClick={handleLogin} disabled={loginLoading || !loginAccount || !loginPassword} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold transition-all shadow-lg shadow-royal/20 disabled:opacity-50">{loginLoading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}{loginLoading ? "Signing in..." : "Sign In"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== NOT STARTED STATE ==================== */}
        {!loading && !error && isLoggedIn && isNotStarted && myStats && challenge && (
          <div className="max-w-lg mx-auto py-8">
            <div className="glass rounded-3xl border border-white/10 p-8 text-center">
              <Clock className="w-12 h-12 text-gold mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Challenge Hasn&apos;t Started Yet</h2>
              <p className="text-gray-400 text-sm mb-6">
                It will start on <span className="text-white font-semibold">{new Date(challenge.startDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
              </p>
              <div className="glass rounded-2xl border border-white/10 p-5 text-left space-y-3">
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Your Registration</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Nickname</p>
                    <p className="text-sm font-semibold text-white">{myStats.nickname}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Account</p>
                    <p className="text-sm font-semibold text-white">#{myStats.accountNumber}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Type</p>
                    <p className="text-sm font-semibold text-white capitalize">{myStats.accountType}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Server</p>
                    <p className="text-sm font-semibold text-white">{myStats.server}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== COMPLETED STATE ==================== */}
        {!loading && !error && isLoggedIn && isCompleted && myStats && challenge && (
          <div className="space-y-6">
            <div className="glass rounded-2xl border border-gold/30 p-6 text-center">
              <Trophy className="w-12 h-12 text-gold mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-white mb-1">Challenge Completed</h2>
              <p className="text-gray-400 text-sm">Final results are in. {myStats.rank ? `You finished #${myStats.rank}` : "Check your final standing below."}</p>
            </div>
            {/* Show final stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-center">
                <div className="flex items-center justify-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Rank</p></div>
                <p className="text-3xl md:text-4xl font-bold gradient-text">{myStats.rank ? `#${myStats.rank}` : "—"}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-center">
                <div className="flex items-center justify-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Profit</p></div>
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>${myStats.qualifiedProfit.toFixed(2)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-center">
                <div className="flex items-center justify-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">${myStats.currentBalance.toFixed(2)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-center">
                <div className="flex items-center justify-center gap-2 mb-2"><Activity size={16} className="text-gray-400" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total Trades</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{myStats.totalTrades}</p>
              </div>
            </div>
          </div>
        )}

        {/* ==================== ACTIVE DASHBOARD ==================== */}
        {!loading && !error && isLoggedIn && isActive && myStats && challenge && (<>

          {/* EMPTY STATE - No trades yet */}
          {hasNoData && (
            <div className="max-w-md mx-auto py-8">
              <div className="glass rounded-3xl border border-white/10 p-8 text-center">
                <Activity className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">No Trades Recorded Yet</h2>
                <p className="text-gray-400 text-sm mb-4">Start trading on your MT5 account and your results will appear here automatically.</p>
                <div className="glass rounded-2xl border border-white/10 p-4 text-left space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Account</span><span className="text-white font-semibold">#{myStats.accountNumber}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Starting Balance</span><span className="text-white font-semibold">${challenge.startingBalance}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Target</span><span className="text-white font-semibold">${challenge.targetBalance}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-400">Days Left</span><span className="text-gold font-semibold">{daysLeft}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* FULL DASHBOARD - Has data */}
          {!hasNoData && (<>
            {/* TOP STATS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              <button onClick={() => setShowLeaderboardModal(true)} className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-left hover:border-gold/30 transition-all">
                <div className="flex items-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Rank</p></div>
                <p className="text-3xl md:text-4xl font-bold gradient-text">{myStats.rank ? `#${myStats.rank}` : "—"}</p>
                <p className="text-xs text-gray-500 mt-1">of {totalParticipants || "—"}</p>
              </button>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Profit</p></div>
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>${myStats.qualifiedProfit.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">Gross: ${myStats.grossProfit.toFixed(2)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">${myStats.currentBalance.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">Target: ${challenge.targetBalance}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Time Left</p></div>
                <p className="text-3xl md:text-4xl font-bold text-gold">{daysLeft}</p>
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
              <MiniStat label="Qualified" value={myStats.qualifiedTrades.toString()} icon={<Award size={14} />} />
              <MiniStat label="Removed" value={`$${myStats.profitRemoved.toFixed(2)}`} icon={<Target size={14} />} color="text-royal" />
              <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
                <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
                <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
              </button>
              <MiniStat label="Gross" value={`$${myStats.grossProfit.toFixed(2)}`} icon={<ChevronUp size={14} />} color="text-profit" />
              <MiniStat label="Net" value={`$${myStats.qualifiedProfit.toFixed(2)}`} icon={<ChevronDown size={14} />} color={myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"} />
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6">
              <TabBtn active={activeTab === "trades"} onClick={() => setActiveTab("trades")} label="Trades" count={myStats.totalTrades} />
              <TabBtn active={activeTab === "leaderboard"} onClick={() => { setActiveTab("leaderboard"); if (leaderboard.length === 0) fetchLeaderboard(); }} label="Leaderboard" />
              <TabBtn active={activeTab === "violations"} onClick={() => setActiveTab("violations")} label="Flagged" count={myStats.flaggedTrades} />
            </div>

            {/* TRADES TAB */}
            {activeTab === "trades" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Recent Trades</p>
                <p className="text-xs text-gray-500">Tap a trade for details</p>
              </div>
              {recentTrades.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No trades recorded yet.</p>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px]">
                  <thead><tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Symbol</th>
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Type</th>
                    <th className="text-right py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Profit</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Vol</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Status</th>
                  </tr></thead>
                  <tbody>{recentTrades.map((t) => (
                    <tr key={t.ticket} onClick={() => setSelectedTrade(t)} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${!t.isQualified ? "bg-loss/5" : ""}`}>
                      <td className="py-3 px-4 text-xs text-gray-400">{formatDate(t.closeTime)}</td>
                      <td className="py-3 px-4 text-sm text-white font-semibold">{t.symbol}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span></td>
                      <td className={`py-3 px-4 text-right text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                      <td className="py-3 px-4 text-center text-xs text-gray-400">{t.volume}</td>
                      <td className="py-3 px-4 text-center">{t.isQualified ? <span className="text-profit">✓</span> : <span className="text-loss">🚩</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              )}
              <div className="p-3 border-t border-white/5 text-center"><p className="text-xs text-gray-600">Last updated: {formatRelativeTime(myStats.lastUpdated)}</p></div>
            </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Leaderboard</p></div>
                <p className="text-xs text-gray-500">Ranked by qualified profit</p>
              </div>
              {leaderboardLoading ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 text-royal animate-spin mx-auto" /></div>
              ) : leaderboard.length === 0 ? (
                <div className="p-8 text-center">
                  <Trophy className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No leaderboard data yet.</p>
                </div>
              ) : (
              <div className="divide-y divide-white/5">
                {leaderboard.map((entry) => (
                  <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>{entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}</div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified • {entry.accountType}</p>
                    </div>
                    <p className="text-sm font-bold text-white">${entry.adjustedBalance.toFixed(2)}</p>
                  </button>
                ))}
              </div>
              )}
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
                          <span className="text-xs text-gray-500">{formatDate(t.closeTime)}</span>
                        </div>
                        {t.violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>}
                        <div className="flex gap-4 text-xs text-gray-400">
                          <span>Lots: {t.volume}</span>
                          <span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>)}
            </div>
            )}
          </>)}
        </>)}
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
                <DRow label="Closed" value={formatDate(selectedTrade.closeTime)} />
                <DRow label="Volume" value={`${selectedTrade.volume} lots`} />
                <DRow label="Opened" value={formatDate(selectedTrade.openTime)} />
                <DRow label="Entry" value={selectedTrade.openPrice.toString()} />
                <DRow label="Exit" value={selectedTrade.closePrice.toString()} />
                <DRow label="Commission" value={`$${selectedTrade.commission.toFixed(2)}`} />
                <DRow label="Swap" value={`$${selectedTrade.swap.toFixed(2)}`} />
              </div>
              <div className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                <span className="text-sm text-gray-400">Net Profit/Loss</span>
                <span className={`text-lg font-bold ${selectedTrade.profit >= 0 ? "text-profit" : "text-loss"}`}>{selectedTrade.profit >= 0 ? "+" : ""}${selectedTrade.profit.toFixed(2)}</span>
              </div>
              <div className={`p-4 rounded-xl border ${selectedTrade.isQualified ? "bg-profit/10 border-profit/20" : "bg-loss/10 border-loss/20"}`}>
                {selectedTrade.isQualified ? (
                  <p className="text-sm text-profit font-semibold flex items-center gap-2"><Shield size={16} />Qualified — counts toward your balance</p>
                ) : (
                  <div>
                    <p className="text-sm text-loss font-semibold flex items-center gap-2 mb-2"><AlertTriangle size={16} />Flagged — profit removed</p>
                    {selectedTrade.violations.length > 0 && <p className="text-sm text-white">{selectedTrade.violations.join(", ")}</p>}
                  </div>
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
                  <button key={entry.rank || entry.nickname} onClick={() => setSelectedUser(entry)} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.rank === 1 ? "bg-gold/20 text-gold" : entry.rank === 2 ? "bg-gray-400/20 text-gray-300" : entry.rank === 3 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>{entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}</div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified</p>
                    </div>
                    <p className="text-sm font-bold text-white">${entry.adjustedBalance.toFixed(2)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back to leaderboard</button>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${selectedUser.rank <= 3 ? "bg-gold/20 text-gold" : "bg-white/10 text-gray-400"}`}>#{selectedUser.rank || "—"}</div>
                  <div>
                    <p className="text-xl font-bold text-white">{selectedUser.nickname}</p>
                    <p className="text-sm text-gray-400">Balance: <span className="text-white font-semibold">${selectedUser.adjustedBalance.toFixed(2)}</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Trades</p><p className="text-lg font-bold text-white">{selectedUser.totalTrades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Qualified</p><p className="text-lg font-bold text-white">{selectedUser.qualifiedTrades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Flagged</p><p className="text-lg font-bold text-loss">{selectedUser.flaggedTrades}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Qualified Profit</p><p className={`text-sm font-bold ${selectedUser.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>${selectedUser.qualifiedProfit.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Gross Profit</p><p className="text-sm font-bold text-white">${selectedUser.grossProfit.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Profit Removed</p><p className="text-sm font-bold text-loss">${selectedUser.profitRemoved.toFixed(2)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><p className="text-sm font-bold text-white capitalize">{selectedUser.accountType}</p></div>
                </div>
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
              {violations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No flagged trades</p>
              ) : violations.map((t) => (
                <div key={t.ticket} className="p-4 rounded-xl bg-white/5 border border-loss/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                      <span className="text-white font-semibold">{t.symbol}</span>
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(t.closeTime)}</span>
                  </div>
                  {t.violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>}
                  <div className="flex gap-4 text-xs text-gray-400"><span>Lots: {t.volume}</span><span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span></div>
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
