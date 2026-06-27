"use client";
import { useState, useEffect, useRef } from "react";

import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Trophy, Users, AlertTriangle, Activity, TrendingUp, Target, Shield, Clock, BarChart3, FileText, X, Key, Loader2, ArrowRight, ChevronDown, ChevronUp, Zap, MessageSquare, UserMinus, Ban, LogOut } from "lucide-react";

export default function AdminDashboard() {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("5");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "leaderboard" | "violations" | "pulls" | "screening" | "participants" | "rules" | "health" | "create" | "settings">("overview");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [selectedParticipantTrades, setSelectedParticipantTrades] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [foundUser, setFoundUser] = useState<any>(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [participantsList, setParticipantsList] = useState<any[]>([]);
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsPagination, setParticipantsPagination] = useState<any>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantFilter, setParticipantFilter] = useState("all");
  const [actionModal, setActionModal] = useState<{ type: string; participant: any } | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState("");
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
    only_cent_account: false,
  });
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesLocked, setRulesLocked] = useState(false);
  const [savedRulesSnapshot, setSavedRulesSnapshot] = useState<any>(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<any>(null);
  const [verifyPopup, setVerifyPopup] = useState<any>(null);

  // Lock scroll on modal
  useEffect(() => {
    if (selectedParticipant) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedParticipant]);

  // Fetch trades for selected participant
  useEffect(() => {
    if (!selectedParticipant || !selectedParticipant.nickname || selectedParticipant.totalTrades === 0) {
      setSelectedParticipantTrades([]);
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    fetch(`${apiUrl}/api/challenges/${selectedChallengeId}/user-trades?nickname=${encodeURIComponent(selectedParticipant.nickname)}`)
      .then(r => r.ok ? r.json() : { trades: [] })
      .then(d => setSelectedParticipantTrades(d.trades || []))
      .catch(() => setSelectedParticipantTrades([]));
  }, [selectedParticipant, selectedChallengeId]);

  const handleAdminLogin = async () => {
    setLoginError(""); setLoginLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: adminPass }),
      });
      if (res.ok) {
        localStorage.setItem("wp_admin_key", adminPass);
        setIsAdmin(true);
      } else if (res.status === 403) {
        setLoginError("Access denied — IP not whitelisted");
      } else {
        setLoginError("Invalid admin key");
      }
    } catch {
      setLoginError("Could not connect to API.");
    }
    setLoginLoading(false);
  };

  // Check admin login on mount
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("wp_admin_key")) setIsAdmin(true);
  }, []);

  // Fetch challenges list after login — use admin endpoint (shows ALL challenges)
  const [challenges, setChallenges] = useState<any[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    const fetchChallenges = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenges`);
        if (res.ok) {
          const data = await res.json();
          if (data.challenges && data.challenges.length > 0) {
            setChallenges(data.challenges);
            setSelectedChallengeId(String(data.challenges[0].id));
          }
        }
      } catch {}
    };
    fetchChallenges();
  }, [isAdmin]);

  // Reset rules state whenever the selected challenge changes
  useEffect(() => {
    setRulesSaved(false);
    setRulesLocked(false);
  }, [selectedChallengeId]);

  // Fetch overview data when challenge changes
  useEffect(() => {
    if (!isAdmin || !selectedChallengeId) return;
    const fetchOverview = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/overview`);
        if (res.ok) {
          const data = await res.json();
          setOverviewData(data);
        }
      } catch {}
    };
    fetchOverview();
  }, [isAdmin, selectedChallengeId]);

  // Fetch actual saved rules when Rules tab is opened or challenge changes
  useEffect(() => {
    if (!isAdmin || activeSection !== "rules" || !selectedChallengeId) return;
    const fetchRules = async () => {
      setRulesLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/rules`);
        if (res.ok) {
          const data = await res.json();
          setRulesLocked(data.locked || false);
          if (data.rules) {
            const loaded = {
              max_lot_size: data.rules.max_lot_size ?? 0.02,
              max_open_trades: data.rules.max_open_trades ?? 3,
              pair_limit: data.rules.pair_limit ?? 2,
              stop_loss_required: data.rules.stop_loss_required ?? true,
              max_risk_dollars: data.rules.max_risk_dollars ?? 5,
              daily_loss_cap: data.rules.daily_loss_cap ?? 10,
              max_hold_hours: data.rules.max_hold_hours ?? 24,
              weekend_trading: data.rules.weekend_trading ?? false,
              min_active_days: data.rules.min_active_days ?? 7,
              only_cent_account: data.rules.only_cent_account ?? false,
            };
            setRulesConfig(loaded);
            setSavedRulesSnapshot(loaded);
          }
          // If locked, also reset saved state so button reflects current status
          if (data.locked) setRulesSaved(false);
        }
      } catch {}
      setRulesLoading(false);
    };
    fetchRules();
  }, [isAdmin, activeSection, selectedChallengeId]);

  // Fetch participants when tab is active or page changes
  useEffect(() => {
    if (!isAdmin || activeSection !== "participants" || !selectedChallengeId) return;
    const fetchParticipants = async () => {
      setParticipantsLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/participants?page=${participantsPage}`);
        if (res.ok) {
          const data = await res.json();
          let filtered = data.participants || [];
          // Client-side filter
          if (participantFilter === "demo") filtered = filtered.filter((p: any) => p.accountType === "demo");
          else if (participantFilter === "real") filtered = filtered.filter((p: any) => p.accountType === "real");
          else if (participantFilter === "disqualified") filtered = filtered.filter((p: any) => p.disqualified);
          else if (participantFilter === "password_changed") filtered = filtered.filter((p: any) => p.pullStatus === "password_changed");
          setParticipantsList(filtered);
          setParticipantsPagination(data.pagination || null);
        }
      } catch {}
      setParticipantsLoading(false);
    };
    fetchParticipants();
  }, [isAdmin, activeSection, selectedChallengeId, participantsPage, participantFilter]);

  // Handle admin actions (DM, unverify, disqualify)
  const handleAction = async (type: string, participant: any, message: string) => {
    setActionLoading(true);
    setActionResult("");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";

    try {
      let endpoint = "";
      if (type === "unverify") endpoint = `${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/unverify`;
      else if (type === "disqualify") endpoint = `${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/disqualify`;

      const body: any = { registrationId: participant.id, reason: message };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        setActionResult(`✅ ${type === 'unverify' ? 'Registration removed' : 'Participant disqualified'}${data.dmSent ? ' (DM sent)' : data.dmSent === false ? ' (DM failed)' : ''}`);
        // Refresh participants list after action
        setTimeout(() => { setActionModal(null); setActionMessage(""); setActionResult(""); setParticipantsPage(participantsPage); }, 1500);
      } else {
        setActionResult(`❌ ${data.error || data.note || 'Action failed'}`);
      }
    } catch (e) {
      setActionResult("❌ Network error");
    }
    setActionLoading(false);
  };

  const handleSearch = async () => {
    setSearchPerformed(true);
    setFoundUser(null);
    const q = searchQuery.trim();
    if (!q) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
      const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/finduser?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          setFoundUser(data.user);
        }
      }
    } catch {}
  };

  // Challenge info from API
  const selectedChallenge = challenges.find((c: any) => String(c.id) === selectedChallengeId);
  const challenge = selectedChallenge ? {
    id: selectedChallenge.id,
    title: selectedChallenge.title,
    status: selectedChallenge.status,
    type: selectedChallenge.type,
  } : { id: selectedChallengeId, title: "Loading...", status: "—", type: "—" };

  // Currency helper — shows ¢ for cent-only real challenges, $ otherwise
  const selectedChall = challenges.find(c => String(c.id) === selectedChallengeId);
  const isCentChallenge = rulesConfig.only_cent_account && selectedChall?.type !== 'demo';
  const cur = (amount: number | string | null | undefined, userIsCent?: boolean) => {
    if (amount == null) return "—";
    const num = Number(amount);
    if (isNaN(num)) return "—";
    const showCent = userIsCent !== undefined ? userIsCent : isCentChallenge;
    return showCent ? `${num.toFixed(2)}¢` : `$${num.toFixed(2)}`;
  };

  // Use real data from API or fallback to zeros
  const od = overviewData;
  const overview = {
    totalParticipants: od?.participants?.total || 0,
    demoParticipants: od?.participants?.demo || 0,
    realParticipants: od?.participants?.real || 0,
    totalTrades: od?.trades?.total || 0,
    avgTradesPerUser: od?.participants?.total ? Math.round((od?.trades?.total || 0) / od.participants.total) : 0,
    totalVolume: od?.trades?.totalVolume || 0,
    totalViolations: od?.trades?.violations || 0,
    violationRate: od?.trades?.total ? ((od?.trades?.violations || 0) / od.trades.total * 100).toFixed(1) : "0",
    pullsToday: od?.pulls?.today || 0,
    pullsSuccess: od?.pulls?.success || 0,
    pullsFailed: od?.pulls?.failed || 0,
    passwordChanged: od?.pulls?.passwordChanged || 0,
    realBalance: od?.balance?.real?.toFixed(2) || "0.00",
    demoBalance: od?.balance?.demo?.toFixed(2) || "0.00",
    aboveTarget: od?.qualified || 0,
    qualifiedCount: od?.qualified || 0,
    lastPullTime: od?.pulls?.lastPullAt ? (() => { const d = new Date(new Date(od.pulls.lastPullAt).getTime() + 3*60*60*1000); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : "—",
    nextPullTime: (() => { const now = new Date(Date.now() + 3*60*60*1000); const h = now.getUTCHours(); const schedule = [0,4,8,12,16,20]; const next = schedule.find(s => s > h); return next !== undefined ? `${String(next).padStart(2,"0")}:00 EAT` : "00:00 EAT"; })(),
  };

  const [pullHistory, setPullHistory] = useState<any[]>([]);
  const [terminalStatus, setTerminalStatus] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardPreStart, setLeaderboardPreStart] = useState(false);
  const [leaderboardCategory, setLeaderboardCategory] = useState<"all" | "demo" | "real">("all");
  const [flaggedParticipants, setFlaggedParticipants] = useState<any[]>([]);
  const [screeningData, setScreeningData] = useState<any>(null);

  const topViolations = flaggedParticipants.flatMap(p => p.rules || []).reduce((acc: any[], rule: string) => {
    const existing = acc.find(v => v.rule === rule);
    if (existing) existing.count++;
    else acc.push({ rule, count: 1 });
    return acc;
  }, []).sort((a: any, b: any) => b.count - a.count).slice(0, 5);

  // Fetch leaderboard when leaderboard tab is active
  useEffect(() => {
    if (!isAdmin || activeSection !== "leaderboard" || !selectedChallengeId) return;
    const fetchLeaderboard = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/admin-leaderboard?category=${leaderboardCategory}`);
        if (res.ok) {
          const data = await res.json();
          setLeaderboard(data.leaderboard || []);
          setLeaderboardPreStart(data.preStart || false);
        }
      } catch {}
    };
    fetchLeaderboard();
  }, [isAdmin, activeSection, selectedChallengeId, leaderboardCategory]);

  // Fetch violations when violations tab OR overview is active
  useEffect(() => {
    if (!isAdmin || !selectedChallengeId) return;
    if (activeSection !== "violations" && activeSection !== "overview") return;
    const fetchViolations = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/violations`);
        if (res.ok) {
          const data = await res.json();
          setFlaggedParticipants((data.violations || []).map((v: any) => ({
            nickname: v.nickname || v.username,
            account: v.account_number,
            violations: parseInt(v.violation_count),
            profitRemoved: parseFloat(v.profit_removed),
            flaggedTrades: v.flagged_trades || [],
            rules: (v.flagged_trades || []).slice(0, 5).map((t: any) => {
              const violations = typeof t.violations === 'string' ? JSON.parse(t.violations) : (t.violations || []);
              return violations[0] || 'Rule violation';
            }),
          })));
        }
      } catch {}
    };
    fetchViolations();
  }, [isAdmin, activeSection, selectedChallengeId]);

  // Fetch pull data when pulls tab is active
  const [slFailures, setSlFailures] = useState<any[]>([]);
  useEffect(() => {
    if (!isAdmin || activeSection !== "pulls" || !selectedChallengeId) return;
    const fetchPulls = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/pulls`);
        if (res.ok) {
          const data = await res.json();
          const pulls = (data.pulls || []).map((p: any) => {
            const startEAT = new Date(new Date(p.started_at).getTime() + 3*60*60*1000);
            const duration = p.completed_at ? Math.round((new Date(p.completed_at).getTime() - new Date(p.started_at).getTime()) / 1000) : null;
            return {
              time: `${startEAT.getUTCHours().toString().padStart(2,'0')}:${startEAT.getUTCMinutes().toString().padStart(2,'0')}`,
              success: p.successful || 0,
              failed: p.failed || 0,
              passwordChanged: 0,
              newTrades: p.new_trades_found || 0,
              duration: duration ? `${duration}s` : "...",
              status: p.status,
              isPreStart: p.error_log === 'pre_start_check',
            };
          });
          setPullHistory(pulls);

          // Terminal stats — use real DB data if available, otherwise default all-healthy
          const dbStats: any[] = data.terminalStats || [];
          const termStats = Array.from({length: 10}, (_, i) => {
            const t = dbStats.find((s: any) => s.terminal_id === i + 1);
            return t
              ? { id: i + 1, healthy: t.is_healthy, processed: t.total_processed, success: t.total_success, failed: t.total_failed }
              : { id: i + 1, healthy: true, processed: 0, success: 0, failed: 0 };
          });
          setTerminalStatus(termStats);

          // SL failures
          setSlFailures(data.slFailures || []);
        }
      } catch {}
    };
    fetchPulls();
  }, [isAdmin, activeSection, selectedChallengeId]);

  // Fetch screening data when screening tab is active
  useEffect(() => {
    if (!isAdmin || activeSection !== "screening" || !selectedChallengeId) return;
    const fetchScreening = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/screening`);
        if (res.ok) {
          const data = await res.json();
          setScreeningData(data);
        }
      } catch {}
    };
    fetchScreening();
  }, [isAdmin, activeSection, selectedChallengeId]);

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
            <p className="text-gray-400 text-sm mb-6">Enter admin credentials</p>
            {loginError && <div className="p-3 rounded-xl bg-loss/10 border border-loss/30 mb-4"><p className="text-sm text-loss">{loginError}</p></div>}
            <form onSubmit={(e) => { e.preventDefault(); handleAdminLogin(); }} className="space-y-4" autoComplete="on">
              <input type="hidden" name="username" value="admin" autoComplete="username" />
              <Input type="password" name="password" autoComplete="current-password" placeholder="Admin key" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} />
              <button type="submit" disabled={loginLoading || !adminPass} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold disabled:opacity-50">
                {loginLoading ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />} Access Dashboard
              </button>
            </form>
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
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Image src="/winnerpip-icon.png" alt="WinnerPip" width={28} height={28} className="rounded-lg flex-shrink-0" />
              <div className="min-w-0">
                <select value={selectedChallengeId} onChange={(e) => setSelectedChallengeId(e.target.value)} className="bg-transparent text-xs sm:text-sm font-bold text-white border-none outline-none cursor-pointer max-w-[140px] sm:max-w-none truncate">
                  {challenges.length > 0 ? challenges.map(c => (
                    <option key={c.id} value={String(c.id)} className="bg-[#0f1629] text-white">{c.title} ({c.status})</option>
                  )) : <option value="5" className="bg-[#0f1629]">Challenge 15</option>}
                </select>
                <p className="text-[10px] sm:text-xs text-royal font-semibold">ADMIN PANEL</p>
              </div>
              <button onClick={() => setActiveSection("create")} className="px-2 sm:px-3 py-1.5 rounded-lg bg-profit/20 border border-profit/30 text-profit text-[10px] sm:text-xs font-bold hover:bg-profit/30 transition-all flex-shrink-0">+ New</button>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <span className={`hidden sm:inline px-3 py-1 rounded-full text-xs font-semibold border ${challenge.status === "active" ? "bg-profit/20 text-profit border-profit/30" : "bg-white/10 text-gray-300 border-white/20"}`}>● {challenge.status}</span>
              <span className="text-xs text-gray-500">{overview.totalParticipants} <span className="hidden sm:inline">users</span></span>
              <button onClick={() => { localStorage.removeItem("wp_admin_key"); window.location.reload(); }} title="Logout" className="p-1.5 rounded-lg hover:bg-loss/20 text-gray-400 hover:text-loss transition-all">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl relative">
        {/* NAV TABS — scrollable on mobile with scroll indicator */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto scrollbar-hide">
          {(["overview", "participants", "leaderboard", "violations", "pulls", "screening", "rules", "settings", "health"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSection(tab)} className={`flex-shrink-0 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all capitalize ${activeSection === tab ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{tab === "health" ? "⚡" : tab}</button>
          ))}
        </div>

        {/* ==================== OVERVIEW ==================== */}
        {activeSection === "overview" && (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <StatCard icon={<Users size={16} />} label="Participants" value={overview.totalParticipants.toLocaleString()} sub={`Demo: ${overview.demoParticipants} | Real: ${overview.realParticipants}`} color="text-royal" />
            <StatCard icon={<Activity size={16} />} label="Total Trades" value={overview.totalTrades.toLocaleString()} sub={`Avg ${overview.avgTradesPerUser}/user • ${overview.totalVolume} lots`} color="text-white" />
            <StatCard icon={<AlertTriangle size={16} />} label="Violations" value={overview.totalViolations.toString()} sub={`${overview.violationRate}% violation rate`} color="text-loss" />
            <StatCard icon={<Trophy size={16} />} label="Above Target" value={overview.aboveTarget.toString()} sub={`${((overview.aboveTarget / overview.totalParticipants) * 100).toFixed(1)}% qualified`} color="text-gold" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
            <StatCard icon={<Target size={16} />} label="Total Balance" value={`$${overview.realBalance}`} sub={`Real: $${overview.realBalance} | Demo: $${overview.demoBalance}`} color="text-profit" />
            <StatCard icon={<Zap size={16} />} label="Pulls Today" value={overview.pullsToday.toString()} sub={`Next: ${overview.nextPullTime}`} color="text-royal" />
            <StatCard icon={<Shield size={16} />} label="Pull Success" value={overview.pullsSuccess.toString()} sub={`Failed: ${overview.pullsFailed} | PW Changed: ${overview.passwordChanged}`} color="text-profit" />
            <StatCard icon={<Clock size={16} />} label="Last Pull" value={overview.lastPullTime} sub={`${overview.pullsSuccess} ok · ${overview.pullsFailed} failed`} color="text-gray-300" />
          </div>

          {/* Top Violations Breakdown */}
          <div className="glass rounded-2xl border border-white/10 p-5 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Top Rule Violations</h3>
            <div className="space-y-3">
              {topViolations.length === 0 ? <p className="text-sm text-gray-500">No violation data yet — will populate after VPS pulls begin</p> : topViolations.map((v: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1"><span className="text-sm text-gray-300">{v.rule}</span><span className="text-xs text-gray-500">{v.count}</span></div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-loss/60 rounded-full" style={{ width: `${Math.min((v.count / Math.max(...topViolations.map((x: any) => x.count), 1)) * 100, 100)}%` }} /></div>
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
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Trophy size={16} className="text-gold" /> {leaderboardPreStart ? "Pre-start Ranking" : "Leaderboard"}</h3>
              <div className="flex items-center gap-2">
                {leaderboardPreStart && <span className="text-[10px] text-gold/70 font-semibold uppercase tracking-wider">Ranked by account balance</span>}
                <div className="flex gap-1">
                  {(["all", "real", "demo"] as const).map(cat => (
                    <button key={cat} onClick={() => setLeaderboardCategory(cat)} className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all capitalize ${leaderboardCategory === cat ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-500 hover:text-white"}`}>{cat}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="border-b border-white/5">
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">#</th>
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Nickname</th>
                  <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-[10px] text-gray-400 uppercase">Balance / Gross</th>
                  {!leaderboardPreStart && <><th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Trades</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Win%</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Profit</th>
                  <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Violations</th></>}
                </tr></thead>
                <tbody>{leaderboard.length === 0 ? <tr><td colSpan={leaderboardPreStart ? 4 : 8} className="py-8 text-center text-gray-500">No leaderboard data yet — will populate after VPS pulls and evaluation</td></tr> : leaderboard.map((e: any) => (
                  <tr key={e.rank || e.nickname} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${e.isDisqualified ? "opacity-50" : ""}`} onClick={() => setSelectedParticipant(e)}>
                    <td className="py-3 px-4"><span className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : e.rank && e.rank <= 3 ? "text-gold" : "text-gray-400"}`}>{e.rank || (e.notYetEvaluated ? <span className="text-[10px] text-gray-600">—</span> : "—")}</span></td>
                    <td className="py-3 px-4 text-sm text-white font-semibold">{e.nickname}{e.isDisqualified ? <span className="ml-2 text-[10px] text-loss">DQ</span> : ""}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-[10px] font-semibold ${e.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{e.accountType}</span></td>
                    <td className="py-3 px-4 text-right">
                      <p className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : "text-white"}`}>{e.isDisqualified ? "DQ" : e.isCent ? `${Number(e.adjustedBalance).toFixed(2)}¢` : `$${Number(e.adjustedBalance).toFixed(2)}`}</p>
                      {!e.isDisqualified && <p className="text-[10px] text-gray-500 mt-0.5">{e.isCent ? `${Number(e.currentBalance).toFixed(2)}¢` : `$${Number(e.currentBalance).toFixed(2)}`}</p>}
                    </td>
                    {!leaderboardPreStart && <><td className="py-3 px-4 text-center text-sm text-gray-400">{e.totalTrades}</td>
                    <td className="py-3 px-4 text-center text-sm text-gray-400">{e.totalTrades > 0 ? `${Math.round((e.qualifiedTrades / e.totalTrades) * 100)}%` : "—"}</td>
                    <td className="py-3 px-4 text-center text-sm text-royal">{e.totalTrades > 0 ? (e.isCent ? `${Number(e.qualifiedProfit).toFixed(2)}¢` : `$${Number(e.qualifiedProfit).toFixed(2)}`) : "—"}</td>
                    <td className="py-3 px-4 text-center">{e.flaggedTrades > 0 ? <span className="text-loss font-bold">{e.flaggedTrades}</span> : <span className="text-profit">✓</span>}</td></>}
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
              {flaggedParticipants.length === 0 ? (
                <p className="text-sm text-gray-500">No violations detected yet.</p>
              ) : (
              <div className="space-y-3">
                {flaggedParticipants.map((p, i) => (
                  <details key={i} className="group">
                    <summary className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-loss/30 transition-all cursor-pointer list-none">
                      <div>
                        <p className="text-white font-semibold">{p.nickname}</p>
                        <p className="text-xs text-gray-500">Acct: {p.account}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-loss font-bold">{p.violations} flags</p>
                        <p className="text-xs text-gray-500">{isCentChallenge ? `${p.profitRemoved.toFixed(2)}¢` : `$${p.profitRemoved.toFixed(2)}`} removed</p>
                      </div>
                    </summary>
                    <div className="mt-2 ml-4 space-y-2">
                      {(p.flaggedTrades || []).map((t: any, j: number) => {
                        const violations = typeof t.violations === 'string' ? JSON.parse(t.violations) : (t.violations || []);
                        return (
                          <div key={j} className="p-3 bg-loss/5 rounded-lg border border-loss/10">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-white font-medium">{t.symbol} #{t.ticket}</span>
                              <span className={`text-xs font-bold ${parseFloat(t.profit) >= 0 ? 'text-profit' : 'text-loss'}`}>{isCentChallenge ? `${parseFloat(t.profit).toFixed(2)}¢` : `$${parseFloat(t.profit).toFixed(2)}`}</span>
                            </div>
                            {violations.map((v: string, k: number) => (
                              <p key={k} className="text-[10px] text-loss">⚠️ {v}</p>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== PULL HISTORY + TERMINALS ==================== */}
        {activeSection === "pulls" && (
          <PullsTab challengeId={selectedChallengeId} pullHistory={pullHistory} terminalStatus={terminalStatus} slFailures={slFailures} />
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
                    <div className="flex items-center gap-3 mb-1"><p className="text-xl font-bold text-white">{foundUser.nickname}</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${foundUser.accountType === "real" ? "bg-gold/20 text-gold" : "bg-royal/20 text-royal"}`}>{foundUser.accountType}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-profit/20 text-profit">Rank #{foundUser.rank || "N/A"}</span></div>
                    <p className="text-sm text-gray-400">@{foundUser.username} • {foundUser.email}</p>
                  </div>
                  <button onClick={() => { setFoundUser(null); setSearchPerformed(false); setSearchQuery(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Balance</p><p className="text-lg font-bold text-white">{cur(foundUser.balance, foundUser.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Qualified Profit</p><p className="text-lg font-bold text-profit">{cur(foundUser.qualifiedProfit, foundUser.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Profit Removed</p><p className="text-lg font-bold text-loss">{cur(foundUser.profitRemoved, foundUser.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Win Rate</p><p className="text-lg font-bold text-white">{foundUser.winRate || "N/A"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{foundUser.totalTrades || 0}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Avg RR</p><p className="text-lg font-bold text-royal">{foundUser.avgRR ? Number(foundUser.avgRR).toFixed(1) + "R" : "N/A"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${foundUser.flaggedTrades > 0 ? "text-loss" : "text-profit"}`}>{foundUser.flaggedTrades}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Active Days</p><p className="text-lg font-bold text-white">{foundUser.activeDays}</p></div>
                </div>
                <div className="px-5 pb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Account #</p><p className="text-sm font-semibold text-white">{foundUser.accountNumber}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Server</p><p className="text-sm font-semibold text-white">{foundUser.server}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Telegram ID</p><p className="text-sm font-semibold text-white">{foundUser.telegramId}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Registered</p><p className="text-sm font-semibold text-white">{foundUser.registeredAt ? (() => { const d = new Date(new Date(foundUser.registeredAt).getTime() + 3*60*60*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : "—"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Last Pull</p><p className="text-sm font-semibold text-white">{foundUser.lastPull ? (() => { const d = new Date(new Date(foundUser.lastPull).getTime() + 3*60*60*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : "—"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Partner</p><p className="text-sm font-semibold text-profit">{foundUser.partnerStatus}</p></div>
                </div>
                {foundUser.violations && foundUser.violations.length > 0 && (<div className="px-5 pb-3"><p className="text-xs font-semibold text-loss mb-2">Violations ({foundUser.violations.length})</p><div className="space-y-1">{foundUser.violations.map((v: string, i: number) => (<div key={i} className="flex items-center gap-2 p-2 bg-loss/5 rounded-lg border border-loss/10"><AlertTriangle size={12} className="text-loss flex-shrink-0" /><p className="text-xs text-gray-300">{v}</p></div>))}</div></div>)}
                <div className="px-5 pb-3"><p className="text-xs font-semibold text-gray-300 mb-2">Recent Trades</p>{foundUser.recentTrades && foundUser.recentTrades.length > 0 ? <div className="space-y-2">{foundUser.recentTrades.map((t: any, i: number) => (<div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"><div className="flex items-center gap-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span><div><p className="text-sm text-white font-semibold">{t.symbol}</p><p className="text-[10px] text-gray-500">{t.volume} lots</p></div></div><div className="text-right"><p className={`text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{cur(t.profit, foundUser.isCent)}</p></div></div>))}</div> : <p className="text-sm text-gray-500">No trades yet</p>}</div>
                <div className="p-5 border-t border-white/10 space-y-2">
                  <button onClick={() => { const data = foundUser; const toEAT = (d:string) => { if(!d) return "—"; const dt = new Date(new Date(d).getTime()+3*60*60*1000); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")} ${String(dt.getUTCHours()).padStart(2,"0")}:${String(dt.getUTCMinutes()).padStart(2,"0")} EAT`; }; const rows = [["Field","Value"],["Nickname",data.nickname],["Username",data.username],["Email",data.email],["Account",data.accountNumber],["Type",data.accountType],["Server",data.server],["Balance",data.balance != null ? data.balance : "N/A"],["Qualified Profit",data.qualifiedProfit],["Gross Profit",data.grossProfit],["Profit Removed",data.profitRemoved],["Trades",data.totalTrades],["Flagged",data.flaggedTrades],["Active Days",data.activeDays],["Rank",data.rank || "N/A"],["Registered (EAT)",toEAT(data.registeredAt)],["Last Pull (EAT)",toEAT(data.lastPull)],["Partner",data.partnerStatus]]; const csv=rows.map((r:any)=>r.join(",")).join("\n"); const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${data.nickname}_${data.accountNumber}_summary.csv`; a.click(); }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-royal/20 border border-royal/30 hover:bg-royal/30 text-royal font-semibold transition-all text-sm"><FileText size={16} />Export User Summary (CSV)</button>
                  <button onClick={async () => { const data = foundUser; if(!data.id){ alert("No user data"); return; } try { const _api = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com"; const _path = process.env.NEXT_PUBLIC_ADMIN_PATH || ""; const res = await fetch(`${_api}/api/admin/${_path}/challenge/${selectedChallengeId}/user-evaluation?registration_id=${data.id}`); if (!res.ok) { alert("Failed to fetch evaluation"); return; } const result = await res.json(); const blob = new Blob([result.report], {type:"text/plain"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${data.nickname || data.accountNumber}_evaluation_report.txt`; a.click(); } catch { alert("Export failed"); } }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-profit/20 border border-profit/30 hover:bg-profit/30 text-profit font-semibold transition-all text-sm"><FileText size={16} />Export Evaluation Report</button>
                  <button onClick={async () => { const data = foundUser; if(!data.id){ alert("No user data"); return; } try { const _api = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com"; const _path = process.env.NEXT_PUBLIC_ADMIN_PATH || ""; const res = await fetch(`${_api}/api/admin/${_path}/challenge/${selectedChallengeId}/export-user-trades?registration_id=${data.id}`); if (!res.ok) { alert("Export failed"); return; } const result = await res.json(); const html = generateTradesHTML(result); const blob = new Blob([html], {type:"text/html"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${result.user?.nickname || data.nickname || data.accountNumber}_MT5_history.html`; a.click(); URL.revokeObjectURL(url); } catch { alert("Export failed"); } }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-semibold transition-all text-sm"><FileText size={16} />Export MT5 Trade History</button>
                </div>
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

            {/* Paginated Participants List */}
            {!searchPerformed && (
              <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-semibold text-white">All Participants</p>
                  <div className="flex items-center gap-2">
                    {/* Filter buttons */}
                    <select value={participantFilter} onChange={(e) => { setParticipantFilter(e.target.value); setParticipantsPage(1); }} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-royal/50">
                      <option value="all">All</option>
                      <option value="demo">Demo</option>
                      <option value="real">Real</option>
                      <option value="disqualified">Disqualified</option>
                      <option value="password_changed">Password Changed</option>
                    </select>
                    {participantsPagination && <p className="text-xs text-gray-500">Page {participantsPagination.page}/{participantsPagination.totalPages} ({participantsPagination.total})</p>}
                  </div>
                </div>
                {participantsLoading ? (
                  <div className="p-8 text-center"><Loader2 className="w-6 h-6 text-royal animate-spin mx-auto" /></div>
                ) : participantsList.length === 0 ? (
                  <div className="p-8 text-center"><p className="text-gray-400 text-sm">No participants yet</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead><tr className="border-b border-white/5">
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">#</th>
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Nickname</th>
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Username</th>
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Email</th>
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Account</th>
                        <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Type</th>
                        <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Balance</th>
                        <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Profit</th>
                        <th className="text-center py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Trades</th>
                        <th className="text-center py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Actions</th>
                      </tr></thead>
                      <tbody>{participantsList.map((p) => (
                        <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${p.disqualified ? "opacity-50 bg-loss/5" : ""}`} onClick={() => { const q = p.nickname || p.accountNumber; const input = document.querySelector('input[placeholder*="Username"]') as HTMLInputElement; if (input) { const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; nativeInputValueSetter?.call(input, q); input.dispatchEvent(new Event('input', { bubbles: true })); } setTimeout(() => { const btn = document.querySelector('button.bg-gradient-brand') as HTMLButtonElement; if (btn) btn.click(); }, 100); }}>
                          <td className="py-2 px-3 text-xs text-gray-500">{p.rank || "—"}</td>
                          <td className="py-2 px-3 text-sm text-white font-medium">{p.nickname || "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-400">{p.username ? `@${p.username}` : "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate">{p.email || "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-300">{p.accountNumber}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{p.accountType}</span></td>
                          <td className="py-2 px-3 text-right"><span className="text-sm text-white font-medium">{cur(p.balance, p.isCent)}</span>{p.adjustedBalance != null && <p className="text-[9px] text-gray-400">Adj: {cur(p.adjustedBalance, p.isCent)}</p>}{p.lastPullAt && <p className="text-[9px] text-gray-500">{(() => { const d = new Date(new Date(p.lastPullAt).getTime() + 3*60*60*1000); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })()}</p>}</td>
                          <td className={`py-2 px-3 text-right text-sm font-medium ${(p.qualifiedProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>{p.qualifiedProfit != null ? cur(p.qualifiedProfit, p.isCent) : "—"}</td>
                          <td className="py-2 px-3 text-center text-xs text-gray-400">{p.totalTrades}</td>
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <VerifyButton challengeId={selectedChallengeId} registrationId={p.id} onResult={(data: any) => setVerifyPopup({ ...data, isCent: p.isCent, accountSubtype: p.accountSubtype })} />
                              <button onClick={() => setActionModal({ type: 'unverify', participant: p })} title="Remove Registration" className="p-1.5 rounded-lg hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 transition-all"><UserMinus size={14} /></button>
                              {!p.disqualified && <button onClick={() => setActionModal({ type: 'disqualify', participant: p })} title="Disqualify" className="p-1.5 rounded-lg hover:bg-loss/20 text-gray-400 hover:text-loss transition-all"><Ban size={14} /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                {/* Pagination */}
                {participantsPagination && participantsPagination.totalPages > 1 && (
                  <div className="p-3 border-t border-white/5 flex items-center justify-between">
                    <button onClick={() => setParticipantsPage(Math.max(1, participantsPage - 1))} disabled={participantsPage <= 1} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Previous</button>
                    <span className="text-xs text-gray-500">Page {participantsPagination.page} of {participantsPagination.totalPages}</span>
                    <button onClick={() => setParticipantsPage(Math.min(participantsPagination.totalPages, participantsPage + 1))} disabled={participantsPage >= participantsPagination.totalPages} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next →</button>
                  </div>
                )}
              </div>
            )}

            {/* Action Modal */}
            {actionModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActionModal(null)}>
                <div className="glass rounded-2xl max-w-md w-full border border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-1">
                    {actionModal.type === 'unverify' && '⚠️ Remove Registration'}
                    {actionModal.type === 'disqualify' && '🚫 Disqualify Participant'}
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">
                    To: <span className="text-white font-medium">{actionModal.participant.nickname || actionModal.participant.username || actionModal.participant.accountNumber}</span>
                  </p>
                  <textarea
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    placeholder="Enter reason..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-royal/50 resize-none h-24 mb-4"
                  />
                  <div className="flex gap-3">
                    <button onClick={() => setActionModal(null)} className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all">Cancel</button>
                    <button
                      onClick={() => handleAction(actionModal.type, actionModal.participant, actionMessage)}
                      disabled={!actionMessage.trim() || actionLoading}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                        actionModal.type === 'unverify' ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' :
                        'bg-loss/20 text-loss hover:bg-loss/30'
                      }`}
                    >
                      {actionLoading ? 'Processing...' : actionModal.type === 'unverify' ? 'Remove' : 'Disqualify'}
                    </button>
                  </div>
                  {actionResult && <p className={`text-xs mt-3 ${actionResult.includes('✅') ? 'text-profit' : 'text-loss'}`}>{actionResult}</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== SCREENING (Allocation/Partner Checks) ==================== */}
        {activeSection === "screening" && (
          <div className="space-y-6">
            {!screeningData ? (
              <div className="glass rounded-2xl border border-white/10 p-8 text-center">
                <Loader2 className="w-8 h-8 text-royal animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Loading screening data...</p>
              </div>
            ) : screeningData.screeningHistory?.length === 0 && screeningData.currentlyChanging?.length === 0 ? (
              <div className="glass rounded-2xl border border-white/10 p-8 text-center">
                <Shield className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-white font-semibold">No screening data yet</p>
                <p className="text-sm text-gray-400 mt-1">Partner screening will populate here once it runs</p>
              </div>
            ) : (
              <>
                {/* Currently Changing */}
                {screeningData.currentlyChanging?.length > 0 && (
                  <div className="glass rounded-2xl border border-gold/20 p-5">
                    <h3 className="text-sm font-semibold text-gold mb-3">⚠️ Currently Changing Partner ({screeningData.currentlyChanging.length})</h3>
                    <div className="space-y-2">
                      {screeningData.currentlyChanging.map((u: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                          <div>
                            <p className="text-sm text-white font-semibold">@{u.username || "unknown"}</p>
                            <p className="text-[10px] text-gray-400">{u.account_number} • {u.account_type} • {u.email || "no email"}</p>
                          </div>
                          <p className="text-[10px] text-gray-400">{u.partner_warned_at ? (() => { const d = new Date(new Date(u.partner_warned_at).getTime() + 3*60*60*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} EAT`; })() : "—"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Disqualified */}
                {screeningData.disqualifiedPartners?.length > 0 && (
                  <div className="glass rounded-2xl border border-loss/20 p-5">
                    <h3 className="text-sm font-semibold text-loss mb-3">🚫 Disqualified (Partner Left) ({screeningData.disqualifiedPartners.length})</h3>
                    <div className="space-y-2">
                      {screeningData.disqualifiedPartners.map((u: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                          <div>
                            <p className="text-sm text-white font-semibold">@{u.username || "unknown"}</p>
                            <p className="text-[10px] text-gray-400">{u.account_number} • {u.account_type} • {u.email || "no email"}</p>
                          </div>
                          <p className="text-[10px] text-loss">{u.disqualified_reason?.substring(0, 40)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Screening History */}
                {screeningData.screeningHistory?.length > 0 && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-3">📋 Screening History</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[500px]">
                        <thead><tr className="border-b border-white/5">
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 uppercase">Date</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 uppercase">Screened</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 uppercase">All Good</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 uppercase">Changing</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 uppercase">Left</th>
                        </tr></thead>
                        <tbody>{screeningData.screeningHistory.map((s: any, i: number) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-2 px-3 text-xs text-white">{(() => { const dt = s.date || s.createdAt; if (!dt) return "—"; const dateOnly = String(dt).split("T")[0]; const mode = s.mode === "day" ? "10:00 AM" : "10:00 PM"; return `${dateOnly} ${mode} EAT`; })()}</td>
                            <td className="py-2 px-3 text-xs text-center text-gray-300">{s.totalScreened}</td>
                            <td className="py-2 px-3 text-xs text-center text-profit">{s.allGood}</td>
                            <td className="py-2 px-3 text-xs text-center">
                              {((s.changingReal || 0) + (s.changingDemo || 0)) > 0 ? (
                                <details className="inline">
                                  <summary className="text-gold cursor-pointer hover:underline">{(s.changingReal || 0) + (s.changingDemo || 0)}</summary>
                                  <div className="text-left mt-1 p-2 bg-white/5 rounded-lg">
                                    {(s.changingUsers || []).map((u: any, j: number) => (
                                      <p key={j} className="text-[10px] text-gray-300">@{u.username || "?"} • {u.account_number || "?"} • {u.account_type || "?"} • {u.email || ""}</p>
                                    ))}
                                    {(!s.changingUsers || s.changingUsers.length === 0) && <p className="text-[10px] text-gray-500">User details not available for this entry</p>}
                                  </div>
                                </details>
                              ) : <span className="text-gold">0</span>}
                            </td>
                            <td className="py-2 px-3 text-xs text-center">
                              {((s.leftReal || 0) + (s.leftDemo || 0)) > 0 ? (
                                <details className="inline">
                                  <summary className="text-loss cursor-pointer hover:underline">{(s.leftReal || 0) + (s.leftDemo || 0)}</summary>
                                  <div className="text-left mt-1 p-2 bg-white/5 rounded-lg">
                                    {(s.leftUsers || []).map((u: any, j: number) => (
                                      <p key={j} className="text-[10px] text-gray-300">@{u.username || "?"} • {u.account_number || "?"} • {u.account_type || "?"} • {u.email || ""}</p>
                                    ))}
                                    {(!s.leftUsers || s.leftUsers.length === 0) && <p className="text-[10px] text-gray-500">User details not available for this entry</p>}
                                  </div>
                                </details>
                              ) : <span className="text-loss">0</span>}
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ==================== RULES TAB (Form-based) ==================== */}
      {activeSection === "rules" && (
        <div className="container mx-auto px-4 max-w-7xl relative">
          <div className="glass rounded-2xl border border-white/10 p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-royal" /> Challenge Rules Configuration</h3>
              {rulesLocked && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400"><Shield size={12} /> Locked — challenge is {challenge.status}</span>}
            </div>
            <p className="text-xs text-gray-500 mb-6">
              {rulesLocked ? "Rules are read-only once a challenge is active. Switch to review status to see them." : "Set the rules for this challenge. Users will see these on their dashboard. Leave fields empty for unlimited."}
            </p>

            {rulesLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-royal animate-spin" /></div>
            ) : (
            <div className={rulesLocked ? "opacity-60 pointer-events-none select-none" : ""}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Max Lot Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Max Lot Size</label>
                  <Input type="number" step="0.01" placeholder="e.g., 0.02 (empty = unlimited)" value={rulesConfig.max_lot_size || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_lot_size: e.target.value ? parseFloat(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Trades exceeding this lot size will have profits removed</p>
                </div>

                {/* Max Open Trades */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Max Open Trades</label>
                  <Input type="number" placeholder="e.g., 3 (empty = unlimited)" value={rulesConfig.max_open_trades || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_open_trades: e.target.value ? parseInt(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Maximum trades open at the same time</p>
                </div>

                {/* Pair Limit */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Pair Limit (Simultaneous)</label>
                  <Input type="number" placeholder="e.g., 2 (empty = unlimited)" value={rulesConfig.pair_limit || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, pair_limit: e.target.value ? parseInt(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Max same-pair trades open at the same time</p>
                </div>

                {/* Max Risk Dollars */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Max Risk per Trade ($)</label>
                  <Input type="number" step="0.5" placeholder="e.g., 5 (empty = no limit)" value={rulesConfig.max_risk_dollars || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_risk_dollars: e.target.value ? parseFloat(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Maximum SL distance in dollars</p>
                </div>

                {/* Daily Loss Cap */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Daily Loss Cap ($)</label>
                  <Input type="number" step="1" placeholder="e.g., 10 (empty = no cap)" value={rulesConfig.daily_loss_cap || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, daily_loss_cap: e.target.value ? parseFloat(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Max drawdown from day&apos;s opening balance. Profits after breach are removed.</p>
                </div>

                {/* Trading Duration */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Max Trade Duration (hours)</label>
                  <Input type="number" placeholder="e.g., 24 (empty = unlimited)" value={rulesConfig.max_hold_hours || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, max_hold_hours: e.target.value ? parseInt(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Trades held longer will have profits removed</p>
                </div>

                {/* Active Trading Days */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-300">Min Active Trading Days</label>
                  <Input type="number" placeholder="e.g., 7" value={rulesConfig.min_active_days || ""} onChange={(e) => setRulesConfig({ ...rulesConfig, min_active_days: e.target.value ? parseInt(e.target.value) : 0 })} disabled={rulesLocked} />
                  <p className="text-[10px] text-gray-500">Minimum days user must trade to qualify for prizes</p>
                </div>

                {/* Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div><p className="text-sm text-white font-medium">Stop Loss Required</p><p className="text-[10px] text-gray-500">All trades must have SL</p></div>
                    <button onClick={() => !rulesLocked && setRulesConfig({ ...rulesConfig, stop_loss_required: !rulesConfig.stop_loss_required })} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.stop_loss_required ? "bg-profit" : "bg-white/20"}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.stop_loss_required ? "translate-x-6" : "translate-x-0.5"}`}></div>
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div><p className="text-sm text-white font-medium">Weekend Trading</p><p className="text-[10px] text-gray-500">Allow trading on weekends</p></div>
                    <button onClick={() => !rulesLocked && setRulesConfig({ ...rulesConfig, weekend_trading: !rulesConfig.weekend_trading })} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.weekend_trading ? "bg-profit" : "bg-white/20"}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div>
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div><p className="text-sm text-white font-medium">Only Cent Account</p><p className="text-[10px] text-gray-500">Real category requires cent accounts only</p></div>
                    <button onClick={() => !rulesLocked && setRulesConfig({ ...rulesConfig, only_cent_account: !(rulesConfig as any).only_cent_account })} className={`w-12 h-6 rounded-full transition-all ${(rulesConfig as any).only_cent_account ? "bg-profit" : "bg-white/20"}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${(rulesConfig as any).only_cent_account ? "translate-x-6" : "translate-x-0.5"}`}></div>
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
                </ul>
              </div>
            </div>
            )}

            {/* Save */}
            {(() => {
              const rulesChanged = savedRulesSnapshot !== null && JSON.stringify(rulesConfig) !== JSON.stringify(savedRulesSnapshot);
              const justSaved = rulesSaved && !rulesChanged;
              return (
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={async () => {
                      if (rulesLocked || !rulesChanged) return;
                      try {
                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
                        const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
                        const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${selectedChallengeId}/rules`, {
                          method: "PUT", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(rulesConfig),
                        });
                        if (res.ok) {
                          setRulesSaved(true);
                          setSavedRulesSnapshot({ ...rulesConfig });
                        } else {
                          const d = await res.json(); alert(d.error || "Failed to save rules");
                        }
                      } catch { alert("Connection error"); }
                    }}
                    disabled={rulesLocked || !rulesChanged || rulesLoading}
                    className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all ${
                      rulesLocked
                        ? "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed"
                        : justSaved
                          ? "bg-profit/20 text-profit border border-profit/30 cursor-not-allowed opacity-60"
                          : rulesChanged
                            ? "bg-gradient-brand hover:opacity-90 text-white shadow-lg shadow-royal/20"
                            : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed opacity-50"
                    }`}>
                    {rulesLocked ? "🔒 Rules Locked" : justSaved ? "✓ Rules Saved" : rulesChanged ? "Save Rules" : "No Changes"}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ==================== SETTINGS TAB ==================== */}
      {activeSection === "settings" && (
        <ChallengeSettingsPanel challengeId={selectedChallengeId} challenges={challenges} onRefresh={async () => {
          // Refetch challenges after save
          try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
            const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
            const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenges`);
            if (res.ok) { const data = await res.json(); setChallenges(data.challenges || []); }
          } catch {}
        }} />
      )}

      {/* ==================== CREATE CHALLENGE TAB ==================== */}
      {activeSection === "create" && (
        <CreateChallengePanel onCreated={(id) => { setActiveSection("overview"); setSelectedChallengeId(String(id)); }} />
      )}

      {/* ==================== HEALTH TAB ==================== */}
      {activeSection === "health" && (
        <HealthCheckPanel />
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
              {selectedParticipant.isDisqualified ? (
                <div className="p-4 rounded-xl bg-loss/10 border border-loss/20">
                  <p className="text-xs text-gray-400 mb-1">Disqualified</p>
                  <p className="text-sm text-white">{selectedParticipant.disqualifyReason || "No reason provided"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Rank</p><p className="text-2xl font-bold gradient-text">#{selectedParticipant.rank || "—"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Balance</p><p className="text-2xl font-bold text-white">{cur(selectedParticipant.adjustedBalance, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Profit</p><p className={`text-lg font-bold ${(selectedParticipant.qualifiedProfit || 0) >= 0 ? "text-profit" : "text-loss"}`}>{cur(selectedParticipant.qualifiedProfit, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Gross</p><p className="text-lg font-bold text-white">{cur(selectedParticipant.grossProfit, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{selectedParticipant.totalTrades || 0}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${(selectedParticipant.flaggedTrades || 0) > 0 ? "text-loss" : "text-profit"}`}>{selectedParticipant.flaggedTrades || 0}</p></div>
                </div>
              )}
              <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><span className={`px-3 py-1 rounded text-xs font-semibold ${selectedParticipant.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{selectedParticipant.accountType}</span></div>
              {selectedParticipantTrades.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-gray-400 mb-2">Trades ({selectedParticipantTrades.length})</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {selectedParticipantTrades.map((t: any, i: number) => (
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
                            <p className={`text-xs font-bold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>{selectedParticipant.isCent ? `${t.profit.toFixed(2)}¢` : `$${t.profit.toFixed(2)}`}</p>
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
              {/* Export MT5 Trade History */}
              {selectedParticipant.registrationId && (
                <button
                  onClick={async () => {
                    try {
                      const apiUrl  = process.env.NEXT_PUBLIC_API_URL  || "https://api.winnerpip.com";
                      const secPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
                      const res = await fetch(`${apiUrl}/api/admin/${secPath}/challenge/${selectedChallengeId}/export-user-trades?registration_id=${selectedParticipant.registrationId}`);
                      if (!res.ok) { alert("Export failed"); return; }
                      const data = await res.json();
                      const html = generateTradesHTML(data);
                      const blob = new Blob([html], { type: "text/html" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href     = url;
                      a.download = `${data.user?.nickname || "trades"}_MT5_history.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch { alert("Export failed"); }
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-semibold transition-all text-sm"
                >
                  <FileText size={14} /> Export MT5 Trade History
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== VERIFY POPUP (rendered at top level to escape overflow) ==================== */}
      {verifyPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" style={{zIndex:99999}} onClick={() => setVerifyPopup(null)}>
          <div className="bg-[#111827] rounded-2xl border border-white/10 p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Connection Verification</h3>
              <button onClick={() => setVerifyPopup(null)} className="p-1 hover:bg-white/10 rounded-lg"><X size={16} className="text-gray-400" /></button>
            </div>
            <div className={`p-4 rounded-xl mb-4 ${verifyPopup.verified ? "bg-profit/10 border border-profit/30" : "bg-loss/10 border border-loss/30"}`}>
              <p className={`text-lg font-bold text-center ${verifyPopup.verified ? "text-profit" : "text-loss"}`}>{verifyPopup.verified ? "✅ Verified" : "❌ Failed"}</p>
            </div>
            {verifyPopup.verified && (
              <div className="space-y-2">
                {(verifyPopup.balance != null) ? (
                  <>
                    <div className="flex justify-between p-3 bg-white/5 rounded-lg"><span className="text-xs text-gray-400">Balance</span><span className="text-sm text-white font-bold">{cur(verifyPopup.balance, verifyPopup.isCent)}</span></div>
                    {verifyPopup.equity != null && <div className="flex justify-between p-3 bg-white/5 rounded-lg"><span className="text-xs text-gray-400">Equity</span><span className="text-sm text-white font-bold">{cur(verifyPopup.equity, verifyPopup.isCent)}</span></div>}
                    {verifyPopup.accountSubtype && <div className="flex justify-between p-3 bg-white/5 rounded-lg"><span className="text-xs text-gray-400">Account Type</span><span className="text-sm text-white font-bold capitalize">{verifyPopup.accountSubtype.replace(/_/g, ' ')}</span></div>}
                  </>
                ) : (
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <p className="text-xs text-gray-400">✅ Credentials are valid — account is accessible</p>
                    <p className="text-[10px] text-gray-500 mt-1">Balance will show after the next pull cycle completes</p>
                  </div>
                )}
                {verifyPopup.pullStatus && verifyPopup.pullStatus !== "success" && (
                  <div className="p-3 bg-gold/10 border border-gold/20 rounded-lg mt-2">
                    <p className="text-xs text-gold font-semibold">⚠️ Pull status: {verifyPopup.pullStatus}</p>
                    {verifyPopup.pullError && <p className="text-[10px] text-gray-400 mt-1">{verifyPopup.pullError}</p>}
                  </div>
                )}
                {verifyPopup.attempts > 1 && <p className="text-[10px] text-gray-500 text-center mt-2">Verified on attempt {verifyPopup.attempts}/3</p>}
              </div>
            )}
            {!verifyPopup.verified && (
              <div>
                <p className="text-sm text-loss mb-2">{verifyPopup.error || "Unknown error"}</p>
                {verifyPopup.attempts && <p className="text-[10px] text-gray-500">Tried {verifyPopup.attempts} time{verifyPopup.attempts > 1 ? "s" : ""}</p>}
                {verifyPopup.credentialIssue && <p className="text-[10px] text-gold mt-1">⚠️ Credential issue — password may have changed</p>}
              </div>
            )}
            <button onClick={() => setVerifyPopup(null)} className="w-full mt-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/20 transition-all">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="glass rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10">
      <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>{icon}<p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p></div>
      <p className={`text-lg sm:text-2xl md:text-3xl font-bold ${color} truncate`}>{value}</p>
      <p className="text-[9px] sm:text-[10px] text-gray-500 mt-1 truncate">{sub}</p>
    </div>
  );
}

function HealthCheckPanel() {
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runHealthCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
      const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/vps-health?deep=true`);
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
        setLastChecked(new Date().toLocaleTimeString());
      } else {
        setError("Failed to fetch health data");
      }
    } catch {
      setError("Could not connect to API");
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto px-4 max-w-7xl relative">
      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-profit/20 rounded-xl border border-profit/30">
              <Activity className="text-profit w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">VPS & Terminal Health</h3>
              <p className="text-xs text-gray-500">{lastChecked ? `Last checked: ${lastChecked}` : "Click to check"}</p>
            </div>
          </div>
          <button
            onClick={runHealthCheck}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold text-sm shadow-lg shadow-royal/20 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "Checking..." : "Run Health Check"}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-loss/10 border border-loss/30 mb-4">
            <p className="text-sm text-loss">{error}</p>
          </div>
        )}

        {healthData && (
          <div className="space-y-6">
            {/* VPS Status */}
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${healthData.vps?.reachable ? "bg-profit animate-pulse" : "bg-loss"}`}></div>
                <h4 className="text-sm font-bold text-white">VPS Server</h4>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${healthData.vps?.reachable ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                  {healthData.vps?.reachable ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              {healthData.vps?.reachable && healthData.vps?.raw && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {healthData.vps.raw.terminals && (
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-gray-500 uppercase">Terminals</p>
                      <p className="text-xl font-bold text-white">{typeof healthData.vps.raw.terminals === "object" ? JSON.stringify(healthData.vps.raw.terminals.active || healthData.vps.raw.terminals) : healthData.vps.raw.terminals}</p>
                    </div>
                  )}
                  {healthData.vps.raw.workers && (
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-gray-500 uppercase">Workers</p>
                      <p className="text-xl font-bold text-white">{typeof healthData.vps.raw.workers === "object" ? JSON.stringify(healthData.vps.raw.workers.active || healthData.vps.raw.workers) : healthData.vps.raw.workers}</p>
                    </div>
                  )}
                  {healthData.vps.raw.uptime && (
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-gray-500 uppercase">Uptime</p>
                      <p className="text-xl font-bold text-profit">{healthData.vps.raw.uptime}</p>
                    </div>
                  )}
                  {healthData.vps.raw.version && (
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-gray-500 uppercase">Version</p>
                      <p className="text-xl font-bold text-royal">{healthData.vps.raw.version}</p>
                    </div>
                  )}
                </div>
              )}

              {healthData.vps?.reachable && healthData.vps?.raw && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Raw VPS response</summary>
                  <pre className="mt-2 p-3 bg-black/30 rounded-lg text-[10px] text-gray-400 overflow-x-auto">{JSON.stringify(healthData.vps.raw, null, 2)}</pre>
                </details>
              )}

              {!healthData.vps?.reachable && (
                <p className="text-sm text-loss">{healthData.vps?.error || "Cannot reach VPS server"}</p>
              )}
            </div>

            {/* Terminal Login Test — always show all 10 */}
            {(() => {
              const results = healthData.deepCheck?.results || [];
              const vpsOnline = healthData.vps?.reachable;
              const passedCount = results.filter((t: any) => t.success).length;
              const totalTested = results.length;
              const summary = !vpsOnline
                ? "VPS offline — cannot test"
                : totalTested === 0
                  ? "Not tested"
                  : `${passedCount}/${totalTested} passed`;
              const summaryColor = !vpsOnline || passedCount < totalTested ? "bg-loss/20 text-loss" : "bg-profit/20 text-profit";

              return (
                <div className="p-4 rounded-xl border border-white/10 bg-white/5">
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Activity size={16} className="text-gold" /> Terminal Login Test
                    <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${summaryColor}`}>{summary}</span>
                  </h4>
                  <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                    {Array.from({ length: 10 }, (_, i) => {
                      const id = i + 1;
                      const result = results.find((t: any) => t.terminal === id);
                      const passed = result?.success === true;
                      const failed = result?.success === false || (!vpsOnline);
                      const untested = !result && vpsOnline;
                      return (
                        <div key={id} className={`rounded-lg p-2 text-center border ${passed ? "bg-profit/10 border-profit/30" : failed ? "bg-loss/10 border-loss/30" : "bg-white/5 border-white/10"}`}>
                          <p className="text-[10px] text-gray-500">T{id}</p>
                          <p className={`text-sm font-bold ${passed ? "text-profit" : failed ? "text-loss" : "text-gray-500"}`}>
                            {passed ? "✓" : failed ? "✗" : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {healthData.deepCheck?.failed?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {healthData.deepCheck.failed.map((f: any) => (
                        <div key={f.terminal} className="p-2 rounded-lg bg-loss/10 border border-loss/20">
                          <p className="text-xs text-loss font-semibold">T{f.terminal}: {f.error}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Pull Stats (24h) */}
            {healthData.pullStats && (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-royal" /> Pull Stats (Last 24h)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Batches</p>
                  <p className="text-2xl font-bold text-white">{healthData.pullStats.last24h?.batches ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Success</p>
                  <p className="text-2xl font-bold text-profit">{healthData.pullStats.last24h?.totalSuccess ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Failed</p>
                  <p className="text-2xl font-bold text-loss">{healthData.pullStats.last24h?.totalFailed ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Success Rate</p>
                  <p className={`text-2xl font-bold ${(healthData.pullStats.last24h?.successRate ?? 0) >= 90 ? "text-profit" : (healthData.pullStats.last24h?.successRate ?? 0) >= 70 ? "text-gold" : "text-loss"}`}>{healthData.pullStats.last24h?.successRate ?? 0}%</p>
                </div>
              </div>

              {(healthData.pullStats.passwordChangedPending ?? 0) > 0 && (
                <div className="p-3 rounded-lg bg-gold/10 border border-gold/20 mb-3">
                  <p className="text-xs text-gold font-semibold">🔑 {healthData.pullStats.passwordChangedPending} accounts with changed passwords (pending 48h)</p>
                </div>
              )}

              {/* Error breakdown */}
              {healthData.pullStats.errors24h?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-400 font-semibold mb-2">Error Breakdown:</p>
                  <div className="space-y-1">
                    {healthData.pullStats.errors24h.map((e: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <span className="text-xs text-gray-300">{e.code}</span>
                        <span className="text-xs font-bold text-loss">{e.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Recent Batches */}
            {healthData.pullStats?.last5Batches && (
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Clock size={16} className="text-gold" /> Recent Pull Cycles
              </h4>
              <div className="space-y-2">
                {healthData.pullStats.last5Batches.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${b.status === "completed" ? "bg-profit" : b.status === "running" ? "bg-gold animate-pulse" : "bg-loss"}`}></div>
                      <div>
                        <p className="text-xs text-white font-medium">
                          {new Date(new Date(b.startedAt).getTime() + 3*60*60*1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} EAT
                        </p>
                        <p className="text-[10px] text-gray-500">{b.totalAccounts} accounts</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-profit font-semibold">✓{b.successful}</span>
                      <span className="text-loss font-semibold">✗{b.failed}</span>
                      <span className="text-gray-400">{b.durationSec ? `${b.durationSec}s` : "..."}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        {!healthData && !loading && !error && (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Click &quot;Run Health Check&quot; to see VPS terminal and worker status</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateChallengePanel({ onCreated }: { onCreated: (id: number) => void }) {
  const [step, setStep] = useState(1); // 1=source, 2=details, 3=rules, 4=review
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    source: "telegram" as "telegram" | "discord",
    team_only: false,
    title: "",
    type: "hybrid" as "demo" | "real" | "hybrid",
    start_date: "",
    end_date: "",
    starting_balance: "30",
    target_balance: "60",
    prize_pool_text: "",
    real_winners_count: "3",
    demo_winners_count: "3",
    real_prizes: "500,300,200",
    demo_prizes: "300,200,100",
    pdf_url: "",
    video_url: "",
  });

  const [rules, setRules] = useState({
    max_lot_size: 0.02,
    max_open_trades: 3,
    pair_limit: 2,
    stop_loss_required: true,
    max_risk_dollars: 5,
    daily_loss_cap: 10,
    max_hold_hours: 24,
    weekend_trading: false,
    min_active_days: 7,
    only_cent_account: false,
  });

  const handleCreate = async () => {
    setSaving(true); setError("");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          // Treat datetime-local value as EAT (UTC+3) explicitly — safe regardless of browser timezone
          start_date: form.start_date ? new Date(form.start_date + ":00+03:00").toISOString() : null,
          end_date: form.end_date ? new Date(form.end_date + ":00+03:00").toISOString() : null,
          registration_deadline: form.start_date ? new Date(form.start_date + ":00+03:00").toISOString() : null,
          starting_balance: parseFloat(form.starting_balance),
          target_balance: parseFloat(form.target_balance),
          real_winners_count: parseInt(form.real_winners_count),
          demo_winners_count: parseInt(form.demo_winners_count),
          real_prizes: form.real_prizes.split(",").map(p => p.trim()).filter(Boolean).map(p => isNaN(Number(p)) ? p : parseFloat(p)),
          demo_prizes: form.demo_prizes.split(",").map(p => p.trim()).filter(Boolean).map(p => isNaN(Number(p)) ? p : parseFloat(p)),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); setSaving(false); return; }
      const data = await res.json();
      const challengeId = data.challenge?.id;

      // Save rules
      if (challengeId) {
        await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/rules`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rules),
        });
      }

      onCreated(challengeId);
    } catch {
      setError("Could not connect to API");
    }
    setSaving(false);
  };

  return (
    <div className="container mx-auto px-4 max-w-3xl relative">
      <div className="glass rounded-2xl border border-white/10 p-6">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1,2,3,4].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-all ${s <= step ? "bg-royal" : "bg-white/10"}`} />
          ))}
        </div>

        {/* Step 1: Source */}
        {step === 1 && (
          <div>
            <h3 className="text-xl font-bold text-white mb-2">Create New Challenge</h3>
            <p className="text-sm text-gray-400 mb-6">Choose where this challenge will be announced</p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
              <button onClick={() => setForm({ ...form, source: "telegram", team_only: false })} className={`p-4 sm:p-5 rounded-xl border text-center transition-all ${form.source === "telegram" && !form.team_only ? "border-royal bg-royal/10" : "border-white/20 hover:border-white/30"}`}>
                <p className="text-2xl mb-2">📱</p>
                <p className="text-white font-bold text-xs sm:text-sm">Telegram</p>
                <p className="text-[10px] text-gray-500 mt-1">Public</p>
              </button>
              <button onClick={() => setForm({ ...form, source: "discord", team_only: true })} className={`p-4 sm:p-5 rounded-xl border text-center transition-all ${form.source === "discord" ? "border-gold bg-gold/10" : "border-white/20 hover:border-white/30"}`}>
                <p className="text-2xl mb-2">🎮</p>
                <p className="text-white font-bold text-xs sm:text-sm">Discord</p>
                <p className="text-[10px] text-gray-500 mt-1">Team-only</p>
              </button>
            </div>
            <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all">Continue</button>
          </div>
        )}

        {/* Step 2: Details */}
        {step === 2 && (
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Challenge Details</h3>
            <div className="space-y-4">
              <div><label className="text-xs text-gray-400 font-medium mb-1 block">Title *</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-royal/50 outline-none" placeholder="Challenge 18 - Hybrid" /></div>
              <div><label className="text-xs text-gray-400 font-medium mb-1 block">Type *</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value as any})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-royal/50 outline-none">
                  <option value="hybrid" className="bg-[#0f1629]">Hybrid (Demo + Real)</option>
                  <option value="demo" className="bg-[#0f1629]">Demo Only</option>
                  <option value="real" className="bg-[#0f1629]">Real Only</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400 font-medium mb-1 block">Start Date & Time (EAT) *</label><input type="datetime-local" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-gray-400 font-medium mb-1 block">End Date & Time (EAT) *</label><input type="datetime-local" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
              </div>
              <p className="text-[10px] text-gray-500 -mt-2">Registration closes automatically when challenge starts</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400 font-medium mb-1 block">Starting Balance ($) *</label><input value={form.starting_balance} onChange={e => setForm({...form, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Balance ($)</label><input value={form.target_balance} onChange={e => setForm({...form, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
              </div>
              <div><label className="text-xs text-gray-400 font-medium mb-1 block">Prize Pool Text</label><input value={form.prize_pool_text} onChange={e => setForm({...form, prize_pool_text: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="$1,600 Total Prize Pool" /></div>
              <div className="grid grid-cols-2 gap-3">
                {form.type !== "demo" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Real Winners #</label><input value={form.real_winners_count} onChange={e => setForm({...form, real_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>}
                {form.type !== "real" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Demo Winners #</label><input value={form.demo_winners_count} onChange={e => setForm({...form, demo_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>}
              </div>
              {form.type !== "demo" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Real Prizes (comma-separated $)</label><input value={form.real_prizes} onChange={e => setForm({...form, real_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="500,300,200" /></div>}
              {form.type !== "real" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Demo Prizes (comma-separated $)</label><input value={form.demo_prizes} onChange={e => setForm({...form, demo_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="300,200,100" /></div>}
              <div><label className="text-xs text-gray-400 font-medium mb-1 block">PDF URL (optional)</label><input value={form.pdf_url} onChange={e => setForm({...form, pdf_url: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
              <div><label className="text-xs text-gray-400 font-medium mb-1 block">Video URL (optional)</label><input value={form.video_url} onChange={e => setForm({...form, video_url: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-semibold hover:bg-white/10 transition-all">Back</button>
              <button onClick={() => setStep(3)} disabled={!form.title || !form.start_date || !form.end_date} className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50">Next: Rules</button>
            </div>
          </div>
        )}

        {/* Step 3: Rules */}
        {step === 3 && (
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Challenge Rules</h3>
            <div className="space-y-3">
              <RuleInput label="Max Lot Size" value={rules.max_lot_size} onChange={v => setRules({...rules, max_lot_size: v})} />
              <RuleInput label="Max Open Trades" value={rules.max_open_trades} onChange={v => setRules({...rules, max_open_trades: v})} />
              <RuleInput label="Pair Limit" value={rules.pair_limit} onChange={v => setRules({...rules, pair_limit: v})} />
              <RuleInput label="Max Risk ($)" value={rules.max_risk_dollars} onChange={v => setRules({...rules, max_risk_dollars: v})} />
              <RuleInput label="Daily Loss Cap ($)" value={rules.daily_loss_cap} onChange={v => setRules({...rules, daily_loss_cap: v})} />
              <RuleInput label="Max Hold Hours" value={rules.max_hold_hours} onChange={v => setRules({...rules, max_hold_hours: v})} />
              <RuleInput label="Min Active Days" value={rules.min_active_days} onChange={v => setRules({...rules, min_active_days: v})} />
              <RuleToggle label="Stop Loss Required" value={rules.stop_loss_required} onChange={v => setRules({...rules, stop_loss_required: v})} />
              <RuleToggle label="Weekend Trading" value={rules.weekend_trading} onChange={v => setRules({...rules, weekend_trading: v})} />
              <RuleToggle label="Only Cent Account (Real)" value={rules.only_cent_account} onChange={v => setRules({...rules, only_cent_account: v})} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-semibold hover:bg-white/10 transition-all">Back</button>
              <button onClick={() => setStep(4)} className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all">Review</button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Confirm */}
        {step === 4 && (
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Review & Create</h3>
            <div className="space-y-3 mb-6">
              <ReviewRow label="Source" value={form.source === "discord" ? "Discord (Team)" : "Telegram (Public)"} />
              <ReviewRow label="Title" value={form.title} />
              <ReviewRow label="Type" value={form.type} />
              <ReviewRow label="Period" value={`${form.start_date} → ${form.end_date}`} />
              <ReviewRow label="Balance" value={rules.only_cent_account && form.type !== "demo" ? `${form.starting_balance}¢ → ${form.target_balance}¢` : `$${form.starting_balance} → $${form.target_balance}`} />
              <ReviewRow label="Prize Pool" value={form.prize_pool_text || "—"} />
              {form.type !== "demo" && <ReviewRow label="Real Prizes" value={form.real_prizes || "—"} />}
              {form.type !== "real" && <ReviewRow label="Demo Prizes" value={form.demo_prizes || "—"} />}
              <ReviewRow label="Max Lot" value={String(rules.max_lot_size)} />
              <ReviewRow label="SL Required" value={rules.stop_loss_required ? "Yes" : "No"} />
              <ReviewRow label="Daily Loss Cap" value={rules.only_cent_account && form.type !== "demo" ? `${rules.daily_loss_cap}¢` : `$${rules.daily_loss_cap}`} />
              <ReviewRow label="Max Risk" value={rules.only_cent_account && form.type !== "demo" ? `${rules.max_risk_dollars}¢` : `$${rules.max_risk_dollars}`} />
              <ReviewRow label="Min Active Days" value={String(rules.min_active_days)} />
              {rules.only_cent_account && <ReviewRow label="Cent Account" value="Required" />}
            </div>
            {error && <div className="p-3 rounded-xl bg-loss/10 border border-loss/30 mb-4"><p className="text-sm text-loss">{error}</p></div>}
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-semibold hover:bg-white/10 transition-all">Back</button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-3 rounded-xl bg-profit/20 border border-profit/30 text-profit font-bold hover:bg-profit/30 transition-all disabled:opacity-50">
                {saving ? "Creating..." : "✓ Create Challenge"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RuleInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
      <p className="text-sm text-white font-medium">{label}</p>
      <input type="number" step="any" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none" />
    </div>
  );
}

function RuleToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
      <p className="text-sm text-white font-medium">{label}</p>
      <button onClick={() => onChange(!value)} className={`w-12 h-6 rounded-full transition-all ${value ? "bg-profit" : "bg-white/20"}`}>
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${value ? "translate-x-6" : "translate-x-0.5"}`}></div>
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-white font-semibold">{value}</p>
    </div>
  );
}

function ChallengeSettingsPanel({ challengeId, challenges, onRefresh }: { challengeId: string; challenges: any[]; onRefresh: () => void }) {
  const challenge = challenges.find(c => String(c.id) === challengeId);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Convert UTC ISO string from API → datetime-local string displayed as EAT (UTC+3)
  function formatDateForInput(isoStr: string): string {
    if (!isoStr) return "";
    const d = new Date(new Date(isoStr).getTime() + 3 * 60 * 60 * 1000); // shift to EAT
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
  }

  // Convert datetime-local string → UTC ISO string for API
  // Explicitly treat as EAT (UTC+3) regardless of browser timezone
  function dateToUTC(eatStr: string): string | undefined {
    if (!eatStr) return undefined;
    return new Date(eatStr + ":00+03:00").toISOString();
  }
  const [editForm, setEditForm] = useState({
    title: challenge?.title || "",
    type: challenge?.type || "hybrid",
    start_date: challenge?.startDate ? formatDateForInput(challenge.startDate) : "",
    end_date: challenge?.endDate ? formatDateForInput(challenge.endDate) : "",
    starting_balance: String(challenge?.startingBalance || 30),
    target_balance: String(challenge?.targetBalance || 60),
    prize_pool_text: challenge?.prizePoolText || "",
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
  const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";

  const handleSave = async () => {
    setSaving(true); setMsg("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          type: editForm.type,
          start_date: dateToUTC(editForm.start_date),
          end_date: dateToUTC(editForm.end_date),
          starting_balance: parseFloat(editForm.starting_balance),
          target_balance: parseFloat(editForm.target_balance),
          prize_pool_text: editForm.prize_pool_text,
        }),
      });
      if (res.ok) {
        setMsg("✅ Saved successfully");
        // Trigger parent to refetch challenges
        setTimeout(() => onRefresh(), 500);
      } else {
        const errData = await res.json().catch(() => ({}));
        setMsg(`❌ Failed: ${errData.error || res.statusText}`);
      }
    } catch { setMsg("❌ Connection error"); }
    setSaving(false);
  };

  const handleStatusChange = async (status: string) => {
    try {
      await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setMsg(`✅ Status → ${status}`);
      onRefresh();
    } catch { setMsg("❌ Failed"); }
  };

  const handleDelete = async () => {
    try {
      await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}`, { method: "DELETE" });
      setMsg("✅ Challenge deleted");
      onRefresh();
    } catch { setMsg("❌ Failed"); }
  };

  const handleExport = async (type: 'registrations' | 'leaderboard' = 'registrations') => {
    try {
      const endpoint = type === 'leaderboard' ? 'export-leaderboard' : 'export-registrations';
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/${endpoint}`);
      if (res.ok) {
        const data = await res.json();
        const rows = type === 'leaderboard' ? data.leaderboard : data.registrations;
        const csv = convertToCSV(rows);
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const slug = (editForm.title || `challenge_${challengeId}`).replace(/\s+/g, '_');
        a.href = url; a.download = `${slug}_${type}.csv`; a.click();
        setMsg(`✅ ${type === 'leaderboard' ? 'Leaderboard' : 'Registrations'} exported`);
      }
    } catch { setMsg("❌ Export failed"); }
  };

  const handleAnnounce = async () => {
    try {
      await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/announce`, { method: "POST" });
      setMsg("✅ Challenge announced — registration open");
      onRefresh();
    } catch { setMsg("❌ Failed"); }
  };

  if (!challenge) return <div className="text-center py-8 text-gray-400">Select a challenge first</div>;

  return (
    <div className="container mx-auto px-4 max-w-3xl relative">
      <div className="glass rounded-2xl border border-white/10 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white">Challenge Settings</h3>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${challenge.status === "active" ? "bg-profit/20 text-profit border-profit/30" : "bg-white/10 text-gray-300 border-white/20"}`}>{challenge.status}</span>
        </div>

        {msg && <div className={`p-3 rounded-xl text-sm font-semibold ${msg.startsWith("✅") ? "bg-profit/10 text-profit border border-profit/30" : "bg-loss/10 text-loss border border-loss/30"}`}>{msg}</div>}

        {/* Edit Fields */}
        <div className="space-y-4">
          <div><label className="text-xs text-gray-400 font-medium mb-1 block">Title</label><input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
          <div><label className="text-xs text-gray-400 font-medium mb-1 block">Type</label>
            <select value={editForm.type} onChange={e => setEditForm({...editForm, type: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none">
              <option value="hybrid" className="bg-[#0f1629]">Hybrid</option>
              <option value="demo" className="bg-[#0f1629]">Demo</option>
              <option value="real" className="bg-[#0f1629]">Real</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400 font-medium mb-1 block">Start (EAT)</label><input type="datetime-local" value={editForm.start_date} onChange={e => setEditForm({...editForm, start_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
            <div><label className="text-xs text-gray-400 font-medium mb-1 block">End (EAT)</label><input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-400 font-medium mb-1 block">Starting Balance ($)</label><input value={editForm.starting_balance} onChange={e => setEditForm({...editForm, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
            <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Balance ($)</label><input value={editForm.target_balance} onChange={e => setEditForm({...editForm, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
          </div>
          <div><label className="text-xs text-gray-400 font-medium mb-1 block">Prize Pool Text</label><input value={editForm.prize_pool_text} onChange={e => setEditForm({...editForm, prize_pool_text: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
          <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
        </div>

        {/* Status Actions */}
        <div className="border-t border-white/10 pt-5">
          <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wider">Status Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button onClick={() => handleStatusChange("registration_open")} className="p-2 sm:p-2.5 rounded-lg bg-profit/10 border border-profit/30 text-profit text-[10px] sm:text-xs font-semibold hover:bg-profit/20 transition-all">Open Reg</button>
            <button onClick={() => handleStatusChange("active")} className="p-2 sm:p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-[10px] sm:text-xs font-semibold hover:bg-gold/20 transition-all">Start</button>
            <button onClick={() => handleStatusChange("reviewing")} className="p-2 sm:p-2.5 rounded-lg bg-royal/10 border border-royal/30 text-royal text-[10px] sm:text-xs font-semibold hover:bg-royal/20 transition-all">End → Review</button>
            <button onClick={() => handleStatusChange("completed")} className="p-2 sm:p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[10px] sm:text-xs font-semibold hover:bg-white/10 transition-all">Completed</button>
            <button onClick={handleAnnounce} className="p-2 sm:p-2.5 rounded-lg bg-royal/10 border border-royal/30 text-royal text-[10px] sm:text-xs font-semibold hover:bg-royal/20 transition-all">📢 Announce</button>
          </div>
        </div>

        {/* Exports */}
        <div className="border-t border-white/10 pt-5">
          <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wider">Exports</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleExport('registrations')} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">📥 Registrations</button>
            <button onClick={() => handleExport('leaderboard')} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">📊 Leaderboard CSV</button>
            <button onClick={async () => { try { const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/export-evaluation`); if (res.ok) { const data = await res.json(); const csv = convertToCSV(data.evaluation); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${(editForm.title || `challenge_${challengeId}`).replace(/\s+/g, '_')}_evaluation.csv`; a.click(); setMsg("✅ Evaluation exported"); } } catch { setMsg("❌ Export failed"); } }} className="p-2.5 rounded-lg bg-profit/10 border border-profit/30 text-profit text-xs font-semibold hover:bg-profit/20 transition-all">📋 Evaluation CSV</button>
            <button onClick={async () => { try { const r = await fetch(`${apiUrl}/api/challenges/${challengeId}/rules`); const d = await r.json(); downloadRulesHTML(editForm, d.rules || [], d.isCent || false); } catch { downloadRulesHTML(editForm, [], false); } }} className="p-2.5 rounded-lg bg-royal/10 border border-royal/30 text-royal text-xs font-semibold hover:bg-royal/20 transition-all">📋 Rules Image</button>
            <button onClick={async () => { try { const r = await fetch(`${apiUrl}/api/challenges/${challengeId}/leaderboard?limit=10`); const d = await r.json(); downloadLeaderboardHTML({ ...editForm, real_winners_count: challenge?.realWinnersCount ?? 3, demo_winners_count: challenge?.demoWinnersCount ?? 3 }, d.leaderboard || []); } catch { downloadLeaderboardHTML(editForm, []); } }} className="p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/20 transition-all">🏆 Leaderboard Image</button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="border-t border-loss/20 pt-5">
          <p className="text-xs text-loss font-semibold mb-3 uppercase tracking-wider">Danger Zone</p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="px-4 py-2.5 rounded-lg bg-loss/10 border border-loss/30 text-loss text-xs font-semibold hover:bg-loss/20 transition-all">🗑️ Delete Challenge</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <p className="text-xs text-loss">Are you sure? This cannot be undone.</p>
              <button onClick={handleDelete} className="px-4 py-2 rounded-lg bg-loss text-white text-xs font-bold">Yes, Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-lg bg-white/10 text-gray-300 text-xs font-semibold">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== SOCIAL MEDIA HTML EXPORTS ====================

function downloadRulesHTML(challenge: any, rulesList: string[], isCent: boolean) {
  const unit = isCent ? '¢' : '$';
  const startDate = challenge.start_date ? new Date(challenge.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const endDate = challenge.end_date ? new Date(challenge.end_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${challenge.title} - Rules</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0a0e1a}
.page{width:1080px;height:1920px;padding:80px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#0a0e1a 0%,#111827 50%,#0a0e1a 100%);position:relative;overflow:hidden;page-break-after:always}
.page.landscape{width:1920px;height:1080px;padding:60px 100px}
.glow{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(150px);opacity:0.15}
.glow1{top:-200px;right:-100px;background:#1F6FEB}.glow2{bottom:-200px;left:-100px;background:#F5B400}
.header{text-align:center;margin-bottom:60px}
.title{font-size:48px;font-weight:800;color:#fff;margin-bottom:12px}
.subtitle{font-size:20px;color:#94a3b8;font-weight:500}
.badge{display:inline-block;padding:8px 20px;border-radius:20px;background:rgba(31,111,235,0.2);border:1px solid rgba(31,111,235,0.4);color:#1F6FEB;font-size:14px;font-weight:700;margin-top:16px}
.info-row{display:flex;justify-content:center;gap:40px;margin-bottom:50px}
.info-item{text-align:center}.info-label{font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.info-value{font-size:28px;font-weight:700;color:#fff}
.info-value.gold{color:#F5B400}
.rules-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;margin:0 auto}
.page.landscape .rules-grid{grid-template-columns:1fr 1fr 1fr;max-width:1400px}
.rule-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;display:flex;align-items:center;gap:16px}
.rule-card.centered{grid-column:1/-1;max-width:400px;margin:0 auto}
.page.landscape .rule-card.centered{max-width:450px}
.rule-num{width:36px;height:36px;border-radius:10px;background:rgba(31,111,235,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#1F6FEB;flex-shrink:0}
.rule-text{font-size:16px;color:#e2e8f0;font-weight:500}
.footer{text-align:center;margin-top:auto;padding-top:40px}
.footer-text{font-size:14px;color:#475569}
.brand{font-size:16px;font-weight:700;color:#64748b;margin-top:8px}
</style></head><body>
<div class="page">
<div class="glow glow1"></div><div class="glow glow2"></div>
<div class="header"><div class="title">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Challenge Rules</div>${isCent ? '<div class="badge">CENT ACCOUNT ONLY</div>' : ''}</div>
<div class="info-row"><div class="info-item"><div class="info-label">Starting Balance</div><div class="info-value">${unit}${challenge.starting_balance || 0}</div></div><div class="info-item"><div class="info-label">Target</div><div class="info-value gold">${unit}${challenge.target_balance || 0}</div></div><div class="info-item"><div class="info-label">Period</div><div class="info-value" style="font-size:20px">${startDate} → ${endDate}</div></div></div>
<div class="rules-grid">${rulesList.map((r, i) => `<div class="rule-card${i === rulesList.length - 1 && rulesList.length % 2 !== 0 ? " centered" : ""}"><div class="rule-num">${i + 1}</div><div class="rule-text">${r}</div></div>`).join('')}</div>
<div class="footer"><div class="footer-text">Trades that break the rules will have profits removed. Losses still count.</div><div class="brand">BirrForex • WinnerPip</div></div>
</div>
<div class="page landscape">
<div class="glow glow1"></div><div class="glow glow2"></div>
<div class="header"><div class="title" style="font-size:42px">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Challenge Rules</div>${isCent ? '<div class="badge">CENT ACCOUNT ONLY</div>' : ''}</div>
<div class="info-row"><div class="info-item"><div class="info-label">Starting Balance</div><div class="info-value">${unit}${challenge.starting_balance || 0}</div></div><div class="info-item"><div class="info-label">Target</div><div class="info-value gold">${unit}${challenge.target_balance || 0}</div></div><div class="info-item"><div class="info-label">Period</div><div class="info-value" style="font-size:20px">${startDate} → ${endDate}</div></div></div>
<div class="rules-grid">${rulesList.map((r, i) => `<div class="rule-card${i === rulesList.length - 1 && rulesList.length % 2 !== 0 ? " centered" : ""}"><div class="rule-num">${i + 1}</div><div class="rule-text">${r}</div></div>`).join('')}</div>
<div class="footer"><div class="footer-text">Trades that break the rules will have profits removed. Losses still count.</div><div class="brand">BirrForex • WinnerPip</div></div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${(challenge.title || 'challenge').replace(/\s+/g, '_')}_rules.html`; a.click();
  URL.revokeObjectURL(url);
}

function downloadLeaderboardHTML(challenge: any, lb: any[]) {
  const top10 = lb.slice(0, 10);
  const realWinners = parseInt(challenge.real_winners_count || challenge.realWinnersCount || 3);
  const demoWinners = parseInt(challenge.demo_winners_count || challenge.demoWinnersCount || 3);

  const isWinnerEntry = (e: any) => {
    if (e.isDisqualified || !e.isQualified) return false;
    const count = e.accountType === 'demo' ? demoWinners : realWinners;
    return count > 0 && e.rank <= count;
  };

  const isCent = top10.some((e: any) => e.isCent);
  const formatBal = (e: any) => {
    if (e.isDisqualified) return 'DQ';
    const val = Number(e.adjustedBalance || 0);
    return e.isCent ? `${val.toFixed(0)}¢` : `$${val.toFixed(2)}`;
  };

  const rowsHTML = top10.map((e) => {
    const winner = isWinnerEntry(e);
    const rowClass = winner ? 'winner' : '';
    const rankLabel = winner ? '🏆' : `${e.rank}`;
    const bal = formatBal(e);
    return `<div class="lb-row ${rowClass}"><div class="lb-rank">${rankLabel}</div><div class="lb-name">${e.nickname || '—'}</div><div class="lb-type">${e.accountType}</div><div class="lb-balance">${bal}</div><div class="lb-trades">${e.totalTrades} trades</div></div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${challenge.title} - Leaderboard</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0a0e1a}
.page{width:1080px;height:1920px;padding:80px;display:flex;flex-direction:column;background:linear-gradient(135deg,#0a0e1a 0%,#111827 50%,#0a0e1a 100%);position:relative;overflow:hidden;page-break-after:always}
.page.landscape{width:1920px;height:1080px;padding:60px 100px}
.glow{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(150px);opacity:0.15}
.glow1{top:-200px;right:-100px;background:#F5B400}.glow2{bottom:-200px;left:-100px;background:#16C784}
.header{text-align:center;margin-bottom:50px}
.title{font-size:44px;font-weight:800;color:#fff;margin-bottom:8px}
.subtitle{font-size:18px;color:#94a3b8}
.trophy{font-size:60px;margin-bottom:16px}
.lb-container{flex:1;display:flex;flex-direction:column;gap:12px;max-width:900px;margin:0 auto;width:100%}
.page.landscape .lb-container{max-width:1400px}
.lb-row{display:flex;align-items:center;gap:20px;padding:20px 28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;transition:all 0.2s}
.lb-row.winner{background:rgba(22,199,132,0.08);border-color:rgba(22,199,132,0.35)}
.lb-rank{font-size:28px;width:50px;text-align:center;font-weight:700;color:#64748b}
.lb-row.winner .lb-rank{color:#16C784;font-size:32px}
.lb-row.winner .lb-name{color:#16C784}
.lb-row.winner .lb-balance{color:#16C784}
.lb-name{flex:1;font-size:20px;font-weight:700;color:#fff}
.lb-type{font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(31,111,235,0.15);color:#1F6FEB;font-weight:600;text-transform:uppercase}
.lb-balance{font-size:22px;font-weight:700;color:#16C784;min-width:120px;text-align:right}
.lb-trades{font-size:13px;color:#64748b;min-width:80px;text-align:right}
.footer{text-align:center;margin-top:auto;padding-top:30px}
.brand{font-size:16px;font-weight:700;color:#475569}
</style></head><body>
<div class="page">
<div class="glow glow1"></div><div class="glow glow2"></div>
<div class="header"><div class="trophy">🏆</div><div class="title">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Leaderboard — Top 10</div></div>
<div class="lb-container">${rowsHTML}</div>
<div class="footer"><div class="brand">BirrForex • WinnerPip</div></div>
</div>
<div class="page landscape">
<div class="glow glow1"></div><div class="glow glow2"></div>
<div class="header" style="margin-bottom:30px"><div class="trophy" style="font-size:48px">🏆</div><div class="title" style="font-size:38px">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Leaderboard — Top 10</div></div>
<div class="lb-container">${rowsHTML}</div>
<div class="footer"><div class="brand">BirrForex • WinnerPip</div></div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${(challenge.title || 'challenge').replace(/\s+/g, '_')}_leaderboard.html`; a.click();
  URL.revokeObjectURL(url);
}

function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function SlFailuresPanel({ challengeId, slFailures, apiUrl, secretPath }: { challengeId: string; slFailures: any[]; apiUrl: string; secretPath: string }) {
  const [items, setItems] = useState<any[]>(slFailures);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const handleRetry = async (regId: number, nickname: string) => {
    setRetrying(String(regId));
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/retry-sl-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId }),
      });
      const data = await res.json();
      if (data.success) {
        setResults(r => ({ ...r, [regId]: `✅ ${data.message}` }));
        // Remove from list if no more pending trades
        if (data.checked > 0 || data.cleared > 0) {
          setItems(prev => prev.filter(f => f.registration_id !== regId));
        }
      } else {
        setResults(r => ({ ...r, [regId]: `❌ ${data.error || "Failed"}` }));
      }
    } catch {
      setResults(r => ({ ...r, [regId]: "❌ Connection error" }));
    }
    setRetrying(null);
  };

  return (
    <div className="glass rounded-2xl border border-gold/20 p-5">
      <h3 className="text-sm font-semibold text-gold mb-1 flex items-center gap-2">
        ⚠️ Max Risk Check Incomplete ({items.length} account{items.length !== 1 ? "s" : ""})
      </h3>
      <p className="text-[11px] text-gray-400 mb-4">
        These accounts had candle fetch failures during SL verification (last 7 days). Trades are not penalised yet — benefit of doubt applied. Retry to check now, or they will be auto-checked on the next pull cycle.
      </p>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {items.map((f: any) => (
          <div key={f.registration_id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
            <div>
              <p className="text-sm text-white font-semibold">
                {f.nickname} <span className="text-gray-500 text-xs">@{f.username || "—"}</span>
              </p>
              <p className="text-[10px] text-gray-400">{f.account_number} · {f.account_subtype}</p>
              {results[f.registration_id] && (
                <p className={`text-[10px] mt-1 font-semibold ${results[f.registration_id].startsWith("✅") ? "text-profit" : "text-loss"}`}>
                  {results[f.registration_id]}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="text-right mb-1">
                <p className="text-sm text-gold font-bold">{f.trades_unchecked}</p>
                <p className="text-[10px] text-gray-500">trades unchecked</p>
              </div>
              <button
                onClick={() => handleRetry(f.registration_id, f.nickname)}
                disabled={retrying === String(f.registration_id)}
                className="px-3 py-1.5 rounded-lg bg-gold/20 border border-gold/30 text-gold text-[10px] font-bold hover:bg-gold/30 transition-all disabled:opacity-50"
              >
                {retrying === String(f.registration_id) ? "Checking..." : "🔄 Retry SL Check"}
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-[11px] text-profit text-center py-2">✅ All SL checks resolved!</p>
        )}
      </div>
    </div>
  );
}

function PullsTab({ challengeId, pullHistory, terminalStatus, slFailures }: { challengeId: string; pullHistory: any[]; terminalStatus: any[]; slFailures: any[] }) {
  const [failedAccounts, setFailedAccounts] = useState<any[]>([]);
  const [credentialFailures, setCredentialFailures] = useState<any[]>([]);
  const [skippedAccounts, setSkippedAccounts] = useState<any[]>([]);
  const [loadingFailed, setLoadingFailed] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState<"credential" | "failed" | "skipped" | "sl" | "all" | "individual">("credential");

  // Individual account pull state
  const [indivQuery, setIndivQuery] = useState("");
  const [indivSearched, setIndivSearched] = useState(false);
  const [indivUser, setIndivUser] = useState<any>(null);
  const [indivSearching, setIndivSearching] = useState(false);
  const [indivPulling, setIndivPulling] = useState(false);
  const [indivResult, setIndivResult] = useState<any>(null);
  const [pullProgress, setPullProgress] = useState<any>(null);
  const [polling, setPolling] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);

  const formatEAT = (dateStr: string) => {
    const d = new Date(new Date(dateStr).getTime() + 3 * 60 * 60 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`;
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
  const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";

  const fetchFailed = async () => {
    setLoadingFailed(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/failed-accounts`);
      if (res.ok) { const data = await res.json(); setFailedAccounts(data.failed || []); setCredentialFailures(data.credentialFailures || []); setSkippedAccounts(data.skipped || []); }
    } catch (_e) {}
    setLoadingFailed(false);
  };

  const handleForcePull = async () => {
    setActionMsg("⏳ Starting pull cycle...");
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/force-pull`, { method: "POST" });
      if (res.ok) { const data = await res.json(); setActionMsg(`✅ ${data.message}`); startPolling(); }
      else setActionMsg("❌ Failed to trigger pull");
    } catch (_e) { setActionMsg("❌ Connection error"); }
  };

  const handleForcePullRank = async () => {
    setActionMsg("⏳ Starting pull + ranking update...");
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/force-pull-rank`, { method: "POST" });
      if (res.ok) { const data = await res.json(); setActionMsg(`✅ ${data.message}`); startPolling(); }
      else setActionMsg("❌ Failed to trigger pull");
    } catch (_e) { setActionMsg("❌ Connection error"); }
  };

  const handleFullPull = async () => {
    setActionMsg("⏳ Starting full pull (non-incremental) + evaluate + rank...");
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/full-pull`, { method: "POST" });
      if (res.ok) { const data = await res.json(); setActionMsg(`✅ ${data.message}`); startPolling(); }
      else setActionMsg("❌ Failed to trigger full pull");
    } catch (_e) { setActionMsg("❌ Connection error"); }
  };

  const stopPoll = () => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPolling(false);
  };

  const startPolling = () => {
    stopPoll();
    setPolling(true);
    pollIntervalRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`${apiUrl}/api/admin/${secretPath}/pull-status`);
        const d = await r.json();
        setPullProgress(d);
        if (!d.isRunning) {
          stopPoll();
          fetchFailed();
          setTimeout(() => window.location.reload(), 1000);
        }
      } catch (_e) {}
    }, 3000);
  };

  // Check if a pull is already running on mount
  useEffect(() => {
    async function check() {
      try {
        const r = await fetch(`${apiUrl}/api/admin/${secretPath}/pull-status`);
        const d = await r.json();
        setPullProgress(d);
        if (d.isRunning) { startPolling(); }
      } catch (_e) {}
    }
    check();
    return () => { stopPoll(); };
  }, []);

  const handleRetryAccount = async (regId: number) => {
    setRetrying(String(regId));
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/retry-account`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ registrationId: regId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMsg(`✅ ${data.message}`);
      } else {
        setActionMsg(`❌ ${data.message || "Retry failed"}`);
      }
      // Refresh failed list
      setTimeout(() => fetchFailed(), 1000);
    } catch (_e) { setActionMsg("❌ Connection error"); }
    setRetrying(null);
  };

  const handleRetryAll = async () => {
    setRetrying("all");
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/retry-all-failed`, { method: "POST" });
      if (res.ok) { const data = await res.json(); setActionMsg(`✅ ${data.count} accounts queued for retry`); fetchFailed(); }
      else setActionMsg("❌ Failed");
    } catch (_e) { setActionMsg("❌ Connection error"); }
    setRetrying(null);
  };

  const handleUpdatePassword = async (regId: number, newPassword: string) => {
    setRetrying(String(regId));
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/update-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMsg(`✅ ${data.message}`);
        if (data.requiresReinstateConfirm) {
          const ok = window.confirm(
            `This account was disqualified.\n\nReason: ${data.disqualifiedReason || "unknown"}\n\n` +
            `Password is fixed and verified. Are you sure you want to reinstate it ` +
            `(resume pulls and rejoin the leaderboard)?`
          );
          if (ok) {
            await handleReinstateAccount(regId);
          } else {
            setActionMsg("⚠️ Password updated but account left disqualified (not reinstated)");
          }
        }
        setTimeout(() => fetchFailed(), 1000);
      } else {
        setActionMsg(`❌ ${data.message || "Update failed"}`);
      }
    } catch (_e) { setActionMsg("❌ Connection error"); }
    setRetrying(null);
  };

  const handleReinstateAccount = async (regId: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/reinstate-account`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: regId, confirm: true }),
      });
      const data = await res.json();
      setActionMsg(data.success ? `✅ ${data.message}` : `❌ ${data.message || "Reinstate failed"}`);
      setTimeout(() => fetchFailed(), 1000);
    } catch (_e) { setActionMsg("❌ Connection error"); }
  };

  const handleIndivSearch = async () => {
    const q = indivQuery.trim();
    if (!q) return;
    setIndivSearching(true);
    setIndivSearched(true);
    setIndivUser(null);
    setIndivResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/finduser?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setIndivUser(data.found ? data.user : null);
      }
    } catch (_e) {}
    setIndivSearching(false);
  };

  const handleIndivPull = async () => {
    if (!indivUser) return;
    setIndivPulling(true);
    setIndivResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/pull-single-account`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: indivUser.id }),
      });
      const data = await res.json();
      setIndivResult(data);
    } catch (_e) { setIndivResult({ success: false, errorMessage: "Network error" }); }
    setIndivPulling(false);
  };

  useEffect(() => { fetchFailed(); }, [challengeId]);

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Zap size={16} className="text-royal" /> Pull Actions</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={handleForcePull} className="px-4 py-2.5 rounded-xl bg-royal/20 border border-royal/30 text-royal text-xs font-bold hover:bg-royal/30 transition-all">⚡ Force Pull Now</button>
          <button onClick={handleForcePullRank} className="px-4 py-2.5 rounded-xl bg-profit/20 border border-profit/30 text-profit text-xs font-bold hover:bg-profit/30 transition-all">⚡ Pull + Update Rankings</button>
          <button onClick={handleFullPull} className="px-4 py-2.5 rounded-xl bg-gold/20 border border-gold/30 text-gold text-xs font-bold hover:bg-gold/30 transition-all">🔄 Full Pull + Evaluate + Rank</button>
          <button onClick={fetchFailed} disabled={loadingFailed} className="px-4 py-2.5 rounded-xl bg-loss/10 border border-loss/30 text-loss text-xs font-bold hover:bg-loss/20 transition-all">{loadingFailed ? "Loading..." : "🔍 View Failed Accounts"}</button>
          <button onClick={handleRetryAll} disabled={retrying === "all" || failedAccounts.length === 0} className="px-4 py-2.5 rounded-xl bg-gold/10 border border-gold/30 text-gold text-xs font-bold hover:bg-gold/20 transition-all disabled:opacity-50">{retrying === "all" ? "Retrying..." : "🔄 Retry All Failed"}</button>
        </div>
        {actionMsg && <p className={`text-xs mt-3 font-semibold ${actionMsg.startsWith("✅") ? "text-profit" : actionMsg.startsWith("⏳") ? "text-gold" : "text-loss"}`}>{actionMsg}</p>}
      </div>

      {/* Pull Progress Bar */}
      {pullProgress?.isRunning && (
        <div className="glass rounded-2xl border border-royal/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Loader2 size={16} className="text-royal animate-spin" /> Pull In Progress</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{pullProgress.elapsedSeconds}s elapsed</span>
              <button
                onClick={async () => {
                  try {
                    try {
                      await fetch(`${apiUrl}/api/admin/${secretPath}/cancel-pull`, { method: "POST" });
                    } catch (_e) {}
                    // Always stop polling and hide bar regardless of API response
                    setPullProgress((prev: any) => ({ ...prev, isRunning: false }));
                    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
                    setPolling(false);
                  } catch (_e) {}
                }}
                className="px-3 py-1 rounded-lg bg-loss/10 border border-loss/30 text-loss text-xs font-semibold hover:bg-loss/20 transition-all"
              >
                ✕ Stop Pull
              </button>
            </div>
          </div>
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full bg-gradient-to-r from-royal to-profit transition-all duration-1000" style={{ width: `${pullProgress.percent || 0}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{pullProgress.processed || 0} / {pullProgress.totalAccounts || 0} accounts</span>
            <span className="text-royal font-semibold">{pullProgress.percent || 0}%</span>
          </div>
        </div>
      )}

      {/* Last Completed Pull Summary */}
      {pullProgress && !pullProgress.isRunning && pullProgress.lastBatch && (
        <div className="glass rounded-2xl border border-profit/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-profit font-semibold">✅ Last pull: {pullProgress.lastBatch.successful}✓ {pullProgress.lastBatch.failed}✗ — {pullProgress.lastBatch.newTrades} new trades — {pullProgress.lastBatch.durationSec}s</p>
            <p className="text-[10px] text-gray-500">{pullProgress.lastBatch.completedAt ? (() => { const d = new Date(new Date(pullProgress.lastBatch.completedAt).getTime() + 3*60*60*1000); return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : ""}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-2 flex-wrap">
        <button onClick={() => setShowFilter("credential")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "credential" ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>🔑 Credential Failures ({credentialFailures.length})</button>
        <button onClick={() => setShowFilter("failed")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "failed" ? "bg-loss/20 text-loss border border-loss/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>❌ Failed ({failedAccounts.length})</button>
        <button onClick={() => setShowFilter("skipped")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "skipped" ? "bg-gray-500/20 text-gray-300 border border-gray-500/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>⏭️ Skipped ({skippedAccounts.length})</button>
        <button onClick={() => setShowFilter("sl")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "sl" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>🕯️ Max Risk Check Failure ({slFailures.length})</button>
        <button onClick={() => setShowFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "all" ? "bg-royal/20 text-royal border border-royal/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>All</button>
        <button onClick={() => { setShowFilter("individual"); setIndivResult(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showFilter === "individual" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "bg-white/5 text-gray-400 hover:text-white"}`}>🎯 Pull Individual Account</button>
      </div>

      {/* Credential Failures List — only password_changed / invalid_credentials accounts */}
      {(showFilter === "credential" || showFilter === "all") && (
        <div className="glass rounded-2xl border border-gold/20 p-5">
          <h3 className="text-sm font-semibold text-gold mb-4">🔑 Credential Failures ({credentialFailures.length})</h3>
          {credentialFailures.length === 0 ? (
            <p className="text-[11px] text-profit text-center py-2">✅ No credential failures right now.</p>
          ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {credentialFailures.map((f: any) => (
              <div key={f.registration_id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                <div>
                  <p className="text-sm text-white font-semibold">
                    {f.account_number} <span className="text-gray-500 text-xs">@{f.username || f.nickname || "unknown"}</span>
                    {f.disqualified && <span className="ml-2 px-1.5 py-0.5 rounded bg-loss/20 text-loss text-[9px] font-bold align-middle">DQ&apos;d</span>}
                  </p>
                  {f.email && <p className="text-[10px] text-gray-400">{f.email}</p>}
                  <p className="text-[10px] text-loss">{f.pull_status}: {(f.pull_error || f.error_message || "Invalid credentials").substring(0, 60)}</p>
                  {f.disqualified && f.disqualified_reason && <p className="text-[10px] text-loss/80">DQ reason: {f.disqualified_reason}</p>}
                  <p className="text-[10px] text-gray-500">{f.last_pull_at ? formatEAT(f.last_pull_at) : "Never"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => handleRetryAccount(f.registration_id)} disabled={retrying === String(f.registration_id)} className="px-3 py-1.5 rounded-lg bg-royal/20 border border-royal/30 text-royal text-[10px] font-bold hover:bg-royal/30 transition-all disabled:opacity-50">
                    {retrying === String(f.registration_id) ? "..." : "🔄 Retry"}
                  </button>
                  <button onClick={() => { const pw = prompt("Enter new investor password:"); if (pw) handleUpdatePassword(f.registration_id, pw); }} className="px-3 py-1.5 rounded-lg bg-gold/20 border border-gold/30 text-gold text-[10px] font-bold hover:bg-gold/30 transition-all">
                    🔑 Update PW
                  </button>
                  {f.disqualified && f.pull_status === "success" && (
                    <button
                      onClick={() => {
                        const ok = window.confirm(
                          `This account was disqualified.\n\nReason: ${f.disqualified_reason || "unknown"}\n\n` +
                          `Password is already verified working. Are you sure you want to reinstate it?`
                        );
                        if (ok) handleReinstateAccount(f.registration_id);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-profit/20 border border-profit/30 text-profit text-[10px] font-bold hover:bg-profit/30 transition-all"
                    >
                      ✅ Reinstate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Failed Accounts List (non-credential failures) — always shown when this tab is active, even with 0, so retry UI never disappears */}
      {(showFilter === "failed" || showFilter === "all") && (
        <div className="glass rounded-2xl border border-loss/20 p-5">
          <h3 className="text-sm font-semibold text-loss mb-4">❌ Failed Accounts ({failedAccounts.length})</h3>
          {failedAccounts.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {failedAccounts.map((f: any) => (
                <div key={f.registration_id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div>
                    <p className="text-sm text-white font-semibold">{f.account_number} <span className="text-gray-500 text-xs">@{f.username || f.nickname || "unknown"}</span></p>
                    {f.email && <p className="text-[10px] text-gray-400">{f.email}</p>}
                    <p className="text-[10px] text-loss">{f.pull_status}: {(f.pull_error || f.error_message || "Unknown error").substring(0, 60)}</p>
                    <p className="text-[10px] text-gray-500">{f.last_pull_at ? formatEAT(f.last_pull_at) : "Never"}</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => handleRetryAccount(f.registration_id)} disabled={retrying === String(f.registration_id)} className="px-3 py-1.5 rounded-lg bg-royal/20 border border-royal/30 text-royal text-[10px] font-bold hover:bg-royal/30 transition-all disabled:opacity-50">
                      {retrying === String(f.registration_id) ? "..." : "🔄 Retry"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-profit text-center py-2">✅ No failed accounts right now.</p>
          )}
        </div>
      )}

      {/* Skipped Accounts (zero balance + disqualified) */}
      {(showFilter === "skipped" || showFilter === "all") && (
        <div className="glass rounded-2xl border border-gray-500/20 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">⏭️ Skipped from Pull ({skippedAccounts.length})</h3>
          {skippedAccounts.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {skippedAccounts.map((s: any) => (
                <div key={s.registration_id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div>
                    <p className="text-sm text-white font-semibold">{s.account_number} <span className="text-gray-500 text-xs">@{s.username || s.nickname || "unknown"}</span></p>
                    {s.email && <p className="text-[10px] text-gray-400">{s.email}</p>}
                    <p className="text-[10px] text-gray-500">
                      {s.disqualified ? <span className="text-loss">DQ: {(s.disqualified_reason || "").substring(0, 40)}</span> : <span className="text-gold">Zero balance since {s.zero_balance_at ? formatEAT(s.zero_balance_at) : "—"}</span>}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${s.disqualified ? "bg-loss/20 text-loss" : "bg-gold/20 text-gold"}`}>
                    {s.disqualified ? "DQ" : "$0"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-profit text-center py-2">✅ Nothing skipped right now.</p>
          )}
        </div>
      )}

      {/* Fake SL Detection Failures List */}
      {(showFilter === "sl" || showFilter === "all") && (
        slFailures.length > 0 ? (
          <SlFailuresPanel challengeId={challengeId} slFailures={slFailures} apiUrl={apiUrl} secretPath={secretPath} />
        ) : (
          <div className="glass rounded-2xl border border-amber-500/20 p-5">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">🕯️ Max Risk Check Failure (0)</h3>
            <p className="text-[11px] text-profit text-center py-2">✅ No candle-check failures right now.</p>
          </div>
        )
      )}

      {/* Pull Individual Account Panel */}
      {showFilter === "individual" && (
        <div className="glass rounded-2xl border border-purple-500/20 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2">🎯 Pull Individual Account</h3>
          <p className="text-[11px] text-gray-400">Search by email, account number, username or nickname. This runs a full pull from challenge start, re-evaluates all rules, and updates rankings.</p>

          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              value={indivQuery}
              onChange={e => { setIndivQuery(e.target.value); setIndivSearched(false); setIndivUser(null); setIndivResult(null); }}
              onKeyDown={e => e.key === "Enter" && handleIndivSearch()}
              placeholder="Email / account number / username / nickname..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/40"
            />
            <button onClick={handleIndivSearch} disabled={indivSearching || !indivQuery.trim()} className="px-4 py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50">
              {indivSearching ? "Searching..." : "Find"}
            </button>
          </div>

          {/* No result */}
          {indivSearched && !indivSearching && !indivUser && (
            <p className="text-[11px] text-loss text-center py-2">No participant found matching that query.</p>
          )}

          {/* Found user card */}
          {indivUser && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{indivUser.nickname || indivUser.username}</p>
                  <p className="text-[11px] text-gray-400">@{indivUser.username} · {indivUser.email}</p>
                </div>
                {indivUser.disqualified
                  ? <span className="px-2 py-1 rounded-lg bg-loss/20 text-loss text-[10px] font-bold border border-loss/30">DQ</span>
                  : <span className="px-2 py-1 rounded-lg bg-profit/20 text-profit text-[10px] font-bold border border-profit/30">Active</span>
                }
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Account</p><p className="text-white font-semibold">{indivUser.accountNumber}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Rank</p><p className="text-white font-semibold">{indivUser.rank ? `#${indivUser.rank}` : "—"}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Trades</p><p className="text-white font-semibold">{indivUser.totalTrades}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Qual. Profit</p><p className="text-profit font-semibold">{indivUser.isCent ? `${Number(indivUser.qualifiedProfit).toFixed(2)}¢` : `$${Number(indivUser.qualifiedProfit).toFixed(2)}`}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Flagged</p><p className="text-loss font-semibold">{indivUser.flaggedTrades}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Active Days</p><p className="text-white font-semibold">{indivUser.activeDays}</p></div>
              </div>
              {indivUser.disqualified && indivUser.disqualifiedReason && (
                <p className="text-[10px] text-loss bg-loss/10 rounded-lg px-3 py-2">DQ Reason: {indivUser.disqualifiedReason}</p>
              )}
              {!indivResult && (
                <button onClick={handleIndivPull} disabled={indivPulling} className="w-full py-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50">
                  {indivPulling ? "⏳ Pulling full history & evaluating… (30–60s)" : "⚡ Pull This Account"}
                </button>
              )}
            </div>
          )}

          {/* Result popup card */}
          {indivResult && (
            <div className={`rounded-xl border p-4 space-y-3 ${indivResult.success ? "bg-profit/5 border-profit/20" : "bg-loss/5 border-loss/20"}`}>
              {indivResult.success ? (
                <>
                  <p className="text-sm font-bold text-profit text-center">✅ Pull Complete</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Trades in DB</p><p className="text-white font-bold">{indivResult.tradesFound}</p></div>
                    <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">New Trades Added</p><p className="text-royal font-bold">{indivResult.tradesAdded}</p></div>
                    <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Faults Found</p><p className="text-loss font-bold">{indivResult.faultsFound}</p></div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <p className="text-gray-400">Rank</p>
                      <p className="text-white font-bold">
                        {indivResult.prevRank ? `#${indivResult.prevRank}` : "—"} → {indivResult.newRank ? `#${indivResult.newRank}` : "—"}
                      </p>
                    </div>
                  </div>
                  {indivResult.isDisqualified ? (
                    <p className="text-[10px] text-loss bg-loss/10 rounded-lg px-3 py-2 text-center">Account remains disqualified · {indivResult.dqReason}</p>
                  ) : (
                    <p className="text-[10px] text-profit text-center">Account is active and in good standing.</p>
                  )}
                  <button onClick={() => { setIndivResult(null); setIndivUser(null); setIndivSearched(false); setIndivQuery(""); }} className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-xs hover:text-white transition-all">Clear</button>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-loss text-center">Pull Failed</p>
                  <p className="text-[11px] text-gray-400 text-center">{indivResult.errorMessage || "Unknown error"}</p>
                  <button onClick={handleIndivPull} disabled={indivPulling} className="w-full py-2 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold hover:bg-purple-500/30 transition-all disabled:opacity-50">Retry Pull</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminal Status Grid */}
      <div className="glass rounded-2xl border border-white/10 p-5">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={16} className="text-royal" /> Terminal Status (Last Cycle)
        </h3>
        <div className="grid grid-cols-5 gap-2">
          {terminalStatus.map((t: any) => {
            const hasData = t.processed > 0;
            const failed = t.failed || 0;
            const isUnhealthy = !t.healthy;
            const color = isUnhealthy ? "border-loss/40 bg-loss/5" : hasData && failed > 0 ? "border-gold/30 bg-gold/5" : hasData ? "border-profit/30 bg-profit/5" : "border-white/10 bg-white/5";
            const dot = isUnhealthy ? "bg-loss" : hasData && failed > 0 ? "bg-gold" : "bg-profit";
            return (
              <div key={t.id} className={`rounded-xl border p-3 ${color}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white">T{t.id}</span>
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                </div>
                {hasData ? (
                  <>
                    <p className="text-[10px] text-profit">{t.success}✓</p>
                    {failed > 0 && <p className="text-[10px] text-loss">{failed}✗</p>}
                    <p className="text-[10px] text-gray-500">{t.processed} total</p>
                  </>
                ) : (
                  <p className="text-[10px] text-gray-500">{isUnhealthy ? "Unhealthy" : "Idle"}</p>
                )}
              </div>
            );
          })}
        </div>
        {terminalStatus.every((t: any) => t.processed === 0) && (
          <p className="text-[11px] text-gray-500 mt-3">Per-terminal data will appear here after the next pull cycle completes.</p>
        )}
      </div>

      {/* Pull History Table */}
      {pullHistory.length > 0 && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clock size={16} className="text-royal" /> Pull Batch History</h3>
            <span className="text-[10px] text-gray-400">Next pull: <span className="text-royal font-semibold">{(() => { const now = new Date(Date.now() + 3*60*60*1000); const h = now.getUTCHours(); const schedule = [0,4,8,12,16,20]; const next = schedule.find(s => s > h); return next !== undefined ? `${String(next).padStart(2,"0")}:00 EAT` : "00:00 EAT"; })()}</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead><tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Time (EAT)</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Success</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Failed</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">New Trades</th>
                <th className="text-right py-3 px-4 text-[10px] text-gray-400 uppercase">Duration</th>
              </tr></thead>
              <tbody>{pullHistory.map((p, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4 text-sm text-white font-semibold">
                    <span>{p.time}</span>
                    {p.isPreStart && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-royal/20 text-royal border border-royal/30">📸 Pre-start</span>}
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-profit">{p.success}</td>
                  <td className="py-3 px-4 text-center text-sm text-loss">{p.failed}</td>
                  <td className="py-3 px-4 text-center text-sm text-gray-300">{p.isPreStart ? "—" : p.newTrades}</td>
                  <td className="py-3 px-4 text-right text-sm text-gray-400">{p.duration}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {pullHistory.length === 0 && failedAccounts.length === 0 && (
        <div className="glass rounded-2xl border border-white/10 p-8 text-center">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No pull data yet. Pull cycles run every 4 hours (06:00, 10:00, 14:00, 18:00, 22:00, 02:00 EAT)</p>
        </div>
      )}
    </div>
  );
}


function VerifyButton({ challengeId, registrationId, onResult }: { challengeId: string; registrationId: number; onResult: (data: any) => void }) {
  const [checking, setChecking] = useState(false);

  const handleVerify = async () => {
    setChecking(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    const secretPath = process.env.NEXT_PUBLIC_ADMIN_PATH || "";
    try {
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/challenge/${challengeId}/verify-account`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      const data = await res.json();
      onResult(data);
    } catch {
      onResult({ verified: false, error: "Connection error" });
    }
    setChecking(false);
  };

  return (
    <button onClick={handleVerify} disabled={checking} title="Verify Connection" className="p-1.5 rounded-lg hover:bg-profit/20 text-gray-400 hover:text-profit transition-all disabled:opacity-50">
      {checking ? <Loader2 size={14} className="animate-spin text-royal" /> : <Shield size={14} />}
    </button>
  );
}

// ==================== MT5 TRADE HISTORY HTML EXPORT ====================
function generateTradesHTML(data: any): string {
  const { challenge, user, trades } = data;
  const cur = (v: any) => user?.isCent ? `${Number(v || 0).toFixed(2)}¢` : `$${Number(v || 0).toFixed(2)}`;
  const fmtEAT = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
    return d.toISOString().replace("T", " ").substring(0, 19) + " EAT";
  };
  const duration = (open: string, close: string) => {
    if (!open || !close) return "—";
    const totalSec = Math.round((new Date(close).getTime() - new Date(open).getTime()) / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const h = Math.floor(totalSec / 3600);
    const rm = Math.floor((totalSec % 3600) / 60);
    const rs = totalSec % 60;
    if (h > 0) return rs > 0 ? `${h}h ${rm}m ${rs}s` : (rm > 0 ? `${h}h ${rm}m` : `${h}h`);
    return rs > 0 ? `${rm}m ${rs}s` : `${rm}m`;
  };
  const slResultBadge = (r: string | null) => {
    if (!r) return `<span style="color:#6b7280">—</span>`;
    if (r === 'passed')    return `<span style="color:#22c55e;font-weight:700">✓ Passed</span>`;
    if (r === 'fake_sl')   return `<span style="color:#ef4444;font-weight:700">⚠ Max Risk Breached</span>`;
    if (r === 'no_candles')return `<span style="color:#f59e0b;font-weight:700">? No Data</span>`;
    return `<span style="color:#6b7280">Skipped</span>`;
  };
  // Violation text often references other trades' tickets (e.g. "also open: #302576583
  // [XAUUSDc]") — turn those into in-page links that jump straight to that trade's row.
  const linkifyTickets = (text: string) =>
    text.replace(/#(\d+)/g, (m: string, tid: string) => `<a href="#trade-${tid}" style="color:#fbbf24;text-decoration:underline">#${tid}</a>`);
  const rows = (trades || []).map((t: any, i: number) => {
    const flagged = !t.isQualified;
    const bg = flagged ? "#2a0a0a" : (i % 2 === 0 ? "#111827" : "#0f172a");
    const profitColor = t.profit >= 0 ? "#22c55e" : "#ef4444";
    const viols = linkifyTickets((t.violations || []).map((v: any) => typeof v === 'string' ? v : v?.detail || 'Rule violation').join('<br>'));
    return `<tr id="trade-${t.ticket}" class="trow" style="background:${bg};border-bottom:1px solid #1f2937">
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px">${i + 1}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px">${t.ticket}</td>
      <td style="padding:8px 10px;color:#f9fafb;font-weight:600;font-size:12px">${t.symbol}</td>
      <td style="padding:8px 10px;font-weight:700;font-size:11px;color:${t.type?.toLowerCase() === 'buy' ? '#22c55e' : '#ef4444'}">${t.type?.toUpperCase()}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;white-space:nowrap">${fmtEAT(t.openTime)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;white-space:nowrap">${fmtEAT(t.closeTime)}</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:center">${duration(t.openTime, t.closeTime)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;text-align:right">${Number(t.volume).toFixed(2)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;text-align:right">${Number(t.openPrice).toFixed(5)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;text-align:right">${Number(t.closePrice).toFixed(5)}</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:right">${t.stopLoss ? Number(t.stopLoss).toFixed(5) : "—"}</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:right">${t.slAllowedPrice ? Number(t.slAllowedPrice).toFixed(5) : "—"}</td>
      <td style="padding:8px 10px;font-size:11px;text-align:right;color:${t.type?.toLowerCase() === 'buy' ? '#ef4444' : '#22c55e'}">${t.slMaxAdversePrice ? Number(t.slMaxAdversePrice).toFixed(5) : "—"}</td>
      <td style="padding:8px 10px;font-size:11px;text-align:center">${slResultBadge(t.slCheckResult)}</td>
      <td style="padding:8px 10px;font-weight:700;font-size:12px;text-align:right;color:${profitColor}">${cur(t.profit)}</td>
      <td style="padding:8px 10px;font-size:10px;text-align:right;color:#6b7280">${cur(t.commission)} / ${cur(t.swap)}</td>
      <td style="padding:8px 10px;font-size:11px;text-align:center">${flagged ? `<span style="color:#ef4444;font-weight:700">🚩 Flagged</span>` : `<span style="color:#22c55e">✓</span>`}</td>
      <td style="padding:8px 10px;font-size:10px;color:#ef4444;max-width:220px">${viols}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${user?.nickname || "User"} — MT5 Trade History</title>
<style>
  body{margin:0;padding:24px;background:#0a0f1e;font-family:'Segoe UI',Arial,sans-serif;color:#f9fafb}
  h1{font-size:22px;font-weight:800;color:#f9fafb;margin:0 0 4px}
  .sub{font-size:13px;color:#9ca3af;margin-bottom:20px}
  .badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;margin-right:8px}
  .real{background:#78350f22;color:#fbbf24;border:1px solid #92400e44}
  .demo{background:#1e3a5f22;color:#60a5fa;border:1px solid #1e40af44}
  table{width:100%;border-collapse:collapse;font-size:12px}
  thead tr{background:#1f2937;border-bottom:2px solid #374151}
  th{padding:10px 10px;text-align:left;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
  .note{margin-top:16px;padding:12px 16px;background:#1f2937;border-radius:8px;font-size:11px;color:#9ca3af}
  .note b{color:#f9fafb}
  tbody tr.trow{transition:background .12s ease}
  tbody tr.trow:hover{background:#1e293b !important;outline:1px solid #374151}
  tbody tr.trow:target{background:#1e3a5f !important;outline:2px solid #60a5fa}
</style>
</head><body>
<h1>${user?.nickname || "User"} — MT5 Trade History</h1>
<div class="sub">
  <span class="badge ${user?.accountType}">${user?.accountType}</span>
  Account: ${user?.accountNumber} &nbsp;|&nbsp; Server: ${user?.server}
  &nbsp;|&nbsp; Challenge: ${challenge?.title || "—"}
  &nbsp;|&nbsp; Period: ${challenge?.startDate ? new Date(challenge.startDate).toLocaleDateString() : "—"} → ${challenge?.endDate ? new Date(challenge.endDate).toLocaleDateString() : "—"}
  &nbsp;|&nbsp; Exported: ${new Date().toLocaleString()}
</div>
<table>
<thead><tr>
  <th>#</th><th>Ticket</th><th>Symbol</th><th>Type</th>
  <th>Open (EAT)</th><th>Close (EAT)</th><th>Duration</th><th>Lots</th>
  <th>Open Price</th><th>Close Price</th>
  <th>SL Set</th><th>Allowed SL</th><th>Max Adverse</th><th>SL Check</th>
  <th>Profit</th><th>Comm / Swap</th><th>Qualified</th><th>Violations</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<div class="note">
  <b>Allowed SL</b> — the furthest price the SL is allowed to be at (based on max risk rule). &nbsp;
  <b>Max Adverse</b> — the most extreme price the market reached during the trade (min low for Buy, max high for Sell). &nbsp;
  <b>SL Check: ⚠ Max Risk Breached</b> — price moved past the maximum allowed risk level during the trade.
</div>
</body></html>`;
}
