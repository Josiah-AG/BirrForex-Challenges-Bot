"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { TrendingUp, Trophy, AlertTriangle, Target, Activity, ArrowLeft, FileText, Clock, ChevronDown, ChevronUp, Shield, Award, Hash, Key, Loader2, MessageCircle, ArrowRight, X, RefreshCw, LogOut } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ==================== TYPES ====================
interface Trade {
  ticket: number; positionId?: number; symbol: string; type: string; volume: number;
  openingVolume?: number | null;
  openPrice: number; closePrice: number; openTime: string; closeTime: string;
  profit: number; commission: number; swap: number;
  stopLoss?: number | null; takeProfit?: number | null;
  isQualified: boolean; violations: string[]; slCheckPending?: boolean; slCheckResult?: string | null;
}
interface LeaderboardEntry {
  nickname: string; accountType: string; rank: number;
  currentBalance: number; adjustedBalance: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  totalTrades: number; qualifiedTrades: number; flaggedTrades: number;
  isQualified: boolean; isDisqualified?: boolean; disqualifyReason?: string | null;
  isBlown?: boolean; isCent?: boolean; isWithdrawn?: boolean; totalWithdrawn?: number;
  lastTradeTime: string | null; lastUpdated: string | null;
  isMe?: boolean;
}
interface ChallengeInfo {
  id: number; title: string; status: string;
  startDate: string; endDate: string;
  startingBalance: number; myStartingBalance?: number; targetBalance: number;
  winnersCount: number; realWinnersCount: number; demoWinnersCount: number;
  onlyCentAccount?: boolean;
}
interface MyStats {
  nickname: string; accountNumber: string; accountType: string; accountSubtype: string | null; server: string;
  rank: number | null; currentBalance: number; adjustedBalance: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  totalTrades: number; qualifiedTrades: number; flaggedTrades: number;
  isQualified: boolean; lastUpdated: string | null; pullStatus: string | null;
  disqualified: boolean; disqualifiedReason: string | null;
  isCent: boolean; lastPullAt: string | null;
  balanceWarning?: boolean;
}

export default function ChallengeDashboard() {
  const params = useParams();
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "leaderboard" | "violations">("trades");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [showCompletedPopup, setShowCompletedPopup] = useState(false);
  const [showNotStartedPopup, setShowNotStartedPopup] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);
  const [selectedUserTrades, setSelectedUserTrades] = useState<any[]>([]);
  const [selectedUserBalanceOps, setSelectedUserBalanceOps] = useState<any[]>([]);
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
  const [leaderboardPreStart, setLeaderboardPreStart] = useState(false);
  const leaderboardLengthRef = useRef(0);
  const myStatsRef = useRef<MyStats | null>(null);
  const [myContext, setMyContext] = useState<LeaderboardEntry[]>([]);
  const [challengeRules, setChallengeRules] = useState<string[]>([]);

  // Fetch trades when a user is selected in leaderboard modal
  useEffect(() => {
    if (!selectedUser || !selectedUser.nickname) {
      setSelectedUserTrades([]);
      setSelectedUserBalanceOps([]);
      return;
    }
    const fetchUserTrades = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
        const res = await fetch(`${apiUrl}/api/challenges/${params.id}/user-trades?nickname=${encodeURIComponent(selectedUser.nickname)}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedUserTrades(data.trades || []);
          setSelectedUserBalanceOps(data.balanceOps || []);
        }
      } catch { setSelectedUserTrades([]); setSelectedUserBalanceOps([]); }
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
      const statsObj = {
        nickname: data.me.nickname,
        accountNumber: data.me.accountNumber,
        accountType: data.me.accountType,
        accountSubtype: data.me.accountSubtype || null,
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
        balanceWarning: data.me.balanceWarning || false,
      };
      myStatsRef.current = statsObj;
      setMyStats(statsObj);
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
      const offset = loadMore ? leaderboardLengthRef.current : 0;
      const category = myStatsRef.current?.accountType || 'all';
      const nickname = myStatsRef.current?.nickname || '';
      const nicknameParam = nickname ? `&nickname=${encodeURIComponent(nickname)}` : '';
      const res = await fetch(`${API_URL}/api/challenges/${params.id}/leaderboard?limit=50&offset=${offset}&category=${category}${nicknameParam}`);
      if (res.ok) {
        const data = await res.json();
        const stats = myStatsRef.current;
        const entries: LeaderboardEntry[] = (data.leaderboard || []).map((entry: LeaderboardEntry) => ({
          ...entry,
          isMe: stats ? entry.nickname === stats.nickname : false,
        }));
        if (loadMore) {
          setLeaderboard(prev => {
            const next = [...prev, ...entries];
            leaderboardLengthRef.current = next.length;
            return next;
          });
        } else {
          leaderboardLengthRef.current = entries.length;
          setLeaderboard(entries);
        }
        setLeaderboardPreStart(data.preStart || false);
        setLeaderboardHasMore(data.hasMore || false);
        setLeaderboardTotal(data.total || entries.length);
        if (data.myContext) {
          setMyContext(data.myContext.map((entry: LeaderboardEntry) => ({
            ...entry,
            isMe: stats ? entry.nickname === stats.nickname : false,
          })));
        }
      }
    } catch {
      // Silently fail for leaderboard
    }
    setLeaderboardLoading(false);
    setLeaderboardLoadingMore(false);
  }, [params.id]);

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
  const anyModalOpen = showRules || !!selectedTrade || showLeaderboardModal || showViolationsModal || showCompletedPopup || showNotStartedPopup;
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

  // Top-N by rank AND above balance target
  const isWinner = (entry: LeaderboardEntry) => {
    if (!challenge || leaderboardPreStart || entry.isDisqualified || entry.isWithdrawn || entry.isBlown) return false;
    const count = entry.accountType === 'demo' ? (challenge.demoWinnersCount || 0) : (challenge.realWinnersCount || 0);
    // For cent-only real challenges: target is already in ¢, compare directly
    // For hybrid/flexible: API already converts target ×100 for cent users via /api/me/dashboard
    // Leaderboard entries have raw adjustedBalance. Need ×100 only for cent users in NON-cent-only challenges
    const isRealCentOnly = challenge.onlyCentAccount && effectiveIsCent;
    const effectiveTarget = (entry.isCent && !isRealCentOnly) ? challenge.targetBalance * 100 : challenge.targetBalance;
    return count > 0 && entry.rank <= count && (entry.adjustedBalance - (entry.totalWithdrawn || 0)) >= effectiveTarget;
  };
  const rankIcon = (entry: LeaderboardEntry) => {
    if (leaderboardPreStart) return entry.rank || "—";
    if (entry.isDisqualified) return "🚫";
    if (entry.isBlown && !entry.isWithdrawn) return "💀";
    if (entry.isWithdrawn) return "🚪";
    if (isWinner(entry)) return "🏆";
    return entry.rank || "—";
  };
  const isAboveTarget = (entry: LeaderboardEntry) => {
    if (!challenge || entry.isDisqualified || entry.isWithdrawn || entry.isBlown || leaderboardPreStart) return false;
    const isRealCentOnly = challenge.onlyCentAccount && effectiveIsCent;
    const effectiveTarget = (entry.isCent && !isRealCentOnly) ? challenge.targetBalance * 100 : challenge.targetBalance;
    return (entry.adjustedBalance - (entry.totalWithdrawn || 0)) >= effectiveTarget;
  };
  const totalParticipants = leaderboardTotal || leaderboard.length;
  const isCentAccount = myStats?.accountType === 'real' && myStats.currentBalance > 500; // heuristic for cent
  // isCent: trust registration flag, fallback to challenge onlyCentAccount for real accounts
  const effectiveIsCent = myStats ? (myStats.isCent || (challenge?.onlyCentAccount && myStats.accountType === 'real') || false) : false;
  const progressPercent = challenge && myStats ? ((myStats.adjustedBalance - challenge.startingBalance) / (challenge.targetBalance - challenge.startingBalance)) * 100 : 0;
  const isBlownAccount = myStats && myStats.totalTrades > 0 && myStats.currentBalance <= 0;

  // Win Rate & Avg RR — exclude breakeven trades from denominator; only qualified wins count
  const winningTrades = recentTrades.filter(t => t.profit > 0 && t.isQualified !== false);
  const losingTrades = recentTrades.filter(t => t.profit < 0);
  const decidedTrades = winningTrades.length + losingTrades.length;
  const winRate = decidedTrades > 0 ? Math.round((winningTrades.length / decidedTrades) * 100) : 0;
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

  // Format account subtype for display
  // account_subtype values: standard | standard_cent | pro | raw_spread | zero | unknown | null
  const formatSubtype = (subtype: string | null | undefined, accountType: string): string => {
    const map: Record<string, string> = {
      standard:       'Standard',
      standard_cent:  'Standard Cent',
      pro:            'Pro',
      raw_spread:     'Raw Spread',
      zero:           'Zero',
    };
    if (subtype && map[subtype]) return map[subtype];
    // Fallback: capitalise accountType (demo / real)
    return accountType.charAt(0).toUpperCase() + accountType.slice(1);
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
  const formatTimeEAT = (dateStr: string) => {
    const d = new Date(new Date(dateStr).getTime() + 3 * 60 * 60 * 1000);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  };
  const groupTradesByPosition = (trades: Trade[]) => {
    const map = new Map<number, Trade[]>();
    for (const t of trades) {
      const key = t.positionId ?? t.ticket;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    Array.from(map.values()).forEach(g => g.sort((a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()));
    return Array.from(map.entries())
      .map(([pid, g]) => ({ positionId: pid, trades: g }))
      .sort((a, b) => new Date(b.trades[b.trades.length - 1].closeTime).getTime() - new Date(a.trades[a.trades.length - 1].closeTime).getTime());
  };
  const groupWorstStatus = (g: Trade[]) => {
    if (g.some(t => !t.isQualified)) return 'flagged';
    if (g.some(t => t.slCheckResult === 'conflicting')) return 'conflicting';
    if (g.some(t => t.slCheckPending)) return 'pending';
    return 'ok';
  };
  const tradeStatusCell = (t: Trade) => {
    if (t.slCheckResult === 'conflicting') return <span title="Under investigation. Result may change." className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-400 text-[10px] font-bold cursor-help">?</span>;
    if (t.slCheckPending) return <span title="Max risk check in progress" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/20 border border-gold/40 text-gold text-[10px] font-bold cursor-help">⏳</span>;
    if (t.isQualified) return <span className="text-profit">✓</span>;
    return <span className="text-loss">🚩</span>;
  };
  const groupStatusCell = (status: string) => {
    if (status === 'flagged') return <span className="text-loss">🚩</span>;
    if (status === 'conflicting') return <span title="Under investigation" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-400 text-[10px] font-bold cursor-help">?</span>;
    if (status === 'pending') return <span title="Max risk check in progress" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/20 border border-gold/40 text-gold text-[10px] font-bold cursor-help">⏳</span>;
    return <span className="text-profit">✓</span>;
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
  const daysLeft = challenge
    ? isNotStarted
      ? Math.max(0, Math.ceil((new Date(challenge.startDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : Math.max(0, Math.ceil((new Date(challenge.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const daysLeftLabel = isNotStarted ? "Time to Start" : "Time Left";
  // Show progress bar if has trades OR pre-start with a known balance
  const showProgressBar = myStats && !isBlownAccount && !myStats.disqualified &&
    (myStats.totalTrades > 0 || myStats.currentBalance > 0);
  const hasNoData = myStats && myStats.totalTrades === 0 && isActive && !isNotStarted;

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

  // Show not-started popup once ever (localStorage) on first sign-in
  useEffect(() => {
    if (isNotStarted && isLoggedIn && myStats && !loading) {
      const seenKey = `challenge_notstarted_seen_${params.id}`;
      if (!localStorage.getItem(seenKey)) {
        setShowNotStartedPopup(true);
        localStorage.setItem(seenKey, "1");
      }
    }
  }, [isNotStarted, isLoggedIn, myStats, loading, params.id]);

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
                  <p className="text-xs text-gray-500">{myStats?.nickname || ""}{myStats?.accountNumber ? ` • #${myStats.accountNumber}` : ""}{myStats?.accountSubtype ? ` • ${formatSubtype(myStats.accountSubtype, myStats.accountType || '')}` : ""}</p>
                </div>
              </div>
            </div>
            {isLoggedIn && (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRules(true)} className="flex items-center gap-2 px-3 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all text-sm"><FileText size={14} /><span className="hidden sm:inline">Rules</span></button>
                <button onClick={() => { localStorage.removeItem("wp_token"); localStorage.removeItem("wp_user"); window.location.href = "/"; }} className="flex items-center gap-2 px-3 py-2 glass border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all text-sm"><LogOut size={14} /><span className="hidden sm:inline">Logout</span></button>
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

        {/* NOT STARTED — reuses active dashboard layout, balance = registration balance, no trades */}

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
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, effectiveIsCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Total P&L: {formatBalance(myStats.grossProfit, myStats.accountType, effectiveIsCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Final Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, effectiveIsCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Gross: {formatBalance(myStats.currentBalance, myStats.accountType, effectiveIsCent)}</p>
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
              <MiniStat label="Removed" value={`${formatBalance(myStats.profitRemoved, myStats.accountType, effectiveIsCent)}`} icon={<Target size={14} />} color="text-royal" />
              <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
                <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
                <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
              </button>
              <MiniStat label="Win Rate (Qualified)" value={`${winRate}%`} icon={<ChevronUp size={14} />} color={winRate >= 50 ? "text-profit" : "text-loss"} />
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
                  <tbody>{groupTradesByPosition(recentTrades).map(({ positionId, trades: group }) => {
                    if (group.length === 1) {
                      const t = group[0];
                      return (
                        <tr key={t.ticket} onClick={() => setSelectedTrade(t)} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${t.slCheckResult === 'conflicting' ? "bg-amber-500/5" : t.slCheckPending ? "bg-gold/5" : !t.isQualified ? "bg-loss/5" : ""}`}>
                          <td className="py-3 px-4 text-xs text-gray-400">{formatDate(t.closeTime)}</td>
                          <td className="py-3 px-4 text-sm text-white font-semibold">{t.symbol}</td>
                          <td className="py-3 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span></td>
                          <td className={`py-3 px-4 text-right text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                          <td className="py-3 px-4 text-center text-xs text-gray-400">{t.volume}</td>
                          <td className="py-3 px-4 text-center">{tradeStatusCell(t)}</td>
                        </tr>
                      );
                    }
                    const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                    const totalVol = group.reduce((s: number, t: Trade) => s + t.volume, 0);
                    const status = groupWorstStatus(group);
                    const first = group[0];
                    return (
                      <React.Fragment key={`g-${positionId}`}>
                        <tr className={`border-b border-white/5 ${status === 'flagged' ? 'bg-loss/5' : status === 'conflicting' ? 'bg-amber-500/5' : ''}`}>
                          <td className="py-2 px-4 text-xs text-gray-400">{formatDate(first.openTime)}</td>
                          <td className="py-2 px-4 text-sm text-white font-semibold">{first.symbol} <span className="text-[10px] text-gray-500 font-normal ml-1">{group.length} closes</span></td>
                          <td className="py-2 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${first.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{first.type}</span></td>
                          <td className={`py-2 px-4 text-right text-sm font-bold ${totalProfit >= 0 ? "text-profit" : "text-loss"}`}>{totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}</td>
                          <td className="py-2 px-4 text-center text-xs text-gray-400">{totalVol.toFixed(2)}</td>
                          <td className="py-2 px-4 text-center">{groupStatusCell(status)}</td>
                        </tr>
                        {group.map(t => (
                          <React.Fragment key={t.ticket}>
                            <tr onClick={() => setSelectedTrade(t)} className={`border-b ${!t.isQualified && t.violations?.length > 0 ? "border-white/0" : "border-white/5"} hover:bg-white/5 cursor-pointer transition-colors ${!t.isQualified ? "bg-loss/5" : ""}`}>
                              <td className="py-2 pl-8 pr-4 text-xs text-gray-500">└ {formatTimeEAT(t.closeTime)}</td>
                              <td></td><td></td>
                              <td className={`py-2 px-4 text-right text-xs font-semibold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                              <td className="py-2 px-4 text-center text-xs text-gray-400">{t.volume}</td>
                              <td className="py-2 px-4 text-center">{tradeStatusCell(t)}</td>
                            </tr>
                            {!t.isQualified && t.violations?.length > 0 && (
                              <tr className="border-b border-white/5 bg-loss/5">
                                <td colSpan={6} className="pb-2 pl-8 pr-4 text-[10px] text-loss">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : (t.violations[0] as any)?.detail || 'Rule violation'}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })}</tbody>
                </table>
              </div>
              )}
            </div>
            )}

            {/* LEADERBOARD TAB */}
            {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Final Leaderboard{myStats?.accountType === 'demo' ? ' — Demo Category' : myStats?.accountType === 'real' ? ' — Real Category' : ''}</p></div>
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
                  <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${isWinner(entry) ? "bg-profit/15 border-l-2 border-profit hover:bg-profit/20" : isAboveTarget(entry) ? "bg-profit/5 border-l-2 border-profit/30 hover:bg-profit/10" : entry.isMe ? "bg-royal/10 border-l-2 border-royal hover:bg-royal/15" : "hover:bg-white/5"} ${!leaderboardPreStart && entry.isDisqualified ? "opacity-60 bg-loss/10" : ""} ${!leaderboardPreStart && (entry.isWithdrawn || entry.isBlown) && !entry.isDisqualified ? "opacity-40 bg-loss/5" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${!leaderboardPreStart && entry.isDisqualified ? "bg-loss/20 text-loss" : !leaderboardPreStart && (entry.isBlown || entry.isWithdrawn) ? "bg-white/5 text-gray-500" : isWinner(entry) ? "bg-profit/20 text-profit" : isAboveTarget(entry) ? "bg-profit/10 text-profit/70" : "bg-white/5 text-gray-500"}`}>
                      {rankIcon(entry)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${isWinner(entry) ? "text-profit font-bold" : isAboveTarget(entry) ? "text-profit/80" : entry.isMe ? "text-royal" : !leaderboardPreStart && entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
                        {isWinner(entry) && <span className="px-1.5 py-0.5 bg-profit/20 text-profit text-[10px] rounded font-bold">#{entry.rank}</span>}
                        {entry.isMe && !isWinner(entry) && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                        {!leaderboardPreStart && entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
                        {!leaderboardPreStart && entry.isWithdrawn && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">🚪 Exited</span>}
                        {!leaderboardPreStart && entry.isBlown && !entry.isDisqualified && !entry.isWithdrawn && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">💀</span>}
                      </div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified{entry.isWithdrawn && entry.totalWithdrawn ? ` • withdrew ${formatBalance(entry.totalWithdrawn, entry.accountType, entry.isCent)}` : ""}</p>
                    </div>
                    <p className={`text-sm font-bold ${isWinner(entry) ? "text-profit" : "text-white"}`}>
                      {!leaderboardPreStart && entry.isDisqualified ? <span className="text-loss">DQ</span> : !leaderboardPreStart && entry.isWithdrawn ? <span className="text-gray-400">Exited</span> : formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}
                    </p>
                  </button>
                ))}
              </div>
              )}
              {/* Your Position — pinned context when user is not visible in loaded entries */}
              {myContext.length > 0 && (() => {
                const myRank = myStats?.rank || myContext.find(e => e.isMe)?.rank;
                if (!myRank) return null;
                const loadedRanks = leaderboard.map(e => e.rank);
                const userVisibleInList = loadedRanks.includes(myRank);
                if (userVisibleInList) return null;
                const lastLoadedRank = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].rank : 0;
                const firstLoadedRank = leaderboard.length > 0 ? leaderboard[0].rank : 0;
                const isBelow = myRank > lastLoadedRank;
                const isAbove = myRank < firstLoadedRank;
                if (!isBelow && !isAbove) return null;
                return (
                  <div className={`border-white/10 ${isAbove ? 'border-b' : 'border-t'}`}>
                    <div className="px-4 py-2 bg-royal/5 border-y border-royal/20">
                      <p className="text-[10px] text-royal font-semibold text-center uppercase tracking-wider">Your Position</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {myContext.map((entry) => (
                        <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : "hover:bg-white/5"}`}>
                          <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isMe ? "bg-royal/20 text-royal" : "bg-white/5 text-gray-500"}`}>
                            {entry.rank || "—"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>
                              {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                            </div>
                            <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified</p>
                          </div>
                          <p className="text-sm font-bold text-white">{formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
                {groupTradesByPosition(violations).map(({ positionId, trades: group }) => {
                  if (group.length === 1) {
                    const t = group[0];
                    return (
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
                            <div className="flex gap-4 text-xs text-gray-400"><span>Lots: {t.volume}</span><span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span></div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                  const first = group[0];
                  return (
                    <div key={`g-${positionId}`} className="glass rounded-2xl border border-loss/20 bg-loss/5">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-loss/20 rounded-lg flex-shrink-0"><AlertTriangle size={14} className="text-loss" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-white font-semibold">{first.symbol}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${first.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{first.type}</span>
                              <span className="text-[10px] text-gray-500">{group.length} closes · {formatDate(first.openTime)}</span>
                            </div>
                            {group[0].violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{group[0].violations[0]}</p></div>}
                            <div className="flex gap-4 text-xs text-gray-400"><span>Total profit removed: <span className="text-loss font-semibold">${totalProfit.toFixed(2)}</span></span></div>
                          </div>
                        </div>
                      </div>
                      {group.map(t => (
                        <div key={t.ticket} onClick={() => setSelectedTrade(t)} className="px-4 py-2 border-t border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5">
                          <span className="text-xs text-gray-500">└ Close {formatTimeEAT(t.closeTime)} · {t.volume} lot</span>
                          <span className="text-xs font-semibold text-loss">${t.profit.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>)}
            </div>
            )}
          </>
        </>)}

        {/* ==================== ACTIVE DASHBOARD ==================== */}
        {!loading && !error && isLoggedIn && (isActive || isNotStarted) && myStats && challenge && (<>

          {/* NOT STARTED BANNER */}
          {isNotStarted && (
            <div className="glass rounded-2xl border border-gold/30 bg-gold/5 px-5 py-3 flex items-center gap-3 mb-2">
              <Clock size={16} className="text-gold flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gold">Challenge hasn&apos;t started yet</p>
                <p className="text-xs text-gray-400">Starts {new Date(challenge.startDate).toLocaleString("en-US", { timeZone: "Africa/Nairobi", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} EAT</p>
              </div>
              <button onClick={() => setShowRules(true)} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-gold/20 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/30 transition-all">📋 Rules</button>
            </div>
          )}

          {/* PASSWORD UPDATE BANNER */}
          {myStats.pullStatus === "password_changed" && (
            <PasswordUpdateBanner accountType={myStats.accountType} />
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
                <p className="text-3xl md:text-4xl font-bold gradient-text">{!isNotStarted && myStats.rank ? `#${myStats.rank}` : "—"}</p>
                <p className="text-xs text-gray-500 mt-1">of {totalParticipants || "—"}</p>
              </button>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Profit</p></div>
                <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, effectiveIsCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Total P&L: {formatBalance(myStats.grossProfit, myStats.accountType, effectiveIsCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Balance</p></div>
                <p className="text-3xl md:text-4xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, effectiveIsCent)}</p>
                <p className="text-xs text-gray-500 mt-1">Gross: {formatBalance(myStats.currentBalance, myStats.accountType, effectiveIsCent)}</p>
              </div>
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
                <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{daysLeftLabel}</p></div>
                <p className="text-3xl md:text-4xl font-bold text-gold">{daysLeft}</p>
                <p className="text-xs text-gray-500 mt-1">days remaining</p>
              </div>
            </div>

            {/* BALANCE WARNING BANNER — shown when balance exceeds allowed limit before challenge start */}
            {myStats.balanceWarning && isNotStarted && (
              <div className="glass rounded-2xl p-4 md:p-5 border border-amber-500/30 bg-amber-500/5 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl">⚠️</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-400 mb-1">Balance Too High</p>
                    <p className="text-xs text-gray-300">
                      Your account balance exceeds the challenge starting limit of <b>{formatBalance(challenge.startingBalance, myStats.accountType, effectiveIsCent)}</b>.
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      Please withdraw or transfer the excess amount before the challenge starts. If your balance is still above the limit at challenge start, you will be <span className="text-amber-400 font-semibold">automatically disqualified</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PROGRESS BAR — only show when user has trades and is active */}
            {showProgressBar ? (
              <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-300">Progress to Target</p>
                  {/* Pre-start with balance above starting limit: show warning, not fake progress */}
                  {isNotStarted && myStats.currentBalance > (challenge?.startingBalance || 0) && myStats.totalTrades === 0 ? (
                    <p className="text-sm font-bold text-loss">Balance too high</p>
                  ) : (
                    <p className={`text-sm font-bold ${progressPercent > 0 ? "text-white" : progressPercent < 0 ? "text-loss" : "text-gray-400"}`}>
                      {progressPercent === 0 ? "0%" : `${progressPercent > 0 ? "+" : ""}${progressPercent.toFixed(1)}%`}
                    </p>
                  )}
                </div>
                <div className="relative w-full h-3 bg-white/10 rounded-full overflow-hidden">
                  {isNotStarted && myStats.currentBalance > (challenge?.startingBalance || 0) && myStats.totalTrades === 0 ? (
                    /* Pre-start balance too high: red bar */
                    <div className="h-full rounded-full transition-all duration-500 bg-loss" style={{ width: `${Math.min(100, progressPercent)}%` }} />
                  ) : progressPercent >= 0 ? (
                    <div className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-royal to-profit" style={{ width: `${Math.min(100, progressPercent)}%` }} />
                  ) : (
                    /* Negative: red bar from left, width proportional to loss vs required gain */
                    <div className="h-full rounded-full transition-all duration-500 bg-loss" style={{ width: `${Math.min(50, Math.abs(progressPercent))}%` }} />
                  )}
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-gray-500">{formatBalance(challenge.myStartingBalance ?? challenge.startingBalance, myStats.accountType, effectiveIsCent)}</span>
                  {isNotStarted && myStats.currentBalance > (challenge?.startingBalance || 0) && myStats.totalTrades === 0 ? (
                    <span className="text-loss text-[10px]">Balance higher than allowed starting balance</span>
                  ) : progressPercent < 0 ? (
                    <span className="text-loss text-[10px]">▼ below start</span>
                  ) : null}
                  <span className="text-gray-500">{formatBalance(challenge.targetBalance, myStats.accountType, effectiveIsCent)}</span>
                </div>
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
              <MiniStat label="Removed" value={`${formatBalance(myStats.profitRemoved, myStats.accountType, effectiveIsCent)}`} icon={<Target size={14} />} color="text-royal" />
              <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
                <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
                <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
              </button>
              <MiniStat label="Win Rate (Qualified)" value={`${winRate}%`} icon={<ChevronUp size={14} />} color={winRate >= 50 ? "text-profit" : "text-loss"} />
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
                  <tbody>{groupTradesByPosition(recentTrades).map(({ positionId, trades: group }) => {
                    if (group.length === 1) {
                      const t = group[0];
                      return (
                        <tr key={t.ticket} onClick={() => setSelectedTrade(t)} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${t.slCheckResult === 'conflicting' ? "bg-amber-500/5" : t.slCheckPending ? "bg-gold/5" : !t.isQualified ? "bg-loss/5" : ""}`}>
                          <td className="py-3 px-4 text-xs text-gray-400">{formatDate(t.closeTime)}</td>
                          <td className="py-3 px-4 text-sm text-white font-semibold">{t.symbol}</td>
                          <td className="py-3 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span></td>
                          <td className={`py-3 px-4 text-right text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                          <td className="py-3 px-4 text-center text-xs text-gray-400">{t.volume}</td>
                          <td className="py-3 px-4 text-center">{tradeStatusCell(t)}</td>
                        </tr>
                      );
                    }
                    const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                    const totalVol = group.reduce((s: number, t: Trade) => s + t.volume, 0);
                    const status = groupWorstStatus(group);
                    const first = group[0];
                    return (
                      <React.Fragment key={`g-${positionId}`}>
                        <tr className={`border-b border-white/5 ${status === 'flagged' ? 'bg-loss/5' : status === 'conflicting' ? 'bg-amber-500/5' : ''}`}>
                          <td className="py-2 px-4 text-xs text-gray-400">{formatDate(first.openTime)}</td>
                          <td className="py-2 px-4 text-sm text-white font-semibold">{first.symbol} <span className="text-[10px] text-gray-500 font-normal ml-1">{group.length} closes</span></td>
                          <td className="py-2 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${first.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{first.type}</span></td>
                          <td className={`py-2 px-4 text-right text-sm font-bold ${totalProfit >= 0 ? "text-profit" : "text-loss"}`}>{totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}</td>
                          <td className="py-2 px-4 text-center text-xs text-gray-400">{totalVol.toFixed(2)}</td>
                          <td className="py-2 px-4 text-center">{groupStatusCell(status)}</td>
                        </tr>
                        {group.map(t => (
                          <React.Fragment key={t.ticket}>
                            <tr onClick={() => setSelectedTrade(t)} className={`border-b ${!t.isQualified && t.violations?.length > 0 ? "border-white/0" : "border-white/5"} hover:bg-white/5 cursor-pointer transition-colors ${!t.isQualified ? "bg-loss/5" : ""}`}>
                              <td className="py-2 pl-8 pr-4 text-xs text-gray-500">└ {formatTimeEAT(t.closeTime)}</td>
                              <td></td><td></td>
                              <td className={`py-2 px-4 text-right text-xs font-semibold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
                              <td className="py-2 px-4 text-center text-xs text-gray-400">{t.volume}</td>
                              <td className="py-2 px-4 text-center">{tradeStatusCell(t)}</td>
                            </tr>
                            {!t.isQualified && t.violations?.length > 0 && (
                              <tr className="border-b border-white/5 bg-loss/5">
                                <td colSpan={6} className="pb-2 pl-8 pr-4 text-[10px] text-loss">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : (t.violations[0] as any)?.detail || 'Rule violation'}</td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </React.Fragment>
                    );
                  })}</tbody>
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
                <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">{leaderboardPreStart ? "Pre-start Ranking" : `Leaderboard${myStats?.accountType === 'demo' ? ' — Demo Category' : myStats?.accountType === 'real' ? ' — Real Category' : ''}`}</p></div>
                {leaderboardPreStart ? <span className="text-[10px] text-gold/70 font-semibold uppercase tracking-wider">Based on account balance</span> : <p className="text-xs text-gray-500">Next update: {getNextPullTime()}</p>}
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
                  <button key={entry.rank || entry.nickname} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${isWinner(entry) ? "bg-profit/15 border-l-2 border-profit hover:bg-profit/20" : isAboveTarget(entry) ? "bg-profit/5 border-l-2 border-profit/30 hover:bg-profit/10" : entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""} ${entry.isDisqualified ? "opacity-60 bg-loss/10" : ""} ${(entry.isWithdrawn || entry.isBlown) && !entry.isDisqualified ? "opacity-40 bg-loss/5" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isDisqualified ? "bg-loss/20 text-loss" : (entry.isBlown || entry.isWithdrawn) ? "bg-white/5 text-gray-500" : isWinner(entry) ? "bg-profit/20 text-profit" : isAboveTarget(entry) ? "bg-profit/10 text-profit/70" : "bg-white/5 text-gray-500"}`}>{rankIcon(entry)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${isWinner(entry) ? "text-profit font-bold" : isAboveTarget(entry) ? "text-profit/80" : entry.isMe ? "text-royal" : entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
                        {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                        {entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
                        {entry.isWithdrawn && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">🚪 Exited</span>}
                        {entry.isBlown && !entry.isDisqualified && !entry.isWithdrawn && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">💀</span>}
                      </div>
                      <p className="text-[10px] text-gray-500">{leaderboardPreStart ? entry.accountType : `${entry.totalTrades} trades • ${entry.qualifiedTrades} qualified • ${entry.accountType}${entry.isWithdrawn && entry.totalWithdrawn ? ` • withdrew ${formatBalance(entry.totalWithdrawn, entry.accountType, entry.isCent)}` : ""}`}</p>

                    </div>
                    <p className={`text-sm font-bold ${isWinner(entry) ? "text-profit" : isAboveTarget(entry) ? "text-profit/80" : "text-white"}`}>
                      {entry.isDisqualified ? <span className="text-loss">DQ</span> : entry.isWithdrawn ? <span className="text-gray-400">Exited</span> : formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}
                    </p>
                  </button>
                ))}
              </div>
              )}
              {/* Your Position — pinned context (not-started leaderboard) */}
              {myContext.length > 0 && (() => {
                const myRank = myStats?.rank || myContext.find(e => e.isMe)?.rank;
                if (!myRank) return null;
                const loadedRanks = leaderboard.map(e => e.rank);
                const userVisibleInList = loadedRanks.includes(myRank);
                if (userVisibleInList) return null;
                const lastLoadedRank = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].rank : 0;
                const firstLoadedRank = leaderboard.length > 0 ? leaderboard[0].rank : 0;
                const isBelow = myRank > lastLoadedRank;
                const isAbove = myRank < firstLoadedRank;
                if (!isBelow && !isAbove) return null;
                return (
                  <div className={`border-white/10 ${isAbove ? 'border-b' : 'border-t'}`}>
                    <div className="px-4 py-2 bg-royal/5 border-y border-royal/20">
                      <p className="text-[10px] text-royal font-semibold text-center uppercase tracking-wider">Your Position</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {myContext.map((entry) => (
                        <div key={entry.rank || entry.nickname} className={`w-full flex items-center gap-4 px-4 py-3 text-left ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""}`}>
                          <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isMe ? "bg-royal/20 text-royal" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>
                              {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                            </div>
                            <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified</p>
                          </div>
                          <p className="text-sm font-bold text-white">{formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
                {groupTradesByPosition(violations).map(({ positionId, trades: group }) => {
                  if (group.length === 1) {
                    const t = group[0];
                    return (
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
                            <div className="flex gap-4 text-xs text-gray-400"><span>Lots: {t.volume}</span><span>Profit removed: <span className="text-loss font-semibold">${t.profit.toFixed(2)}</span></span></div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                  const first = group[0];
                  return (
                    <div key={`g-${positionId}`} className="glass rounded-2xl border border-loss/20 bg-loss/5">
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-loss/20 rounded-lg flex-shrink-0"><AlertTriangle size={14} className="text-loss" /></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-white font-semibold">{first.symbol}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${first.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{first.type}</span>
                              <span className="text-[10px] text-gray-500">{group.length} closes · {formatDate(first.openTime)}</span>
                            </div>
                            {group[0].violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{group[0].violations[0]}</p></div>}
                            <div className="flex gap-4 text-xs text-gray-400"><span>Total profit removed: <span className="text-loss font-semibold">${totalProfit.toFixed(2)}</span></span></div>
                          </div>
                        </div>
                      </div>
                      {group.map(t => (
                        <div key={t.ticket} onClick={() => setSelectedTrade(t)} className="px-4 py-2 border-t border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/5">
                          <span className="text-xs text-gray-500">└ Close {formatTimeEAT(t.closeTime)} · {t.volume} lot</span>
                          <span className="text-xs font-semibold text-loss">${t.profit.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
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
                <DRow label="Volume" value={selectedTrade.openingVolume ? `${selectedTrade.volume} / ${selectedTrade.openingVolume} lots` : `${selectedTrade.volume} lots`} />
                <DRow label="Opened" value={formatDate(selectedTrade.openTime)} />
                <DRow label="Entry" value={selectedTrade.openPrice.toString()} />
                <DRow label="Exit" value={selectedTrade.closePrice.toString()} />
                <div className="bg-white/5 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Stop Loss</p>{selectedTrade.stopLoss ? <p className="text-sm font-semibold text-loss">{selectedTrade.stopLoss}</p> : <><p className="text-sm font-semibold text-gray-500">—</p><p className="text-[9px] text-gray-600">not detected at entry</p></>}</div>
                <div className="bg-white/5 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Take Profit</p>{selectedTrade.takeProfit ? <p className="text-sm font-semibold text-profit">{selectedTrade.takeProfit}</p> : <><p className="text-sm font-semibold text-gray-500">—</p><p className="text-[9px] text-gray-600">not detected at entry</p></>}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 flex items-center justify-between">
                <span className="text-sm text-gray-400">Net Profit/Loss</span>
                <span className={`text-lg font-bold ${selectedTrade.profit >= 0 ? "text-profit" : "text-loss"}`}>{selectedTrade.profit >= 0 ? "+" : ""}${selectedTrade.profit.toFixed(2)}</span>
              </div>
              <div className={`p-4 rounded-xl border ${selectedTrade.slCheckResult === 'conflicting' ? "bg-amber-500/10 border-amber-400/30" : selectedTrade.slCheckPending ? "bg-gold/10 border-gold/30" : selectedTrade.isQualified ? "bg-profit/10 border-profit/20" : "bg-loss/10 border-loss/20"}`}>
                {selectedTrade.slCheckResult === 'conflicting' ? (
                  <div>
                    <p className="text-sm text-amber-400 font-semibold flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/30 border border-amber-400/50 text-[10px] font-bold">?</span>
                      Under Investigation
                    </p>
                    <p className="text-xs text-gray-300">
                      This trade is under investigation. Our system has received conflicting results across checks and is re-verifying.
                      This trade is currently treated as qualified. Result may change after the next check.
                    </p>
                  </div>
                ) : selectedTrade.slCheckPending ? (
                  <div>
                    <p className="text-sm text-gold font-semibold flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/30 border border-gold/50 text-[10px] font-bold">⏳</span>
                      Max Risk Check In Progress
                    </p>
                    <p className="text-xs text-gray-300">
                      The max risk candle check for this trade could not be completed yet. Benefit of doubt is applied — this trade is currently treated as qualified.
                    </p>
                  </div>
                ) : selectedTrade.isQualified ? (
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
              <div className="flex items-center gap-3"><Trophy size={20} className="text-gold" /><h3 className="text-lg font-bold text-white">Leaderboard{myStats?.accountType === 'demo' ? ' (Demo Category)' : myStats?.accountType === 'real' ? ' (Real Category)' : ''}</h3></div>
              <button onClick={() => { setShowLeaderboardModal(false); setSelectedUser(null); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            {!selectedUser ? (
              <div className="divide-y divide-white/5">
                {leaderboard.map((entry) => (
                  <button key={entry.rank || entry.nickname} onClick={() => setSelectedUser(entry)} className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors ${isWinner(entry) ? "bg-profit/15 border-l-2 border-profit hover:bg-profit/20" : isAboveTarget(entry) ? "bg-profit/5 border-l-2 border-profit/30 hover:bg-profit/10" : entry.isMe ? "bg-royal/10 border-l-2 border-royal" : ""} ${entry.isDisqualified ? "opacity-60 bg-loss/10" : ""} ${(entry.isWithdrawn || entry.isBlown) && !entry.isDisqualified ? "opacity-40 bg-loss/5" : ""}`}>
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isDisqualified ? "bg-loss/20 text-loss" : (entry.isBlown || entry.isWithdrawn) ? "bg-white/5 text-gray-500" : isWinner(entry) ? "bg-profit/20 text-profit" : isAboveTarget(entry) ? "bg-profit/10 text-profit/70" : "bg-white/5 text-gray-500"}`}>
                      {rankIcon(entry)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-semibold truncate ${isWinner(entry) ? "text-profit font-bold" : isAboveTarget(entry) ? "text-profit/80" : entry.isMe ? "text-royal" : entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
                        {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                        {entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
                        {entry.isWithdrawn && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">🚪 Exited</span>}
                        {entry.isBlown && !entry.isDisqualified && !entry.isWithdrawn && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">💀</span>}
                      </div>
                      <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified{entry.isWithdrawn && entry.totalWithdrawn ? ` • withdrew ${formatBalance(entry.totalWithdrawn, entry.accountType, entry.isCent)}` : ""}</p>
                    </div>
                    <p className={`text-sm font-bold ${entry.isDisqualified ? "text-loss" : isWinner(entry) ? "text-profit" : isAboveTarget(entry) ? "text-profit/80" : "text-white"}`}>
                      {entry.isDisqualified ? "DQ" : entry.isWithdrawn ? <span className="text-gray-400">Exited</span> : formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}
                    </p>
                  </button>
                ))}
                {/* Your Position — pinned context in modal */}
                {myContext.length > 0 && (() => {
                  const myRank = myStats?.rank || myContext.find(e => e.isMe)?.rank;
                  if (!myRank) return null;
                  const loadedRanks = leaderboard.map(e => e.rank);
                  const userVisibleInList = loadedRanks.includes(myRank);
                  if (userVisibleInList) return null;
                  const lastLoadedRank = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].rank : 0;
                  const firstLoadedRank = leaderboard.length > 0 ? leaderboard[0].rank : 0;
                  const isBelow = myRank > lastLoadedRank;
                  const isAbove = myRank < firstLoadedRank;
                  if (!isBelow && !isAbove) return null;
                  return (
                    <div className={`border-white/10 ${isAbove ? 'border-b' : 'border-t'}`}>
                      <div className="px-4 py-2 bg-royal/5 border-y border-royal/20">
                        <p className="text-[10px] text-royal font-semibold text-center uppercase tracking-wider">Your Position</p>
                      </div>
                      <div className="divide-y divide-white/5">
                        {myContext.map((entry) => (
                          <button key={entry.rank || entry.nickname} onClick={() => setSelectedUser(entry)} className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${entry.isMe ? "bg-royal/10 border-l-2 border-royal" : "hover:bg-white/5"}`}>
                            <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isMe ? "bg-royal/20 text-royal" : "bg-white/5 text-gray-500"}`}>{entry.rank || "—"}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-semibold truncate ${entry.isMe ? "text-royal" : "text-white"}`}>{entry.nickname}</p>
                                {entry.isMe && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
                              </div>
                              <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.qualifiedTrades} qualified</p>
                            </div>
                            <p className="text-sm font-bold text-white">{formatBalance(entry.adjustedBalance - (entry.totalWithdrawn || 0), entry.accountType, entry.isCent)}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {leaderboardHasMore && (
                  <div className="p-3 border-t border-white/5 text-center">
                    <button onClick={() => fetchLeaderboard(true)} disabled={leaderboardLoadingMore} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50">
                      {leaderboardLoadingMore ? "Loading..." : `Load More (${leaderboard.length} of ${leaderboardTotal})`}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5">
                <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back to leaderboard</button>
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${selectedUser.isDisqualified ? "bg-loss/20 text-loss" : isWinner(selectedUser) ? "bg-profit/20 text-profit" : "bg-white/10 text-gray-400"}`}>
                    {isWinner(selectedUser) ? "🏆" : `#${selectedUser.rank || "—"}`}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">{selectedUser.nickname}</p>
                    <p className="text-sm text-gray-400">
                      {selectedUser.isDisqualified ? <span className="text-loss font-semibold">Disqualified</span> : selectedUser.isWithdrawn ? <span className="text-gray-400 font-semibold">🚪 User exited the challenge{selectedUser.totalWithdrawn ? ` • withdrew ${formatBalance(selectedUser.totalWithdrawn, selectedUser.accountType, selectedUser.isCent)}` : ''}</span> : selectedUser.isBlown ? <span className="text-gray-400 font-semibold">💀 Balance is zero from trading</span> : <>Balance: <span className="text-white font-semibold">{formatBalance(selectedUser.adjustedBalance - (selectedUser.totalWithdrawn || 0), selectedUser.accountType, selectedUser.isCent)}</span></>}
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
                    const wins = selectedUserTrades.filter((t: any) => t.profit > 0 && t.isQualified !== false);
                    const losses = selectedUserTrades.filter((t: any) => t.profit < 0);
                    const decided = wins.length + losses.length;
                    const wr = decided > 0 ? Math.round((wins.length / decided) * 100) : 0;
                    const aw = wins.length > 0 ? wins.reduce((s: number, t: any) => s + t.profit, 0) / wins.length : 0;
                    const al = losses.length > 0 ? Math.abs(losses.reduce((s: number, t: any) => s + t.profit, 0) / losses.length) : 0;
                    const rr = al > 0 ? aw / al : 0;
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate (Qualified)</p><p className={`text-lg font-bold ${wr >= 50 ? "text-profit" : "text-loss"}`}>{wr}%</p></div>
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{rr > 0 ? rr.toFixed(2) : "—"}</p></div>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Net P&L</p><p className={`text-sm font-bold ${selectedUser.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(selectedUser.qualifiedProfit, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Total P&L</p><p className="text-sm font-bold text-white">{formatBalance(selectedUser.grossProfit, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">P&L Removed</p><p className="text-sm font-bold text-loss">{formatBalance(selectedUser.profitRemoved, selectedUser.accountType, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><p className="text-sm font-bold text-white">{selectedUser.accountType === 'demo' ? 'Demo' : selectedUser.accountType === 'real' ? 'Real' : selectedUser.accountType}</p></div>
                  </div>
                  {/* Account History (trades + balance ops unified, oldest first) */}
                  {(selectedUserTrades.length > 0 || selectedUserBalanceOps.length > 0) && (() => {
                    type FeedItem = { sortTime: number } & ({ kind: 'trade'; group: any[] } | { kind: 'op'; op: any });
                    const feed: FeedItem[] = [];
                    groupTradesByPosition(selectedUserTrades).forEach(({ trades: group }) => {
                      feed.push({ kind: 'trade', group, sortTime: group[0].openTime ? new Date(group[0].openTime).getTime() : 0 });
                    });
                    for (const op of selectedUserBalanceOps) {
                      feed.push({ kind: 'op', op, sortTime: op.op_time ? new Date(op.op_time).getTime() : 0 });
                    }
                    feed.sort((a, b) => b.sortTime - a.sortTime);
                    const opIcon = (t: string) => t === 'deposit' ? '💰' : t === 'withdrawal' ? '🚪' : t === 'swap' ? '🔄' : '📊';
                    const opColor = (t: string) => t === 'deposit' ? 'text-profit' : t === 'withdrawal' ? 'text-loss' : t === 'swap' ? 'text-amber-400' : 'text-blue-400';
                    const fmtEAT = (d: string) => new Date(new Date(d).getTime() + 3*60*60*1000).toISOString().substring(11,16);
                    const cur = (v: number) => selectedUser!.isCent ? `${v.toFixed(2)}¢` : `$${v.toFixed(2)}`;
                    return (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-400 mb-2">Account History</p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {feed.map((item, idx) => {
                            if (item.kind === 'op') {
                              const op = item.op;
                              return (
                                <div key={`op-${op.deal_ticket}`} className="py-2 px-3 rounded-lg bg-white/5 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{opIcon(op.op_type)}</span>
                                    <div>
                                      <p className="text-xs text-white font-medium capitalize">{op.op_type}</p>
                                      <p className="text-[10px] text-gray-500">{op.op_time ? new Date(op.op_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}{op.comment ? ` • ${op.comment}` : ''}</p>
                                    </div>
                                  </div>
                                  <p className={`text-xs font-bold ${opColor(op.op_type)}`}>{op.amount >= 0 ? '+' : ''}{cur(op.amount)}</p>
                                </div>
                              );
                            }
                            const { group } = item;
                            const positionId = group[0].positionId;
                            if (group.length === 1) {
                              const t = group[0];
                              return (
                                <div key={t.ticket} className={`py-2 px-3 rounded-lg ${t.slCheckResult === 'conflicting' ? 'bg-amber-500/5 border border-amber-400/20' : t.slCheckPending ? 'bg-gold/5 border border-gold/20' : !t.isQualified ? 'bg-loss/10 border border-loss/20' : 'bg-white/5'}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.type?.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{t.type}</span>
                                      <div>
                                        <p className="text-xs text-white font-medium">{t.symbol}</p>
                                        <p className="text-[10px] text-gray-500">{t.openTime ? new Date(t.openTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} {t.openTime ? fmtEAT(t.openTime) : ''} → {t.closeTime ? fmtEAT(t.closeTime) : ''}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xs font-bold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{cur(t.profit)}</p>
                                      <p className="text-[10px] text-gray-500">{t.volume} lot {t.slCheckResult === 'conflicting' ? <span title="Under investigation." className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-400 text-[9px] font-bold cursor-help ml-1">?</span> : t.slCheckPending ? <span title="Max risk check pending — result may change" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/20 border border-gold/40 text-gold text-[9px] font-bold cursor-help ml-1">?</span> : !t.isQualified ? <span className="text-loss">🚩</span> : null}</p>
                                    </div>
                                  </div>
                                  {t.slCheckResult === 'conflicting' && <p className="text-[10px] text-amber-400 mt-1 pl-7">⚠ Under investigation. Result may change after the next check.</p>}
                                  {t.slCheckPending && <p className="text-[10px] text-gold mt-1 pl-7">⚠ Max risk check pending — benefit of doubt applied. Result may change.</p>}
                                  {!t.isQualified && t.violations?.length > 0 && <p className="text-[10px] text-loss mt-1 pl-7">⚠️ {typeof t.violations[0] === 'string' ? t.violations[0] : (t.violations[0] as any)?.detail || 'Rule violation'}</p>}
                                </div>
                              );
                            }
                            const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                            const totalVol = group.reduce((s: number, t: Trade) => s + t.volume, 0);
                            const status = groupWorstStatus(group);
                            const first = group[0];
                            return (
                              <div key={`g-${positionId || idx}`} className={`rounded-lg overflow-hidden ${status === 'flagged' ? 'border border-loss/20' : status === 'conflicting' ? 'border border-amber-400/20' : 'border border-white/10'}`}>
                                <div className={`py-2 px-3 ${status === 'flagged' ? 'bg-loss/10' : status === 'conflicting' ? 'bg-amber-500/5' : 'bg-white/5'}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${first.type?.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{first.type}</span>
                                      <div>
                                        <p className="text-xs text-white font-medium">{first.symbol} <span className="text-gray-500 font-normal">{group.length} closes</span></p>
                                        <p className="text-[10px] text-gray-500">{first.openTime ? new Date(first.openTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} {first.openTime ? fmtEAT(first.openTime) : ''}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xs font-bold ${totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>{cur(totalProfit)}</p>
                                      <p className="text-[10px] text-gray-500">{totalVol.toFixed(2)} lot</p>
                                    </div>
                                  </div>
                                </div>
                                {group.map((t: Trade) => (
                                  <div key={t.ticket} className={`py-1.5 px-3 pl-6 border-t border-white/5 ${!t.isQualified ? 'bg-loss/5' : ''}`}>
                                    <div className="flex items-center justify-between">
                                      <p className="text-[10px] text-gray-500">└ → {fmtEAT(t.closeTime)}</p>
                                      <div className="flex items-center gap-3">
                                        <p className="text-[10px] text-gray-500">{t.volume} lot</p>
                                        <p className={`text-[10px] font-semibold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{cur(t.profit)}</p>
                                        <span>{t.slCheckResult === 'conflicting' ? <span className="text-amber-400 text-[10px]">?</span> : !t.isQualified ? <span className="text-loss text-[10px]">🚩</span> : <span className="text-profit text-[10px]">✓</span>}</span>
                                      </div>
                                    </div>
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
              ) : groupTradesByPosition(violations).map(({ positionId, trades: group }) => {
                if (group.length === 1) {
                  const t = group[0];
                  return (
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
                  );
                }
                const totalProfit = group.reduce((s: number, t: Trade) => s + t.profit, 0);
                const first = group[0];
                const allViols = group.flatMap(t => t.violations);
                return (
                  <div key={`g-${positionId}`} className="rounded-xl border border-loss/20 overflow-hidden">
                    <div className="p-4 bg-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold ${first.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{first.type}</span>
                          <span className="text-white font-semibold">{first.symbol}</span>
                          <span className="text-[10px] text-gray-500">{group.length} closes</span>
                        </div>
                        <span className="text-xs text-gray-500">{formatDate(first.openTime)}</span>
                      </div>
                      {allViols.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{allViols[0]}</p></div>}
                      <div className="flex gap-4 text-xs text-gray-400"><span>Total profit removed: <span className="text-loss font-semibold">${totalProfit.toFixed(2)}</span></span></div>
                    </div>
                    {group.map(t => (
                      <div key={t.ticket} className="px-4 py-2 border-t border-white/5 flex items-center justify-between bg-loss/5">
                        <span className="text-xs text-gray-500">└ Close {formatTimeEAT(t.closeTime)} · {t.volume} lot</span>
                        <span className="text-xs font-semibold text-loss">${t.profit.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== CHALLENGE COMPLETED POPUP ==================== */}
      {/* Not-started popup — shows once ever on first sign-in */}
      {showNotStartedPopup && myStats && challenge && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowNotStartedPopup(false)}>
          <div className="glass rounded-2xl max-w-sm w-full border border-gold/30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-gold/20 rounded-xl border border-gold/30">
                    <Clock className="text-gold w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Challenge Not Started</h2>
                    <p className="text-xs text-gray-400">You&apos;re registered!</p>
                  </div>
                </div>
                <button onClick={() => setShowNotStartedPopup(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><X size={16} /></button>
              </div>
              <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-300">
                  <span className="text-white font-semibold">{challenge.title}</span> starts on{" "}
                  <span className="text-gold font-semibold">
                    {new Date(challenge.startDate).toLocaleString("en-US", { timeZone: "Africa/Nairobi", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} EAT
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-1">Registered as <span className="text-white">{myStats.nickname}</span> · {formatSubtype(myStats.accountSubtype, myStats.accountType)}</p>
              </div>
              <p className="text-xs text-gray-400 mb-4">Read the rules carefully before the challenge starts. Trades that violate rules will have profits removed.</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowNotStartedPopup(false); setShowRules(true); }} className="flex-1 py-2.5 rounded-xl bg-gold/20 border border-gold/30 text-gold text-sm font-semibold hover:bg-gold/30 transition-all">📋 See Rules</button>
                <button onClick={() => setShowNotStartedPopup(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/10 transition-all">Got it</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <p className="text-2xl font-bold text-white">{formatBalance(myStats.adjustedBalance, myStats.accountType, effectiveIsCent)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Net Qualified Profit</p>
                  <p className={`text-2xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, myStats.accountType, effectiveIsCent)}</p>
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
                  <p className="text-lg font-bold text-profit">{recentTrades.length > 0 ? `+${formatBalance(Math.max(...recentTrades.map(t => t.profit)), myStats.accountType, effectiveIsCent)}` : "—"}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Worst Trade</p>
                  <p className="text-lg font-bold text-loss">{recentTrades.length > 0 ? formatBalance(Math.min(...recentTrades.map(t => t.profit)), myStats.accountType, effectiveIsCent) : "—"}</p>
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

function PasswordUpdateBanner({ accountType }: { accountType?: string }) {
  const [newPw, setNewPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const botUsername = "birrforex_challenge_bot";
  const isDemo = accountType === "demo";

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
          <h3 className="text-sm font-bold text-loss">{isDemo ? "Account Access Issue" : "Password Update Required"}</h3>
          <p className="text-xs text-gray-400 mt-1">
            {isDemo
              ? "We could not access your Demo account. This may happen if your demo account was deleted or your investor password was changed."
              : "We could not access your MT5 account. Your investor password appears to have been changed. Please enter your new password below."}
          </p>
          <p className="text-xs text-loss mt-1 font-semibold">⏰ Please fix this before the challenge starts or your registration will be disqualified.</p>
        </div>
      </div>

      {/* Option 1: Update Password */}
      {isDemo && <p className="text-xs text-gray-500 font-semibold mt-4 mb-2 border-t border-white/5 pt-3">Option 1: Update Password</p>}
      {isDemo && <p className="text-xs text-gray-400 mb-2">If your account is still active, enter your new investor password:</p>}
      <div className="flex gap-2 mt-2">
        <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New investor password" className="flex-1 p-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
        <button onClick={handleSubmit} disabled={submitting || !newPw} className="px-4 py-2.5 rounded-xl bg-royal/20 border border-royal/30 text-royal text-xs font-bold hover:bg-royal/30 transition-all disabled:opacity-50">{submitting ? "..." : "Update"}</button>
      </div>
      {result && <p className={`text-xs mt-2 font-semibold ${result.startsWith("✅") ? "text-profit" : result.startsWith("⚠️") ? "text-gold" : "text-loss"}`}>{result}</p>}

      {/* Option 2: Change Account (Demo only) */}
      {isDemo && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <p className="text-xs text-gray-500 font-semibold mb-2">Option 2: Change Account Number</p>
          <p className="text-xs text-gray-400 mb-2">If your demo account was deleted:</p>
          <ol className="text-xs text-gray-400 list-decimal list-inside space-y-1 mb-3">
            <li>Open Telegram → <b>@{botUsername}</b></li>
            <li>Send <code>/start</code> → tap &quot;Change Account Number&quot;</li>
            <li>Enter your new MT5 account number, server, and investor password</li>
            <li>Come back here and log in with your new credentials</li>
          </ol>
          <a
            href={`https://t.me/${botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2AABEE]/20 border border-[#2AABEE]/30 text-[#2AABEE] text-xs font-semibold hover:bg-[#2AABEE]/30 transition-all"
          >
            🔄 Open Telegram Bot →
          </a>
        </div>
      )}
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
