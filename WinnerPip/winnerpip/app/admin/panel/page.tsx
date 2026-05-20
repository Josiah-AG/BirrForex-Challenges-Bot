"use client";
import { useState, useEffect } from "react";

import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Trophy, Users, AlertTriangle, Activity, TrendingUp, Target, Shield, Clock, BarChart3, FileText, X, Key, Loader2, ArrowRight, ChevronDown, ChevronUp, Zap, MessageSquare, UserMinus, Ban } from "lucide-react";

export default function AdminDashboard() {
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>("5");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "leaderboard" | "violations" | "pulls" | "screening" | "participants" | "rules" | "health">("overview");
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
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
  const [overviewData, setOverviewData] = useState<any>(null);

  // Lock scroll on modal
  useEffect(() => {
    if (selectedParticipant) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedParticipant]);

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

  useState(() => { if (typeof window !== "undefined" && localStorage.getItem("wp_admin_path")) setIsAdmin(true); });

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
    avgBalance: od?.balance?.average?.toFixed(2) || "0.00",
    medianBalance: od?.balance?.median?.toFixed(2) || "0.00",
    aboveTarget: od?.qualified || 0,
    qualifiedCount: od?.qualified || 0,
    lastPullTime: "—", nextPullTime: "—",
  };

  const topViolations: any[] = [];
  const pullHistory: any[] = [];
  const terminalStatus: any[] = [];
  const recentPullErrors: any[] = [];
  const leaderboard: any[] = [];
  const flaggedParticipants: any[] = [];

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
            <div className="space-y-4">
              <Input type="password" placeholder="Admin key" value={adminPass} onChange={(e) => setAdminPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()} />
              <button onClick={handleAdminLogin} disabled={loginLoading || !adminPass} className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-gradient-brand hover:opacity-90 text-white font-semibold disabled:opacity-50">
                {loginLoading ? <Loader2 size={18} className="animate-spin" /> : <Key size={18} />} Access Dashboard
              </button>
            </div>
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
              <div>
                <select value={selectedChallengeId} onChange={(e) => setSelectedChallengeId(e.target.value)} className="bg-transparent text-sm font-bold text-white border-none outline-none cursor-pointer">
                  {challenges.length > 0 ? challenges.map(c => (
                    <option key={c.id} value={String(c.id)} className="bg-[#0f1629] text-white">{c.title} ({c.status})</option>
                  )) : <option value="5" className="bg-[#0f1629]">Challenge 15</option>}
                </select>
                <p className="text-xs text-royal font-semibold">ADMIN PANEL</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${challenge.status === "active" ? "bg-profit/20 text-profit border-profit/30" : "bg-white/10 text-gray-300 border-white/20"}`}>● {challenge.status}</span>
              <span className="text-xs text-gray-500">{overview.totalParticipants} users</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl relative">
        {/* NAV TABS */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto">
          {(["overview", "leaderboard", "violations", "pulls", "screening", "participants", "rules", "health"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSection(tab)} className={`flex-shrink-0 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all capitalize ${activeSection === tab ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{tab === "health" ? "⚡ Health" : tab}</button>
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
              {topViolations.length === 0 ? <p className="text-sm text-gray-500">No violation data yet — will populate after VPS pulls begin</p> : topViolations.map((v, i) => (
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
                <tbody>{leaderboard.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-gray-500">No leaderboard data yet — will populate after VPS pulls and evaluation</td></tr> : leaderboard.map(e => (
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
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Avg Cycle Time</p><p className="text-lg font-bold text-white">—</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Success Rate</p><p className="text-lg font-bold text-profit">—</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Avg Per Account</p><p className="text-lg font-bold text-white">—</p></div>
                <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Total Trades Synced</p><p className="text-lg font-bold text-royal">—</p></div>
              </div>
              <p className="text-[10px] text-gray-500 mt-3 text-center">Stats populate after VPS pull cycles run</p>
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
                    <div className="flex items-center gap-3 mb-1"><p className="text-xl font-bold text-white">{foundUser.nickname}</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${foundUser.accountType === "real" ? "bg-gold/20 text-gold" : "bg-royal/20 text-royal"}`}>{foundUser.accountType}</span><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-profit/20 text-profit">Rank #{foundUser.rank || "N/A"}</span></div>
                    <p className="text-sm text-gray-400">@{foundUser.username} • {foundUser.email}</p>
                  </div>
                  <button onClick={() => { setFoundUser(null); setSearchPerformed(false); setSearchQuery(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Balance</p><p className="text-lg font-bold text-white">${foundUser.balance != null ? Number(foundUser.balance).toFixed(2) : "N/A"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Qualified Profit</p><p className="text-lg font-bold text-profit">${foundUser.qualifiedProfit != null ? Number(foundUser.qualifiedProfit).toFixed(2) : "0.00"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Profit Removed</p><p className="text-lg font-bold text-loss">${foundUser.profitRemoved != null ? Number(foundUser.profitRemoved).toFixed(2) : "0.00"}</p></div>
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
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Registered</p><p className="text-sm font-semibold text-white">{foundUser.registeredAt}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Last Pull</p><p className="text-sm font-semibold text-white">{foundUser.lastPull}</p></div>
                  <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Partner</p><p className="text-sm font-semibold text-profit">{foundUser.partnerStatus}</p></div>
                </div>
                {foundUser.violations && foundUser.violations.length > 0 && (<div className="px-5 pb-3"><p className="text-xs font-semibold text-loss mb-2">Violations ({foundUser.violations.length})</p><div className="space-y-1">{foundUser.violations.map((v: string, i: number) => (<div key={i} className="flex items-center gap-2 p-2 bg-loss/5 rounded-lg border border-loss/10"><AlertTriangle size={12} className="text-loss flex-shrink-0" /><p className="text-xs text-gray-300">{v}</p></div>))}</div></div>)}
                <div className="px-5 pb-3"><p className="text-xs font-semibold text-gray-300 mb-2">Recent Trades</p>{foundUser.recentTrades && foundUser.recentTrades.length > 0 ? <div className="space-y-2">{foundUser.recentTrades.map((t: any, i: number) => (<div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"><div className="flex items-center gap-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span><div><p className="text-sm text-white font-semibold">{t.symbol}</p><p className="text-[10px] text-gray-500">{t.volume} lots</p></div></div><div className="text-right"><p className={`text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>${Number(t.profit).toFixed(2)}</p></div></div>))}</div> : <p className="text-sm text-gray-500">No trades yet</p>}</div>
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
                        <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${p.disqualified ? "opacity-50 bg-loss/5" : ""}`}>
                          <td className="py-2 px-3 text-xs text-gray-500">{p.rank || "—"}</td>
                          <td className="py-2 px-3 text-sm text-white font-medium">{p.nickname || "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-400">{p.username ? `@${p.username}` : "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate">{p.email || "—"}</td>
                          <td className="py-2 px-3 text-xs text-gray-300">{p.accountNumber}</td>
                          <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{p.accountType}</span></td>
                          <td className="py-2 px-3 text-right text-sm text-white">{p.balance != null ? `$${p.balance.toFixed(2)}` : "—"}</td>
                          <td className={`py-2 px-3 text-right text-sm font-medium ${(p.qualifiedProfit || 0) >= 0 ? "text-profit" : "text-loss"}`}>{p.qualifiedProfit != null ? `$${p.qualifiedProfit.toFixed(2)}` : "—"}</td>
                          <td className="py-2 px-3 text-center text-xs text-gray-400">{p.totalTrades}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
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
            <div className="glass rounded-2xl border border-white/10 p-8 text-center">
              <Shield className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-white font-semibold">No screening data yet</p>
              <p className="text-sm text-gray-400 mt-1">Partner/allocation screening will populate here once the challenge is active and screening runs nightly</p>
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
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div><p className="text-sm text-white font-medium">Only Cent Account</p><p className="text-[10px] text-gray-500">Real category requires cent accounts only</p></div>
                  <button onClick={() => setRulesConfig({ ...rulesConfig, only_cent_account: !(rulesConfig as any).only_cent_account })} className={`w-12 h-6 rounded-full transition-all ${(rulesConfig as any).only_cent_account ? "bg-profit" : "bg-white/20"}`}>
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

            {/* Save */}
            <div className="mt-6 flex justify-end">
              <button onClick={() => { setRulesSaved(true); setTimeout(() => setRulesSaved(false), 3000); }} className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all ${rulesSaved ? "bg-profit/20 text-profit border border-profit/30" : "bg-gradient-brand hover:opacity-90 text-white shadow-lg shadow-royal/20"}`}>
                {rulesSaved ? "✓ Rules Saved" : "Save Rules"}
              </button>
            </div>
          </div>
        </div>
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
      const res = await fetch(`${apiUrl}/api/admin/${secretPath}/vps-health`);
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
                <div className={`w-3 h-3 rounded-full ${healthData.vps.reachable ? "bg-profit animate-pulse" : "bg-loss"}`}></div>
                <h4 className="text-sm font-bold text-white">VPS Server</h4>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${healthData.vps.reachable ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>
                  {healthData.vps.reachable ? "ONLINE" : "OFFLINE"}
                </span>
              </div>

              {healthData.vps.reachable && healthData.vps.raw && (
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

              {healthData.vps.reachable && healthData.vps.raw && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Raw VPS response</summary>
                  <pre className="mt-2 p-3 bg-black/30 rounded-lg text-[10px] text-gray-400 overflow-x-auto">{JSON.stringify(healthData.vps.raw, null, 2)}</pre>
                </details>
              )}

              {!healthData.vps.reachable && (
                <p className="text-sm text-loss">{healthData.vps.error || "Cannot reach VPS server"}</p>
              )}
            </div>

            {/* Pull Stats (24h) */}
            <div className="p-4 rounded-xl border border-white/10 bg-white/5">
              <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-royal" /> Pull Stats (Last 24h)
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Batches</p>
                  <p className="text-2xl font-bold text-white">{healthData.pullStats.last24h.batches}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Success</p>
                  <p className="text-2xl font-bold text-profit">{healthData.pullStats.last24h.totalSuccess}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Failed</p>
                  <p className="text-2xl font-bold text-loss">{healthData.pullStats.last24h.totalFailed}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase">Success Rate</p>
                  <p className={`text-2xl font-bold ${healthData.pullStats.last24h.successRate >= 90 ? "text-profit" : healthData.pullStats.last24h.successRate >= 70 ? "text-gold" : "text-loss"}`}>{healthData.pullStats.last24h.successRate}%</p>
                </div>
              </div>

              {healthData.pullStats.passwordChangedPending > 0 && (
                <div className="p-3 rounded-lg bg-gold/10 border border-gold/20 mb-3">
                  <p className="text-xs text-gold font-semibold">🔑 {healthData.pullStats.passwordChangedPending} accounts with changed passwords (pending 48h)</p>
                </div>
              )}

              {/* Error breakdown */}
              {healthData.pullStats.errors24h.length > 0 && (
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

            {/* Recent Batches */}
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
