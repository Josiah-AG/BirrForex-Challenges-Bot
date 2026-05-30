"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { TrendingUp, Trophy, AlertTriangle, Target, Activity, ArrowLeft, FileText, Clock, ChevronDown, ChevronUp, Shield, Award, Hash, Key, Loader2, MessageCircle, ArrowRight, X, RefreshCw, LogOut } from "lucide-react";

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
  isQualified: boolean; isDisqualified?: boolean; disqualifyReason?: string | null;
  isBlown?: boolean; isCent?: boolean;
  lastTradeTime: string | null; lastUpdated: string | null;
  isMe?: boolean;
}
interface ChallengeInfo {
  id: number; title: string; status: string;
  startDate: string; endDate: string;
  startingBalance: number; targetBalance: number;
  winnersCount: number;
}
interface MyStats {
  nickname: string; accountNumber: string; accountType: string; server: string;
  rank: number | null; currentBalance: number; adjustedBalance: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  totalTrades: number; qualifiedTrades: number; flaggedTrades: number;
  isQualified: boolean; lastUpdated: string | null; pullStatus: string | null;
  disqualified: boolean; disqualifiedReason: string | null;
  isCent: boolean; lastPullAt: string | null;
}

export default function ChallengeDashboard() {
  const params = useParams();
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "leaderboard" | "violations">("trades");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [showCompletedPopup, setShowCompletedPopup] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);
  const [selectedUserTrades, setSelectedUserTrades] = useState<any[]>([]);
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
  const [challengeRules, setChallengeRules] = useState<string[]>([]);

  // Fetch trades when a user is selected in leaderboard modal
  useEffect(() => {
    if (!selectedUser || !selectedUser.nickname || selectedUser.totalTrades === 0) {
      setSelectedUserTrades([]);
      return;
    }
    const fetchUserTrades = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiUrl}/api/challenges/${params.id}/user-trades?nickname=${encodeURIComponent(selectedUser.nickname)}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedUserTrades(data.trades || []);
        }
      } catch { setSelectedUserTrades([]); }
    };
    fetchUserTrades();
  }, [selectedUser, params.id]);

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
        pullStatus: data.me.pullStatus || null,
        disqualified: data.me.disqualified || false,
        disqualifiedReason: data.me.disqualifiedReason || null,
        isCent: data.me.isCent || false,
        lastPullAt: data.me.lastPullAt || null,
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

  // Fetch leaderboard with pagination
  const [leaderboardHasMore, setLeaderboardHasMore] = useState(false);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardLoadingMore, setLeaderboardLoadingMore] = useState(false);

  const fetchLeaderboard = useCallback(async (loadMore = false) => {
    if (!params.id) return;
    if (loadMore) setLeaderboardLoadingMore(true);
    else setLeaderboardLoading(true);
    try {
      const offset = loadMore ? leaderboard.length : 0;
      const category = myStats?.accountType || 'all';
      const res = await fetch(`${API_URL}/api/challenges/${params.id}/leaderboard?limit=50&offset=${offset}&category=${category}`);
      if (res.ok) {
        const data = await res.json();
        const entries: LeaderboardEntry[] = (data.leaderboard || []).map((entry: LeaderboardEntry) => ({
          ...entry,
          isMe: myStats ? entry.nickname === myStats.nickname : false,
        }));
        if (loadMore) {
          setLeaderboard(prev => [...prev, ...entries]);
        } else {
          setLeaderboard(entries);
        }
        setLeaderboardHasMore(data.hasMore || false);
        setLeaderboardTotal(data.total || entries.length);
      }
    } catch {
      // Silently fail for leaderboard
    }
    setLeaderboardLoading(false);
    setLeaderboardLoadingMore(false);
  }, [params.id, myStats, leaderboard.length]);

  useEffect(() => {
    if (isLoggedIn && challenge) fetchLeaderboard();
  }, [isLoggedIn, challenge]);

  // Fetch rules when challenge is loaded
  useEffect(() => {
    if (!params.id) return;
    const fetchRules = async () => {
      try {
        const res = await fetch(`${API_URL}/api/challenges/${params.id}/rules`);
        if (res.ok) {
          const data = await res.json();
          setChallengeRules(data.rules || []);
        }
      } catch {}
    };
    fetchRules();
  }, [params.id]);

  // Lock body scroll when any modal is open
  const anyModalOpen = showRules || !!selectedTrade || showLeaderboardModal || showViolationsModal || showCompletedPopup;
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
        body: JSON.stringify({ account_number: loginAccount, investor_password: loginPassword, challenge_id: params.id }),
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
  const progressPercent = challenge && myStats ? ((myStats.adjustedBalance - challenge.startingBalance) / (challenge.targetBalance - challenge.startingBalance)) * 100 : 0;
  const totalParticipants = leaderboardTotal || leaderboard.length;
  const isCentAccount = myStats?.accountType === 'real' && myStats.currentBalance > 500; // heuristic for cent
  const isBlownAccount = myStats && myStats.totalTrades > 0 && myStats.currentBalance <= 0;
  const showProgressBar = myStats && myStats.totalTrades > 0 && !isBlownAccount && !myStats.disqualified;

  // Win Rate & Avg RR (computed from trades)
  const winningTrades = recentTrades.filter(t => t.profit > 0);
  const losingTrades = recentTrades.filter(t => t.profit < 0);
  const winRate = recentTrades.length > 0 ? Math.round((winningTrades.length / recentTrades.length) * 100) : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.profit, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.profit, 0) / losingTrades.length) : 0;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Format balance with cent support — uses isCent flag from API
  const formatBalance = (amount: number, accountType: string, isCent?: boolean) => {
    if (isCent) {
      return `${amount.toFixed(2)}¢`;
    }
    return `$${amount.toFixed(2)}`;
  };

  // Format date helper (shows in EAT)
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const month = eat.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const day = eat.getUTCDate();
    const h = eat.getUTCHours().toString().padStart(2, "0");
    const m = eat.getUTCMinutes().toString().padStart(2, "0");
    return `${month} ${day}, ${h}:${m}`;
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

  // Calculate next pull time (EAT schedule: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
  const getNextPullTime = () => {
    const now = new Date();
    const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const currentHourEAT = eatNow.getUTCHours();
    const pullHours = [0, 4, 8, 12, 16, 20];
    let nextHour = pullHours.find(h => h > currentHourEAT);
    if (nextHour === undefined) {
      nextHour = 0;
    }
    const h = nextHour.toString().padStart(2, "0");
    return `${h}:00 EAT`;
  };

  // Get the last scheduled pull time (not force pulls)
  const getLastScheduledPullTime = (lastUpdated: string | null) => {
    const now = new Date();
    const eatNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const currentHourEAT = eatNow.getUTCHours();
    const pullHours = [0, 4, 8, 12, 16, 20];

    // Find the most recent pull hour that has passed (this is when data was flushed)
    let lastPullHour = 20; // default
    for (let i = pullHours.length - 1; i >= 0; i--) {
      if (pullHours[i] <= currentHourEAT) {
        lastPullHour = pullHours[i];
        break;
      }
    }
    // If current hour is before first pull (0), use yesterday's 20:00
    if (currentHourEAT < pullHours[0]) {
      lastPullHour = 20;
    }

    // The data shown is from the cycle BEFORE the flush
    // Flush happens at lastPullHour, data is from the cycle before that
    const pullIdx = pullHours.indexOf(lastPullHour);
    const dataFromHour = pullIdx > 0 ? pullHours[pullIdx - 1] : 20; // previous cycle start
    const dataToHour = lastPullHour; // previous cycle end = flush time

    const fromStr = String(dataFromHour).padStart(2, "0") + ":00";
    const toStr = String(dataToHour).padStart(2, "0") + ":00";
    return `${fromStr} – ${toStr} EAT`;
  };

  // Determine challenge state
  const isNotStarted = challenge && (challenge.status === "registration_open" || challenge.status === "draft");
  const isActive = challenge && challenge.status === "active";
  const isCompleted = challenge && (challenge.status === "completed" || challenge.status === "submission_open" || challenge.status === "reviewing");
  const hasNoData = myStats && myStats.totalTrades === 0 && isActive;

  // Show completed popup once per session when challenge ends
  useEffect(() => {
    if (isCompleted && isLoggedIn && myStats && !loading) {
      const dismissedKey = `challenge_completed_seen_${params.id}`;
      if (!sessionStorage.getItem(dismissedKey)) {
        setShowCompletedPopup(true);
        sessionStorage.setItem(dismissedKey, "1");
      }
    }
  }, [isCompleted, isLoggedIn, myStats, loading, params.id]);

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
            {isLoggedIn && (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRules(true)} className="flex items-center gap-2 px-3 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all text-sm"><FileText size={14} /><span className="hidden sm:inline">Rules</span></button>
                <button onClick={() => { localStorage.removeItem("wp_token"); localStorage.removeItem("wp_user"); setIsLoggedIn(false); setMyStats(null); setChallenge(null); setRecentTrades([]); setLeaderboard([]); }} className="flex items-center gap-2 px-3 py-2 glass border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all text-sm"><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
              </div>
            )}
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

        {/* ==================== COMPLETED STATE — now shows full dashboard with popup ==================== */}
        {!loading && !error && isLoggedIn && isCompleted && myStats && challenge && (<>

          {/* FULL DASHBOARD (same as active) */}
          <>
            {/* TOP STATS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              <button onClick={() => setShowLeaderboardModal(true)} className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-left hover:border-gold/30 transition-all">
                <div className="flex items-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Rank</p></div>
                <p className="text-3xl md:text-4xl font-bold gradient-text">{myStats.rank ? `#${myStats.rank}` : "—"}</p>
                <p className="text-xs text-gray-500 mt-1">of {totalParticipants || "—"}</p>
              </button>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Profit</p></div>
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, myStats.isCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Total P&L: {formatBalance(myStats.grossProfit, myStats.accountType, myStats.isCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, myStats.isCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Gross: {formatBalance(myStats.currentBalance, myStats.accountType, myStats.isCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Activity size={16} className="text-gray-400" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Total Trades</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{myStats.totalTrades}</p>
              </div>
            </div>

            {/* MINI STATS */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
              <MiniStat label="Trades" value={myStats.totalTrades.toString()} icon={<Activity size={14} />} />
              <MiniStat label="Qualified" value={myStats.qualifiedTrades.toString()} icon={<Award size={14} />} />
              <MiniStat label="Removed" value={`${formatBalance(myStats.profitRemoved, myStats.accountType, myStats.isCent)}`} icon={<Target size={14} />} color="text-royal" />
              <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
                <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
                <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
              </button>
              <MiniStat label="Win Rate" value={`${winRate}%`} icon={<ChevronUp size={14} />} color={winRate >= 50 ? "text-profit" : "text-loss"} />
              <MiniStat label="Avg RR" value={avgRR > 0 ? avgRR.toFixed(2) : "—"} icon={<ChevronDown size={14} />} color="text-royal" />
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6">
              <TabBtn active={activeTab === "trades"} onClick={() => setActiveTab("trades")} label="Trades" count={myStats.totalTrades} />
              <TabBtn active={activeTab === "leaderboard"} onClick={() => { setActiveTab("leaderboard"); if (leaderboard.length === 0) fetchLeaderboard(false); }} label="Leaderboard" />
              <TabBtn active={activeTab === "violations"} onClick={() => setActiveTab("violations")} label="Flagged" count={myStats.flaggedTrades} />
            </div>

            {/* TRADES TAB */}
            {activeTab === "trades" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">All Trades</p>
                <p className="text-xs text-gray-500">Tap a trade for details</p>
              </div>
              {recentTrades.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No trades recorded.</p>
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
            </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Final Leaderboard</p></div>
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
                  <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : (challenge && entry.adjustedBalance >= challenge.targetBalance && !entry.isDisqualified) ? "bg-profit/5 border-l-2 border-profit/30" : ""} ${entry.isDisqualified ? "opacity-60" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isDisqualified ? "bg-loss/20 text-loss" : (challenge && entry.rank <= (challenge.winnersCount || 3) && entry.adjustedBalance >= challenge.targetBalance) ? "bg-gold/20 text-gold" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
                        {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                        {entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
                      </div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified</p>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {entry.isDisqualified ? <span className="text-loss">DQ</span> : formatBalance(entry.adjustedBalance, entry.accountType, entry.isCent)}
                    </p>
                  </button>
                ))}
              </div>
              )}
              {leaderboardHasMore && (
                <div className="p-3 border-t border-white/5 text-center">
                  <button onClick={() => fetchLeaderboard(true)} disabled={leaderboardLoadingMore} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50">
                    {leaderboardLoadingMore ? "Loading..." : `Load More (${leaderboard.length} of ${leaderboardTotal})`}
                  </button>
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
                  <p className="text-sm text-gray-400 mt-1">All your trades followed the rules</p>
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
          </>
        </>)}

        {/* ==================== ACTIVE DASHBOARD ==================== */}
        {!loading && !error && isLoggedIn && isActive && myStats && challenge && (<>

          {/* PASSWORD UPDATE BANNER */}
          {myStats.pullStatus === "password_changed" && (
            <PasswordUpdateBanner />
          )}

          {/* DISQUALIFIED BANNER (dismissable) */}
          {myStats.disqualified && (
            <DismissableBanner type="dq" reason={myStats.disqualifiedReason} />
          )}

          {/* BLOWN ACCOUNT BANNER */}
          {isBlownAccount && !myStats.disqualified && (
            <DismissableBanner type="blown" />
          )}

          {/* NO DATA NOTICE - Show normal dashboard but with a notice */}
          {hasNoData && (
            <div className="mb-4 p-3 rounded-xl bg-gold/10 border border-gold/20 flex items-center gap-3">
              <Clock size={16} className="text-gold flex-shrink-0" />
              <div>
                {myStats.currentBalance <= 0 ? (
                  <p className="text-xs text-gray-300">Your account balance is <span className="text-gold font-semibold">$0.00</span>. Please deposit to start trading. Next data sync: <span className="text-gold font-semibold">{getNextPullTime()}</span></p>
                ) : (
                  <p className="text-xs text-gray-300">No trade data yet. Data syncs every 4 hours. Next update: <span className="text-gold font-semibold">{getNextPullTime()}</span></p>
                )}
              </div>
            </div>
          )}

          {/* FULL DASHBOARD */}
          <>
            {/* TOP STATS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
              <button onClick={() => setShowLeaderboardModal(true)} className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-left hover:border-gold/30 transition-all">
                <div className="flex items-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Rank</p></div>
                <p className="text-3xl md:text-4xl font-bold gradient-text">{myStats.rank ? `#${myStats.rank}` : "—"}</p>
                <p className="text-xs text-gray-500 mt-1">of {totalParticipants || "—"}</p>
              </button>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Profit</p></div>
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, myStats.isCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Total P&L: {formatBalance(myStats.grossProfit, myStats.accountType, myStats.isCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, myStats.isCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Gross: {formatBalance(myStats.currentBalance, myStats.accountType, myStats.isCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Time Left</p></div>
                <p className="text-3xl md:text-4xl font-bold text-gold">{daysLeft}</p>
                <p className="text-xs text-gray-500 mt-1">days remaining</p>
              </div>
            </div>

            {/* PROGRESS BAR — only show when user has trades and is active */}
            {showProgressBar ? (
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
                <div className="flex items-center justify-between mb-3"><p className="text-sm font-medium text-gray-300">Progress to Target</p><p className={`text-sm font-bold ${progressPercent >= 0 ? "text-white" : "text-loss"}`}>{progressPercent.toFixed(0)}%</p></div>
                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${progressPercent >= 0 ? "bg-gradient-to-r from-royal to-profit" : "bg-loss"}`} style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></div>
                <div className="flex justify-between mt-2 text-xs text-gray-500"><span>{formatBalance(challenge.startingBalance, myStats.accountType, myStats.isCent)}</span><span>{formatBalance(challenge.targetBalance, myStats.accountType, myStats.isCent)}</span></div>
              </div>
            ) : !isBlownAccount && !myStats.disqualified && (
              <div className="glass rounded-2xl p-4 border border-white/10 mb-6 text-center">
                <p className="text-xs text-gray-500">Deposit and start trading to track progress</p>
              </div>
            )}

            {/* MINI STATS */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
              <MiniStat label="Trades" value={myStats.totalTrades.toString()} icon={<Activity size={14} />} />
              <MiniStat label="Qualified" value={myStats.qualifiedTrades.toString()} icon={<Award size={14} />} />
              <MiniStat label="Removed" value={`${formatBalance(myStats.profitRemoved, myStats.accountType, myStats.isCent)}`} icon={<Target size={14} />} color="text-royal" />
              <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
                <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
                <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
              </button>
              <MiniStat label="Win Rate" value={`${winRate}%`} icon={<ChevronUp size={14} />} color={winRate >= 50 ? "text-profit" : "text-loss"} />
              <MiniStat label="Avg RR" value={avgRR > 0 ? avgRR.toFixed(2) : "—"} icon={<ChevronDown size={14} />} color="text-royal" />
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6">
              <TabBtn active={activeTab === "trades"} onClick={() => setActiveTab("trades")} label="Trades" count={myStats.totalTrades} />
              <TabBtn active={activeTab === "leaderboard"} onClick={() => { setActiveTab("leaderboard"); if (leaderboard.length === 0) fetchLeaderboard(false); }} label="Leaderboard" />
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
              <div className="p-3 border-t border-white/5 text-center">
                <p className="text-xs text-gray-600">Last updated: {myStats.lastPullAt ? formatRelativeTime(myStats.lastPullAt) : 'Never'} • Next update: {getNextPullTime()}</p>
              </div>
            </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Leaderboard</p></div>
                <p className="text-xs text-gray-500">Next update: {getNextPullTime()}</p>
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
                  <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : (challenge && entry.adjustedBalance >= challenge.targetBalance && !entry.isDisqualified) ? "bg-profit/5 border-l-2 border-profit/30" : ""} ${entry.isDisqualified ? "opacity-60" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isDisqualified ? "bg-loss/20 text-loss" : (challenge && entry.rank <= (challenge.winnersCount || 3) && entry.adjustedBalance >= challenge.targetBalance) ? "bg-gold/20 text-gold" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
                        {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                        {entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
                        {entry.isBlown && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">💀</span>}
                      </div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified • {entry.accountType}</p>
                    </div>
                    <p className="text-sm font-bold text-white">
                      {entry.isDisqualified ? <span className="text-loss">DQ</span> : formatBalance(entry.adjustedBalance, entry.accountType, entry.isCent)}
                    </p>
                  </button>
                ))}
              </div>
              )}
              {/* Load More button */}
              {leaderboardHasMore && (
                <div className="p-3 border-t border-white/5 text-center">
                  <button onClick={() => fetchLeaderboard(true)} disabled={leaderboardLoadingMore} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50">
                    {leaderboardLoadingMore ? "Loading..." : `Load More (${leaderboard.length} of ${leaderboardTotal})`}
                  </button>
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
          </>
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
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${(challenge && entry.rank <= (challenge.winnersCount || 3) && entry.adjustedBalance >= challenge.targetBalance) ? "bg-gold/20 text-gold" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
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
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${selectedUser.isDisqualified ? "bg-loss/20 text-loss" : selectedUser.rank <= 3 ? "bg-gold/20 text-gold" : "bg-white/10 text-gray-400"}`}>#{selectedUser.rank || "—"}</div>
                  <div>
                    <p className="text-xl font-bold text-white">{selectedUser.nickname}</p>
                    <p className="text-sm text-gray-400">
                      {selectedUser.isDisqualified ? <span className="text-loss font-semibold">Disqualified</span> : <>Balance: <span className="text-white font-semibold">{formatBalance(selectedUser.adjustedBalance, selectedUser.accountType, selectedUser.isCent)}</span></>}
                    </p>
                  </div>
                </div>
                {/* DQ Reason */}
                {selectedUser.isDisqualified && selectedUser.disqualifyReason && (
                  <div className="p-4 rounded-xl bg-loss/10 border border-loss/20 mb-4">
                    <p className="text-xs text-gray-400 mb-1">Disqualification Reason:</p>
                    <p className="text-sm text-white">{selectedUser.disqualifyReason}</p>
                  </div>
                )}
                {/* Only show stats for non-DQ users */}
                {!selectedUser.isDisqualified && (<>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Trades</p><p className="text-lg font-bold text-white">{selectedUser.totalTrades}</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Qualified</p><p className="text-lg font-bold text-white">{selectedUser.qualifiedTrades}</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Flagged</p><p className="text-lg font-bold text-loss">{selectedUser.flaggedTrades}</p></div>
                  </div>
                  {/* Win Rate & Avg RR */}
                  {selectedUserTrades.length > 0 && (() => {
                    const wins = selectedUserTrades.filter((t: any) => t.profit > 0);
                    const losses = selectedUserTrades.filter((t: any) => t.profit < 0);
                    const wr = Math.round((wins.length / selectedUserTrades.length) * 100);
                    const aw = wins.length > 0 ? wins.reduce((s: number, t: any) => s + t.profit, 0) / wins.length : 0;
                    const al = losses.length > 0 ? Math.abs(losses.reduce((s: number, t: any) => s + t.profit, 0) / losses.length) : 0;
                    const rr = al > 0 ? aw / al : 0;
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate</p><p className={`text-lg font-bold ${wr >= 50 ? "text-profit" : "text-loss"}`}>{wr}%</p></div>
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{rr > 0 ? rr.toFixed(2) : "—"}</p></div>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Net P&L</p><p className={`text-sm font-bold ${selectedUser.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(selectedUser.qualifiedProfit, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Total P&L</p><p className="text-sm font-bold text-white">{formatBalance(selectedUser.grossProfit, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">P&L Removed</p><p className="text-sm font-bold text-loss">{formatBalance(selectedUser.profitRemoved, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><p className="text-sm font-bold text-white capitalize">{selectedUser.accountType}</p></div>
                  </div>
                  {/* Recent Trades */}
                  {selectedUserTrades.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-gray-400 mb-2">Trades ({selectedUserTrades.length})</p>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {selectedUserTrades.map((t, i) => (
                          <div key={i} className={`py-2 px-3 rounded-lg ${!t.isQualified ? 'bg-loss/10 border border-loss/20' : 'bg-white/5'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.type?.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{t.type}</span>
                                <div>
                                  <p className="text-xs text-white font-medium">{t.symbol}</p>
                                  <p className="text-[10px] text-gray-500">
                                    {t.openTime ? new Date(t.openTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}{' '}
                                    {t.openTime ? new Date(new Date(t.openTime).getTime() + 3*60*60*1000).toISOString().substring(11,16) : ''} → {t.closeTime ? new Date(new Date(t.closeTime).getTime() + 3*60*60*1000).toISOString().substring(11,16) : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs font-bold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{selectedUser.isCent ? `${t.profit.toFixed(2)}¢` : `$${t.profit.toFixed(2)}`}</p>
                                <p className="text-[10px] text-gray-500">{t.volume} lot {!t.isQualified && <span className="text-loss">🚩</span>}</p>
                              </div>
                            </div>
                            {!t.isQualified && t.violations && t.violations.length > 0 && (
                              <p className="text-[10px] text-loss mt-1 pl-7">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : t.violations[0]?.detail || 'Rule violation'}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>)}
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

      {/* ==================== CHALLENGE COMPLETED POPUP ==================== */}
      {showCompletedPopup && myStats && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setShowCompletedPopup(false)}>
          <div className="glass rounded-2xl max-w-md w-full border border-gold/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <Trophy className="w-16 h-16 text-gold mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Challenge Completed</h2>
              <p className="text-gray-400 text-sm mb-6">Final results are in. {myStats.rank ? `You finished #${myStats.rank}` : "Check your final standing below."}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Final Rank</p>
                  <p className="text-2xl font-bold gradient-text">{myStats.rank ? `#${myStats.rank}` : "—"}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Adjusted Balance</p>
                  <p className="text-2xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, myStats.isCent)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Net Qualified Profit</p>
                  <p className={`text-2xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, myStats.isCent)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Total Trades</p>
                  <p className="text-2xl font-bold text-white">{myStats.totalTrades}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Flagged</p>
                  <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Best Trade</p>
                  <p className="text-lg font-bold text-profit">{recentTrades.length > 0 ? `+${formatBalance(Math.max(...recentTrades.map(t => t.profit)), myStats.accountType, myStats.isCent)}` : "—"}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Worst Trade</p>
                  <p className="text-lg font-bold text-loss">{recentTrades.length > 0 ? formatBalance(Math.min(...recentTrades.map(t => t.profit)), myStats.accountType, myStats.isCent) : "—"}</p>
                </div>
              </div>
              <button onClick={() => setShowCompletedPopup(false)} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold transition-all shadow-lg shadow-royal/20">
                View Full Dashboard
              </button>
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
              {challengeRules.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Rules not yet configured for this challenge.</p>
              ) : (
                challengeRules.map((rule, i) => (
                  <RuleItem key={i} code={rule.startsWith('No ') || rule.startsWith('Unlimited') || rule.startsWith('Trades against') ? '•' : String(i + 1)} text={rule} />
                ))
              )}

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

function PasswordUpdateBanner() {
  const [newPw, setNewPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const handleSubmit = async () => {
    if (!newPw || newPw.length < 3) { setResult("Password too short"); return; }
    setSubmitting(true); setResult("");
    try {
      const token = localStorage.getItem("wp_token");
      const res = await fetch(`${API_URL}/api/me/update-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: newPw }),
      });
      const data = await res.json();
      if (data.success && data.verified) {
        setResult("✅ " + data.message);
        setTimeout(() => window.location.reload(), 2000);
      } else if (data.success) {
        setResult("⚠️ " + data.message);
      } else {
        setResult("❌ " + (data.message || "Failed"));
      }
    } catch { setResult("❌ Connection error"); }
    setSubmitting(false);
  };

  return (
    <div className="mb-6 p-5 rounded-2xl bg-loss/10 border border-loss/30">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-2xl">⚠️</span>
        <div>
          <h3 className="text-sm font-bold text-loss">Password Update Required</h3>
          <p className="text-xs text-gray-400 mt-1">We could not access your MT5 account. Your investor password appears to have been changed. Please enter your new password below.</p>
          <p className="text-xs text-loss mt-1 font-semibold">⏰ You have 24 hours to update or your registration will be disqualified.</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New investor password" className="flex-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
        <button onClick={handleSubmit} disabled={submitting || !newPw} className="px-4 py-2.5 rounded-xl bg-royal/20 border border-royal/30 text-royal text-xs font-bold hover:bg-royal/30 transition-all disabled:opacity-50">{submitting ? "..." : "Update"}</button>
      </div>
      {result && <p className={`text-xs mt-2 font-semibold ${result.startsWith("✅") ? "text-profit" : result.startsWith("⚠️") ? "text-gold" : "text-loss"}`}>{result}</p>}
    </div>
  );
}

function DismissableBanner({ type, reason }: { type: "dq" | "blown"; reason?: string | null }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (type === "dq") {
    return (
      <div className="mb-4 p-4 rounded-xl bg-loss/10 border border-loss/30 relative">
        <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded-lg"><X size={14} className="text-gray-400" /></button>
        <div className="flex items-start gap-3">
          <span className="text-lg">🚫</span>
          <div>
            <h3 className="text-sm font-bold text-loss">You have been disqualified</h3>
            {reason && <p className="text-xs text-gray-400 mt-1">Reason: {reason}</p>}
            <p className="text-xs text-gray-500 mt-1">You can still view your data and the leaderboard.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 p-4 rounded-xl bg-gray-500/10 border border-gray-500/30 relative">
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 p-1 hover:bg-white/10 rounded-lg"><X size={14} className="text-gray-400" /></button>
      <div className="flex items-start gap-3">
        <span className="text-lg">💀</span>
        <div>
          <h3 className="text-sm font-bold text-gray-300">Your account balance reached $0</h3>
          <p className="text-xs text-gray-500 mt-1">Your account data is preserved. You can still view the leaderboard.</p>
        </div>
      </div>
    </div>
  );
}
