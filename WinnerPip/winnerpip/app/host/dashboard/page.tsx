"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Users, Trophy, FileText, Settings, RefreshCw,
  LogOut, Loader2, ChevronDown, Target, Activity, Shield, X,
  AlertTriangle, Zap, Clock, TrendingUp, Key, UserMinus, Ban,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

export default function HostDashboardPage() {
  const [isAuth, setIsAuth] = useState(false);
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);

  // Tab data
  const [overview, setOverview] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantsPagination, setParticipantsPagination] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [pullHistory, setPullHistory] = useState<any[]>([]);
  const [failedAccounts, setFailedAccounts] = useState<any>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<any>(null);
  const [selectedParticipantTrades, setSelectedParticipantTrades] = useState<any[]>([]);

  // Rules state
  const [rulesConfig, setRulesConfig] = useState<any>(null);
  const [rulesLocked, setRulesLocked] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  // Settings
  const [settingsForm, setSettingsForm] = useState<any>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Create challenge
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [createForm, setCreateForm] = useState({
    title: "", type: "hybrid", start_date: "", end_date: "",
    starting_balance: "30", target_balance: "60", deposit_mode: "fixed",
    target_percent: "100", real_winners_count: "3", demo_winners_count: "3",
    real_prizes: "", demo_prizes: "",
    registration_mode: "manual" as "winnerpip" | "manual",
    timezone: "Africa/Nairobi",
  });
  const [createRules, setCreateRules] = useState<any>({
    max_lot_size: 0.02, max_open_trades: 3, pair_limit: 2,
    stop_loss_required: true, max_risk_dollars: 5, max_risk_mode: 'fixed',
    max_risk_percent: 10, daily_loss_cap: 10, daily_loss_mode: 'fixed',
    daily_loss_percent: 20, max_hold_hours: 24, min_trade_duration_minutes: null,
    weekend_trading: false, min_active_days: 7, min_total_trades: null,
    only_cent_account: false, allow_professional: false,
    rules_enabled: { max_lot_size: true, max_open_trades: true, pair_limit: true, stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true, min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true },
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState("");
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);
  const [leaderboardCategory, setLeaderboardCategory] = useState<"all" | "real" | "demo">("all");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [participantsPage, setParticipantsPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [actionModal, setActionModal] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState("");

  const getToken = () => localStorage.getItem("host_token") || "";
  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });
  const selectedChallenge = challenges.find(c => c.id === selectedChallengeId);
  const challengeTz = selectedChallenge?.timezone || 'Africa/Nairobi';

  // Auth
  useEffect(() => {
    const token = localStorage.getItem("host_token");
    const info = localStorage.getItem("host_info");
    if (!token || !info) { window.location.href = "/host/login"; return; }
    fetch(`${API_URL}/api/host/verify-token`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.success) { setHostInfo(data.host); setIsAuth(true); } else { window.location.href = "/host/login"; } })
      .catch(() => { try { setHostInfo(JSON.parse(info)); setIsAuth(true); } catch { window.location.href = "/host/login"; } });
  }, []);

  // Fetch challenges
  useEffect(() => {
    if (!isAuth) return;
    fetch(`${API_URL}/api/host/challenges`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => {
        const liveChallenges = (data.challenges || []).filter((c: any) => c.status !== 'deleted');
        setChallenges(liveChallenges);
        if (liveChallenges.length > 0) {
          const active = liveChallenges.find((c: any) => ['active', 'registration_open'].includes(c.status));
          setSelectedChallengeId(active?.id || liveChallenges[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAuth]);

  // Fetch tab data
  const fetchTabData = useCallback(async () => {
    if (!selectedChallengeId || !isAuth) return;
    setTabLoading(true);
    const h = { Authorization: `Bearer ${getToken()}` };
    try {
      if (activeTab === "overview") {
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-overview`, { headers: h });
        if (res.ok) setOverview(await res.json());
      } else if (activeTab === "participants") {
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants`, { headers: h });
        if (res.ok) { const d = await res.json(); setParticipants(d.participants || []); setParticipantsPagination(d.pagination); }
      } else if (activeTab === "leaderboard") {
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers: h });
        if (res.ok) { const d = await res.json(); setLeaderboard(d.leaderboard || []); }
      } else if (activeTab === "violations") {
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/violations`, { headers: h });
        if (res.ok) { const d = await res.json(); setViolations(d.violations || []); }
      } else if (activeTab === "updates") {
        const [histRes, failRes] = await Promise.all([
          fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/pull-history`, { headers: h }),
          fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/failed-accounts`, { headers: h }),
        ]);
        if (histRes.ok) { const d = await histRes.json(); setPullHistory(d.batches || []); }
        if (failRes.ok) setFailedAccounts(await failRes.json());
      } else if (activeTab === "rules") {
        setRulesLoading(true);
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, { headers: h });
        if (res.ok) { const d = await res.json(); setRulesConfig(d.rules); setRulesLocked(d.locked || false); }
        setRulesLoading(false);
      } else if (activeTab === "settings") {
        const ch = selectedChallenge;
        if (ch) setSettingsForm({ title: ch.title || "", end_date: ch.end_date ? new Date(ch.end_date).toISOString().slice(0, 16) : "", target_balance: ch.target_balance ?? "", target_percent: ch.target_percent ?? "", real_winners_count: ch.real_winners_count ?? "", demo_winners_count: ch.demo_winners_count ?? "", real_prizes: Array.isArray(ch.real_prizes) ? ch.real_prizes.join(", ") : "", demo_prizes: Array.isArray(ch.demo_prizes) ? ch.demo_prizes.join(", ") : "" });
        setSettingsSaved(false);
      }
    } catch {}
    setTabLoading(false);
  }, [selectedChallengeId, activeTab, isAuth]);

  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  // Fetch participant trades
  useEffect(() => {
    if (!selectedParticipant || !selectedChallengeId) { setSelectedParticipantTrades([]); return; }
    fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/user-trades?nickname=${encodeURIComponent(selectedParticipant.nickname)}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : { trades: [] })
      .then(d => setSelectedParticipantTrades(d.trades || []))
      .catch(() => setSelectedParticipantTrades([]));
  }, [selectedParticipant, selectedChallengeId]);

  const handleLogout = () => { localStorage.removeItem("host_token"); localStorage.removeItem("host_info"); window.location.href = "/host/login"; };

  // Action handlers
  const doAction = async (url: string, method = 'POST', body?: any) => {
    setActionLoading(true);
    try {
      const res = await fetch(url, { method, headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      setActionResult(data.success ? "Done" : (data.error || "Failed"));
    } catch { setActionResult("Network error"); }
    setActionLoading(false);
    setTimeout(() => setActionResult(""), 3000);
    fetchTabData();
  };

  const fmtTime = (d: string) => d ? new Date(d).toLocaleString("en-US", { timeZone: challengeTz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

  const handleSearch = async () => {
    if (!searchQuery.trim() || !selectedChallengeId) return;
    setSearchPerformed(true); setFoundUser(null);
    try {
      const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants?search=${encodeURIComponent(searchQuery.trim())}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) {
        const data = await res.json();
        const found = (data.participants || [])[0] || null;
        setFoundUser(found);
      }
    } catch {}
  };

  if (!isAuth || loading) return <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center"><Loader2 className="w-8 h-8 text-royal animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Header */}
      <header className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-3">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={32} height={32} className="rounded-lg" />
            <div>
              <p className="text-sm font-bold text-white">{hostInfo?.displayName || "Host"}</p>
              <p className="text-[10px] text-royal font-semibold tracking-wider">HOST DASHBOARD</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAccountSettings(!showAccountSettings)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${showAccountSettings ? 'text-royal bg-royal/10' : 'text-gray-400 hover:text-white'}`}><Settings size={14} /></button>
            <button onClick={handleLogout} className="px-3 py-2 text-gray-400 hover:text-loss rounded-lg text-xs"><LogOut size={14} /></button>
          </div>
        </div>
      </header>

      {showAccountSettings ? (
        <div className="container mx-auto px-4 py-6 max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Account Settings</h2>
            <button onClick={() => setShowAccountSettings(false)} className="text-xs text-gray-400 hover:text-white">Back</button>
          </div>
          <BrokerCredentialsSection />
        </div>
      ) : (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Challenge Selector */}
        {challenges.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative">
                <select value={selectedChallengeId || ""} onChange={e => setSelectedChallengeId(parseInt(e.target.value))} className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm font-medium outline-none">
                  {challenges.map(c => <option key={c.id} value={c.id} className="bg-[#0f1629]">{c.title} ({c.status})</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
              {selectedChallenge && <StatusBadge status={selectedChallenge.status} />}
            </div>
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); }} className="px-4 py-2 rounded-xl bg-royal/20 text-royal text-sm font-semibold border border-royal/30">+ New Challenge</button>
          </div>
        )}

        {challenges.length === 0 && (
          <div className="text-center py-24">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-300 text-lg font-semibold">No challenges yet</p>
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal text-white font-semibold text-sm">Create Challenge</button>
          </div>
        )}

        {/* Tabs */}
        {selectedChallengeId && (<>
          <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto scrollbar-hide">
            {[
              { key: "overview", label: "Overview" },
              { key: "participants", label: "Participants" },
              { key: "leaderboard", label: "Leaderboard" },
              { key: "violations", label: "Violations" },
              { key: "updates", label: "Updates" },
              ...(hostInfo?.hasBrokerIntegration ? [{ key: "screening", label: "Screening" }] : []),
              { key: "rules", label: "Rules" },
              { key: "settings", label: "Settings" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex-shrink-0 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-semibold transition-all ${activeTab === tab.key ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{tab.label}</button>
            ))}
          </div>

          {/* Action toast */}
          {actionResult && <div className="p-3 rounded-lg bg-profit/10 border border-profit/30 text-profit text-sm font-medium mb-4">{actionResult}</div>}

          {tabLoading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-royal animate-spin" /></div> : (<>

          {/* ===== OVERVIEW ===== */}
          {activeTab === "overview" && overview && (<>
            {/* Challenge Info Banner */}
            {overview.challenge && (
              <div className="glass rounded-2xl border border-white/10 p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white">{overview.challenge.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-semibold border ${overview.challenge.status === 'active' ? 'bg-profit/20 text-profit border-profit/30' : overview.challenge.status === 'registration_open' ? 'bg-gold/20 text-gold border-gold/30' : 'bg-white/10 text-gray-300 border-white/20'}`}>{overview.challenge.status?.replace('_', ' ')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-gray-500">Type</span><p className="text-white font-medium capitalize">{overview.challenge.type || "—"}</p></div>
                  <div><span className="text-gray-500">Balance</span><p className="text-white font-medium">${overview.challenge.starting_balance} &rarr; ${overview.challenge.target_balance}</p></div>
                  <div><span className="text-gray-500">Start</span><p className="text-white font-medium">{overview.challenge.start_date ? fmtTime(overview.challenge.start_date) : "—"}</p></div>
                  <div><span className="text-gray-500">End</span><p className="text-white font-medium">{overview.challenge.end_date ? fmtTime(overview.challenge.end_date) : "—"}</p></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <StatCard icon={<Users size={16} />} label="Participants" value={(overview.totalParticipants || 0).toLocaleString()} sub={`Demo: ${overview.demoParticipants || 0} | Real: ${overview.realParticipants || 0}`} color="text-royal" />
              <StatCard icon={<Activity size={16} />} label="Total Trades" value={(overview.totalTrades || 0).toLocaleString()} sub={`Demo: ${overview.demoTrades || 0} (${overview.demoVolume || 0} lots) | Real: ${overview.realTrades || 0} (${overview.realVolume || 0} lots)`} color="text-white" />
              <StatCard icon={<AlertTriangle size={16} />} label="Violations" value={String(overview.totalViolations || 0)} sub={`${overview.violationRate || 0}% violation rate`} color="text-loss" />
              <StatCard icon={<Trophy size={16} />} label="Above Target" value={String(overview.aboveTarget || 0)} sub={`${overview.totalParticipants > 0 ? ((overview.aboveTarget / overview.totalParticipants) * 100).toFixed(1) : 0}% qualified`} color="text-gold" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <StatCard icon={<Target size={16} />} label="Total Balance" value={`$${overview.realBalance || 0}`} sub={`Real: $${overview.realBalance || 0} | Demo: $${overview.demoBalance || 0}`} color="text-profit" />
              <StatCard icon={<Zap size={16} />} label="Updates Today" value={String(overview.pullsToday || 0)} sub={overview.nextPullTime ? `Next: ${overview.nextPullTime}` : ""} color="text-royal" />
              <StatCard icon={<Shield size={16} />} label="Update Success" value={String(overview.pullsSuccess || 0)} sub={`Failed: ${overview.pullsFailed || 0} | PW Changed: ${overview.passwordChanged || 0}`} color="text-profit" />
              <StatCard icon={<Clock size={16} />} label="Last Update" value={overview.lastPullTime || "—"} sub={`${overview.pullsSuccess || 0} ok · ${overview.pullsFailed || 0} failed`} color="text-gray-300" />
            </div>

            {/* Top Violations Breakdown */}
            <div className="glass rounded-2xl border border-white/10 p-5 mb-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Top Rule Violations</h3>
              <div className="space-y-3">
                {(!overview.topViolations || overview.topViolations.length === 0) ? <p className="text-sm text-gray-500">No violation data yet — will populate after updates begin</p> : overview.topViolations.map((v: any, i: number) => (
                  <div key={i}>
                    <button className="w-full text-left" onClick={() => setExpandedViolation(expandedViolation === v.rule ? null : v.rule)}>
                      <div className="flex justify-between mb-1"><span className="text-sm text-gray-300">{v.rule}</span><span className="text-xs text-gray-500">{v.count}</span></div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-loss/60 rounded-full" style={{ width: `${Math.min((v.count / Math.max(...overview.topViolations.map((x: any) => x.count), 1)) * 100, 100)}%` }} /></div>
                    </button>
                    {expandedViolation === v.rule && v.details && (
                      <div className="mt-2 ml-1 space-y-1 border-l-2 border-loss/30 pl-3">
                        {v.details.map((d: any, j: number) => (
                          <div key={j} className="flex gap-2 text-xs">
                            <span className="text-royal font-medium shrink-0">{d.nickname}</span>
                            <span className="text-gray-400 truncate">{d.detail?.replace(/\s*\(also open:.*\)/, '').replace(/\(full position\).*/, '').trim()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Trading Insights */}
            {overview.metrics && (
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-profit" /> Trading Insights</h3>
                {overview.metrics.challengeType === 'hybrid' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(['real', 'demo'] as const).map(cat => {
                      const m = overview.metrics[cat];
                      if (!m) return null;
                      const label = cat === 'real' ? 'Real Account' : 'Demo Account';
                      return (
                        <div key={cat} className="space-y-3">
                          <p className="text-xs font-bold text-gray-300 uppercase">{label}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {m.maxProfitTrade && <MetricCard title="Best Trade" value={`$${Number(m.maxProfitTrade.profit).toFixed(2)}`} sub={m.maxProfitTrade.symbol} user={m.maxProfitTrade.nickname} color="text-profit" />}
                            {m.maxLossTrade && <MetricCard title="Worst Trade" value={`$${Number(m.maxLossTrade.profit).toFixed(2)}`} sub={m.maxLossTrade.symbol} user={m.maxLossTrade.nickname} color="text-loss" />}
                            {m.bestOverallWinRate && <MetricCard title="Best Win Rate" value={`${m.bestOverallWinRate.winRate}%`} sub={`${m.bestOverallWinRate.trades} trades`} user={m.bestOverallWinRate.nickname} color="text-royal" />}
                            {m.mostTradedPair && <MetricCard title="Most Traded" value={m.mostTradedPair.symbol} sub={`${m.mostTradedPair.tradeCount} trades · ${m.mostTradedPair.totalLots?.toFixed(2) || 0} lots`} color="text-gold" />}
                            <MetricCard title="Blown" value={String(m.blownAccounts || 0)} sub="equity = 0" color="text-loss" />
                            <MetricCard title="Disqualified" value={String(m.disqualifiedAccounts || 0)} sub="rule violations" color="text-loss" />
                            <MetricCard title="Avg Trades/User" value={String(m.avgTradesPerUser || 0)} sub="active traders" color="text-white" />
                            {m.mostActiveDay && <MetricCard title="Most Active Day" value={new Date(m.mostActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.mostActiveDay.tradeCount} trades`} color="text-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const m = overview.metrics.combined || overview.metrics.real || overview.metrics.demo;
                    if (!m) return null;
                    return (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {m.maxProfitTrade && <MetricCard title="Best Trade" value={`$${Number(m.maxProfitTrade.profit).toFixed(2)}`} sub={m.maxProfitTrade.symbol} user={m.maxProfitTrade.nickname} color="text-profit" />}
                        {m.maxLossTrade && <MetricCard title="Worst Trade" value={`$${Number(m.maxLossTrade.profit).toFixed(2)}`} sub={m.maxLossTrade.symbol} user={m.maxLossTrade.nickname} color="text-loss" />}
                        {m.bestOverallWinRate && <MetricCard title="Best Win Rate" value={`$${m.bestOverallWinRate.winRate}%`} sub={`${m.bestOverallWinRate.trades} trades`} user={m.bestOverallWinRate.nickname} color="text-royal" />}
                        {m.mostTradedPair && <MetricCard title="Most Traded Pair" value={m.mostTradedPair.symbol} sub={`${m.mostTradedPair.tradeCount} trades · ${m.mostTradedPair.totalLots?.toFixed(2) || 0} lots`} color="text-gold" />}
                        <MetricCard title="Blown Accounts" value={String(m.blownAccounts || 0)} sub="equity hit zero" color="text-loss" />
                        <MetricCard title="Disqualified" value={String(m.disqualifiedAccounts || 0)} sub="rule violations" color="text-loss" />
                        {m.mostActiveDay && <MetricCard title="Most Active Day" value={new Date(m.mostActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.mostActiveDay.tradeCount} trades`} color="text-white" />}
                        <MetricCard title="Avg Trades/User" value={String(m.avgTradesPerUser || 0)} sub="among active traders" color="text-white" />
                      </div>
                    );
                  })()
                )}
              </div>
            )}
          </>)}

          {/* ===== PARTICIPANTS ===== */}
          {activeTab === "participants" && (
            <div className="space-y-6">
              {/* Search Bar */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-royal" /> Find User</h3>
                <div className="flex gap-3">
                  <input placeholder="Nickname, email, or account #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none placeholder-gray-500 focus:border-royal/50" />
                  <button onClick={handleSearch} className="px-5 py-2 bg-gradient-to-r from-royal to-purple-600 hover:opacity-90 text-white rounded-xl font-semibold text-sm">Search</button>
                </div>
              </div>

              {searchPerformed && !foundUser && (
                <div className="glass rounded-2xl border border-white/10 p-8 text-center"><Users className="w-12 h-12 text-gray-600 mx-auto mb-3" /><p className="text-gray-400">No user found for &quot;{searchQuery}&quot;</p></div>
              )}

              {foundUser && (
                <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                  <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-1"><p className="text-xl font-bold text-white">{foundUser.nickname}</p><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${foundUser.accountType === "real" ? "bg-gold/20 text-gold" : "bg-royal/20 text-royal"}`}>{foundUser.accountType}</span>{foundUser.disqualified ? <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-loss/20 text-loss">DQ</span> : <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-profit/20 text-profit">Rank #{foundUser.rank || "—"}</span>}</div>
                      <p className="text-sm text-gray-400">{foundUser.email || ""}</p>
                    </div>
                    <button onClick={() => { setFoundUser(null); setSearchPerformed(false); setSearchQuery(""); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
                  </div>
                  <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Balance</p><p className="text-lg font-bold text-white">${Number(foundUser.balance || 0).toFixed(2)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Qualified Profit</p><p className="text-lg font-bold text-profit">${Number(foundUser.qualifiedProfit || 0).toFixed(2)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Profit Removed</p><p className="text-lg font-bold text-loss">${Number(foundUser.profitRemoved || 0).toFixed(2)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Win Rate</p><p className="text-lg font-bold text-white">{foundUser.winRate || "N/A"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{foundUser.totalTrades || 0}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${(foundUser.flaggedTrades || 0) > 0 ? "text-loss" : "text-profit"}`}>{foundUser.flaggedTrades || 0}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Active Days</p><p className="text-lg font-bold text-white">{foundUser.activeDays || 0}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Account #</p><p className="text-sm font-semibold text-white">{foundUser.accountNumber}</p></div>
                  </div>
                  <div className="p-5 border-t border-white/10 space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Actions</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={async () => { if (!foundUser.id) return; try { const r = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, { method: "POST", headers: headers(), body: JSON.stringify({ registrationId: foundUser.id }) }); const d = await r.json(); alert(d.success ? "Re-evaluation complete" : (d.error || "Failed")); } catch { alert("Error"); } }} className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-all">Re-evaluate</button>
                      {!foundUser.disqualified && <button onClick={() => setActionModal({ type: 'disqualify', participant: foundUser })} className="px-3 py-2 rounded-lg bg-loss/10 border border-loss/30 text-loss text-xs font-semibold hover:bg-loss/20 transition-all">Disqualify</button>}
                      <button onClick={() => setActionModal({ type: 'unverify', participant: foundUser })} className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 text-xs font-semibold hover:bg-gray-500/20 transition-all">Remove</button>
                    </div>
                  </div>
                </div>
              )}

              {!foundUser && !searchPerformed && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Total</p><p className="text-2xl font-bold text-white">{overview?.totalParticipants || participants.length}</p></div>
                  <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Demo</p><p className="text-2xl font-bold text-royal">{overview?.demoParticipants || 0}</p></div>
                  <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Real</p><p className="text-2xl font-bold text-gold">{overview?.realParticipants || 0}</p></div>
                  <div className="glass rounded-xl p-4 border border-white/10 text-center"><p className="text-[10px] text-gray-500">Qualified</p><p className="text-2xl font-bold text-profit">{overview?.aboveTarget || 0}</p></div>
                </div>
              )}

              {/* Paginated Participants List */}
              {!searchPerformed && (
                <div className="glass rounded-2xl border border-white/10 overflow-hidden">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-semibold text-white">All Participants</p>
                    <div className="flex items-center gap-2">
                      <select value={participantFilter} onChange={(e) => { setParticipantFilter(e.target.value); setParticipantsPage(1); }} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-royal/50">
                        <option value="all">All</option>
                        <option value="demo">Demo</option>
                        <option value="real">Real</option>
                        <option value="disqualified">Disqualified</option>
                        <option value="password_changed">Password Changed</option>
                      </select>
                      {participantsPagination && <p className="text-xs text-gray-500">Page {participantsPagination.page || 1}/{participantsPagination.totalPages || 1} ({participantsPagination.total})</p>}
                    </div>
                  </div>
                  {participants.length === 0 ? (
                    <div className="p-8 text-center"><p className="text-gray-400 text-sm">No participants yet</p></div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px]">
                        <thead><tr className="border-b border-white/5">
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">#</th>
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Nickname</th>
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Email</th>
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Account</th>
                          <th className="text-left py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Type</th>
                          <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Balance</th>
                          <th className="text-right py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Profit</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Trades</th>
                          <th className="text-center py-2 px-3 text-[10px] text-gray-400 font-medium uppercase">Actions</th>
                        </tr></thead>
                        <tbody>{participants.filter(p => {
                          if (participantFilter === 'all') return true;
                          if (participantFilter === 'demo') return p.accountType === 'demo';
                          if (participantFilter === 'real') return p.accountType === 'real';
                          if (participantFilter === 'disqualified') return p.disqualified;
                          if (participantFilter === 'password_changed') return p.pullStatus === 'password_changed';
                          return true;
                        }).map((p) => (
                          <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${p.disqualified ? "opacity-50 bg-loss/5" : ""}`} onClick={() => setSelectedParticipant(p)}>
                            <td className="py-2 px-3 text-xs text-gray-500">{p.rank || "—"}</td>
                            <td className="py-2 px-3 text-sm text-white font-medium">{p.nickname || "—"}</td>
                            <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate">{p.email || "—"}</td>
                            <td className="py-2 px-3 text-xs text-gray-300">{p.accountNumber}</td>
                            <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{p.accountType}</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-sm text-white font-medium">{p.lastKnownBalance ? `$${parseFloat(p.lastKnownBalance).toFixed(2)}` : "—"}</span></td>
                            <td className={`py-2 px-3 text-right text-sm font-medium ${(p.qualifiedProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>{p.qualifiedProfit != null ? `$${Number(p.qualifiedProfit).toFixed(2)}` : "—"}</td>
                            <td className="py-2 px-3 text-center text-xs text-gray-400">{p.totalTrades || 0}</td>
                            <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                {!p.disqualified && <button onClick={() => setActionModal({ type: 'disqualify', participant: p })} title="Disqualify" className="p-1.5 rounded-lg hover:bg-loss/20 text-gray-400 hover:text-loss transition-all"><Ban size={14} /></button>}
                                <button onClick={() => setActionModal({ type: 'unverify', participant: p })} title="Remove Registration" className="p-1.5 rounded-lg hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 transition-all"><UserMinus size={14} /></button>
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
                      <button onClick={() => setParticipantsPage(Math.max(1, participantsPage - 1))} disabled={participantsPage <= 1} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">&larr; Previous</button>
                      <span className="text-xs text-gray-500">Page {participantsPagination.page || participantsPage} of {participantsPagination.totalPages}</span>
                      <button onClick={() => setParticipantsPage(Math.min(participantsPagination.totalPages, participantsPage + 1))} disabled={participantsPage >= participantsPagination.totalPages} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Next &rarr;</button>
                    </div>
                  )}
                </div>
              )}

              {/* Action Modal */}
              {actionModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActionModal(null)}>
                  <div className="glass rounded-2xl max-w-md w-full border border-white/10 p-6" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-bold text-white mb-1">{actionModal.type === 'unverify' ? 'Remove Registration' : 'Disqualify Participant'}</h3>
                    <p className="text-sm text-gray-400 mb-4">To: <span className="text-white font-medium">{actionModal.participant.nickname || actionModal.participant.accountNumber}</span></p>
                    <textarea value={actionMessage} onChange={(e) => setActionMessage(e.target.value)} placeholder="Enter reason..." className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-royal/50 resize-none h-24 mb-4" />
                    <div className="flex gap-3">
                      <button onClick={() => { setActionModal(null); setActionMessage(""); }} className="flex-1 py-2.5 rounded-xl bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all">Cancel</button>
                      <button onClick={async () => {
                        if (!actionMessage.trim()) return;
                        const endpoint = actionModal.type === 'unverify' ? 'unverify' : 'disqualify';
                        const body: any = { registrationId: actionModal.participant.id };
                        if (actionModal.type === 'disqualify') body.reason = actionMessage;
                        await doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/${endpoint}`, 'POST', body);
                        setActionModal(null); setActionMessage("");
                      }} disabled={!actionMessage.trim() || actionLoading} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${actionModal.type === 'unverify' ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-loss/20 text-loss hover:bg-loss/30'}`}>{actionLoading ? 'Processing...' : actionModal.type === 'unverify' ? 'Remove' : 'Disqualify'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== LEADERBOARD ===== */}
          {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Trophy size={16} className="text-gold" /> Leaderboard</h3>
                <div className="flex items-center gap-2">
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
                    <th className="text-center py-3 px-1 text-[10px] text-gray-400 uppercase w-8">&Delta;</th>
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Nickname</th>
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Account</th>
                    <th className="text-left py-3 px-4 text-[10px] text-gray-400 uppercase">Type</th>
                    <th className="text-right py-3 px-4 text-[10px] text-gray-400 uppercase">Balance / Gross</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Trades</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Pass%</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Profit</th>
                    <th className="text-center py-3 px-4 text-[10px] text-gray-400 uppercase">Violations</th>
                  </tr></thead>
                  <tbody>{leaderboard.length === 0 ? <tr><td colSpan={10} className="py-8 text-center text-gray-500">No leaderboard data yet — will populate after updates and evaluation</td></tr> : leaderboard.filter((e: any) => leaderboardCategory === 'all' || e.accountType === leaderboardCategory).map((e: any) => {
                    const isWinner = !e.isDisqualified && !e.isWithdrawn && !e.isBlown && e.rank && e.rank <= (e.accountType === 'demo' ? parseInt(selectedChallenge?.demo_winners_count || 3) : parseInt(selectedChallenge?.real_winners_count || 3));
                    return (
                    <tr key={e.rank || e.nickname} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${e.isDisqualified ? "opacity-50 bg-loss/10" : (e.isWithdrawn || e.isBlown) ? "opacity-40 bg-loss/5" : isWinner ? "bg-profit/15" : ""}`} onClick={() => setSelectedParticipant(e)}>
                      <td className="py-3 px-4"><span className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : isWinner ? "text-profit" : e.rank && e.rank <= 3 ? "text-gold" : "text-gray-400"}`}>{e.isDisqualified ? <span className="text-[10px]">DQ</span> : isWinner ? "\u{1F3C6}" : (e.rank || "—")}</span></td>
                      <td className="py-3 px-2 text-center w-10">{e.rankChange > 0 ? <span className="text-[10px] text-profit font-semibold px-1.5 py-0.5 rounded bg-profit/10">&blacktriangle;{e.rankChange}</span> : e.rankChange < 0 ? <span className="text-[10px] text-loss font-semibold px-1.5 py-0.5 rounded bg-loss/10">&blacktriangledown;{Math.abs(e.rankChange)}</span> : <span className="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-white/5">&mdash;</span>}</td>
                      <td className="py-3 px-4"><p className={`text-sm font-semibold ${isWinner ? "text-profit font-bold" : "text-white"}`}>{e.nickname}{e.isDisqualified ? <span className="ml-2 text-[10px] text-loss">DQ</span> : e.isWithdrawn ? <span className="ml-2 text-[10px] text-gray-400">Exited</span> : e.isBlown ? <span className="ml-2 text-[10px] text-amber-400">Blown</span> : ""}</p><p className="text-[10px] text-gray-500 mt-0.5">{e.email || ""}</p></td>
                      <td className="py-3 px-4"><p className="text-xs text-gray-300 font-mono">{e.accountNumber || "—"}</p></td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-[10px] font-semibold ${e.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{e.accountType}</span></td>
                      <td className="py-3 px-4 text-right">
                        <p className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : e.isWithdrawn ? "text-gray-500" : isWinner ? "text-profit" : "text-white"}`}>{e.isDisqualified ? "DQ" : e.isWithdrawn ? "Exited" : e.growthPercent > 0 ? `+${e.growthPercent.toFixed(1)}%` : `$${Number(e.adjustedBalance || 0).toFixed(2)}`}</p>
                        {!e.isDisqualified && !e.isWithdrawn && <p className="text-[10px] text-gray-500 mt-0.5">${Number(e.currentBalance || e.adjustedBalance || 0).toFixed(2)}</p>}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-gray-400">{e.totalTrades || 0}</td>
                      <td className="py-3 px-4 text-center text-sm text-gray-400">{(e.totalTrades || 0) > 0 ? `${Math.round(((e.qualifiedTrades || 0) / e.totalTrades) * 100)}%` : "—"}</td>
                      <td className="py-3 px-4 text-center text-sm text-royal">{(e.totalTrades || 0) > 0 ? `$${Number(e.qualifiedProfit || 0).toFixed(2)}` : "—"}</td>
                      <td className="py-3 px-4 text-center"><span className={(e.flaggedTrades || 0) > 0 ? "text-loss font-bold" : "text-gray-500"}>{e.flaggedTrades || 0}</span></td>
                    </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== VIOLATIONS ===== */}
          {activeTab === "violations" && (
            <div className="space-y-4">
              <div className="glass rounded-2xl border border-loss/20 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Participants with Violations</h3>
                {violations.length === 0 ? (
                  <p className="text-sm text-gray-500">No violations detected yet.</p>
                ) : (
                <div className="space-y-3">
                  {violations.map((p: any, i: number) => (
                    <details key={i} className="group">
                      <summary className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:border-loss/30 transition-all cursor-pointer list-none">
                        <div>
                          <p className="text-white font-semibold">{p.nickname}</p>
                          <p className="text-xs text-gray-500">Acct: {p.account || p.accountNumber || "—"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-loss font-bold">{p.violation_count || p.violations} flags</p>
                          <p className="text-xs text-gray-500">${parseFloat(p.profit_removed || p.profitRemoved || 0).toFixed(2)} removed</p>
                        </div>
                      </summary>
                      <div className="mt-2 ml-4 space-y-2">
                        {(p.flagged_trades || p.flaggedTrades || []).map((t: any, j: number) => {
                          const tradeViolations = typeof t.violations === 'string' ? JSON.parse(t.violations) : (t.violations || []);
                          return (
                            <div key={j} className="p-3 bg-loss/5 rounded-lg border border-loss/10">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs text-white font-medium">{t.symbol} #{t.ticket}</span>
                                <span className={`text-xs font-bold ${parseFloat(t.profit) >= 0 ? 'text-profit' : 'text-loss'}`}>${parseFloat(t.profit || 0).toFixed(2)}</span>
                              </div>
                              {tradeViolations.map((v: string, k: number) => (
                                <p key={k} className="text-[10px] text-loss">&#9888;&#65039; {v}</p>
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

          {/* ===== UPDATES ===== */}
          {activeTab === "updates" && (
            <div className="space-y-4">
              {/* Action buttons */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><RefreshCw size={16} className="text-royal" /> Update Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update`)} disabled={actionLoading} className="px-4 py-2.5 rounded-lg bg-royal/20 text-royal text-xs font-semibold border border-royal/30 hover:bg-royal/30 disabled:opacity-50 transition-all">Full Update + Evaluate + Rank</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update-rank`)} disabled={actionLoading} className="px-4 py-2.5 rounded-lg bg-profit/20 text-profit text-xs font-semibold border border-profit/30 hover:bg-profit/30 disabled:opacity-50 transition-all">Update Non-DQ Only</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, 'POST', {})} disabled={actionLoading} className="px-4 py-2.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-semibold border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50 transition-all">Re-evaluate All</button>
                  {failedAccounts?.credentialFailures?.length > 0 && (
                    <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`)} disabled={actionLoading} className="px-4 py-2.5 rounded-lg bg-gold/20 text-gold text-xs font-semibold border border-gold/30 hover:bg-gold/30 disabled:opacity-50 transition-all">Retry All Credentials ({failedAccounts.credentialFailures.length})</button>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 mt-3">Updates run automatically 6x/day. Use these for manual triggers between scheduled runs.</p>
              </div>

              {/* Credential Failures */}
              {failedAccounts?.credentialFailures?.length > 0 && (
                <div className="glass rounded-2xl border border-loss/20 p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Key size={16} className="text-loss" /> Credential Failures ({failedAccounts.credentialFailures.length})</h3>
                  <div className="space-y-2">
                    {failedAccounts.credentialFailures.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-loss/5 border border-loss/10">
                        <div>
                          <p className="text-sm text-white font-medium">{f.nickname}</p>
                          <p className="text-[10px] text-gray-500">{f.account_number} &bull; {f.mt5_server}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`, 'POST', { registrationId: f.id })} className="text-[10px] text-gold font-semibold px-2.5 py-1.5 rounded-lg bg-gold/10 border border-gold/20 hover:bg-gold/20 transition-all">Retry</button>
                          <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, 'POST', { registrationId: f.id })} className="text-[10px] text-royal font-semibold px-2.5 py-1.5 rounded-lg bg-royal/10 border border-royal/20 hover:bg-royal/20 transition-all">Re-evaluate</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Update History */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Update History</h3>
                  <span className="text-[10px] text-gray-500">{pullHistory.length} total</span>
                </div>
                {pullHistory.length === 0 ? <p className="text-gray-500 text-sm text-center py-6">No updates yet</p> : (
                  <div className="space-y-2">
                    {pullHistory.map((b: any, i: number) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${b.status === 'completed' ? 'bg-profit' : b.status === 'running' ? 'bg-gold animate-pulse' : 'bg-loss'}`} />
                          <div>
                            <p className="text-sm text-white font-medium">Update #{pullHistory.length - i}</p>
                            <p className="text-[10px] text-gray-500">{fmtTime(b.started_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-profit font-semibold">{b.successful} ok</span>
                          {b.failed > 0 && <span className="text-loss font-semibold">{b.failed} failed</span>}
                          <span className="text-gray-500">{b.total_accounts} accounts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== SCREENING ===== */}
          {activeTab === "screening" && <ScreeningTab challengeId={selectedChallengeId!} getToken={getToken} />}

          {/* ===== RULES ===== */}
          {activeTab === "rules" && (
            <div className="glass rounded-2xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><FileText size={16} className="text-royal" /> Challenge Rules Configuration</h3>
                {rulesLocked && <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400"><Shield size={12} /> Locked &mdash; challenge is {selectedChallenge?.status}</span>}
              </div>
              <p className="text-xs text-gray-500 mb-6">{rulesLocked ? "Rules are read-only once a challenge is active." : "Set the rules for this challenge. Leave fields empty for unlimited."}</p>

              {rulesLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-royal animate-spin" /></div>
              ) : rulesConfig && (
              <div className={rulesLocked ? "opacity-60 pointer-events-none select-none" : ""}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Max Lot Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Max Lot Size</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Limits the maximum lot size per position. Trades exceeding this have profits removed.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, max_lot_size: !rulesConfig.rules_enabled?.max_lot_size}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.max_lot_size ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.max_lot_size ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" step="0.01" placeholder="e.g., 0.02 (empty = unlimited)" value={rulesConfig.max_lot_size || ""} onChange={e => setRulesConfig({...rulesConfig, max_lot_size: e.target.value ? parseFloat(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.max_lot_size} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.max_lot_size ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Trades exceeding this lot size will have profits removed</p>
                  </div>

                  {/* Max Open Trades */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Max Open Trades</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Limits how many trades can be open simultaneously. All overlapping trades get flagged.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, max_open_trades: !rulesConfig.rules_enabled?.max_open_trades}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.max_open_trades ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.max_open_trades ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 3 (empty = unlimited)" value={rulesConfig.max_open_trades || ""} onChange={e => setRulesConfig({...rulesConfig, max_open_trades: e.target.value ? parseInt(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.max_open_trades} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.max_open_trades ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Maximum trades open at the same time</p>
                  </div>

                  {/* Pair Limit */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Pair Limit (Simultaneous)</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Limits how many trades on the same currency pair can be open at once.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, pair_limit: !rulesConfig.rules_enabled?.pair_limit}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.pair_limit ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.pair_limit ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 2 (empty = unlimited)" value={rulesConfig.pair_limit || ""} onChange={e => setRulesConfig({...rulesConfig, pair_limit: e.target.value ? parseInt(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.pair_limit} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.pair_limit ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Max same-pair trades open at the same time</p>
                  </div>

                  {/* Max Risk per Trade */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Max Risk per Trade</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Maximum risk per trade measured by SL distance. Fixed = same $ for all. Percentage = calculated from account balance at trade open time.</div></div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, max_risk_mode: 'fixed'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${rulesConfig.max_risk_mode !== 'percentage' ? 'bg-royal/30 text-royal border border-royal/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>Fixed $</button>
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, max_risk_mode: 'percentage'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${rulesConfig.max_risk_mode === 'percentage' ? 'bg-gold/30 text-gold border border-gold/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>% Balance</button>
                      </div>
                    </div>
                    {rulesConfig.max_risk_mode === 'percentage' ? (
                      <input type="number" step="1" placeholder="e.g., 10 (% of balance)" value={rulesConfig.max_risk_percent || ""} onChange={e => setRulesConfig({...rulesConfig, max_risk_percent: e.target.value ? parseFloat(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.stop_loss_required} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.stop_loss_required ? "opacity-40" : ""}`} />
                    ) : (
                      <input type="number" step="0.5" placeholder="e.g., 5 (empty = no limit)" value={rulesConfig.max_risk_dollars || ""} onChange={e => setRulesConfig({...rulesConfig, max_risk_dollars: e.target.value ? parseFloat(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.stop_loss_required} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.stop_loss_required ? "opacity-40" : ""}`} />
                    )}
                    <p className="text-[10px] text-gray-500">{rulesConfig.max_risk_mode === 'percentage' ? '% of account balance at trade open time' : 'Fixed $ max SL distance (controlled by SL Required toggle)'}</p>
                  </div>

                  {/* Daily Loss Cap */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Daily Loss Cap</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Maximum drawdown from day&apos;s opening balance. Fixed = same $ every day. Percentage = scales with account.</div></div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, daily_loss_cap: !rulesConfig.rules_enabled?.daily_loss_cap}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.daily_loss_cap ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.daily_loss_cap ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, daily_loss_mode: 'fixed'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${rulesConfig.daily_loss_mode !== 'percentage' ? 'bg-royal/30 text-royal border border-royal/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>Fixed $</button>
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, daily_loss_mode: 'percentage'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${rulesConfig.daily_loss_mode === 'percentage' ? 'bg-gold/30 text-gold border border-gold/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>% Balance</button>
                      </div>
                    </div>
                    {rulesConfig.daily_loss_mode === 'percentage' ? (
                      <input type="number" step="1" placeholder="e.g., 20 (% of day balance)" value={rulesConfig.daily_loss_percent || ""} onChange={e => setRulesConfig({...rulesConfig, daily_loss_percent: e.target.value ? parseFloat(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.daily_loss_cap} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.daily_loss_cap ? "opacity-40" : ""}`} />
                    ) : (
                      <input type="number" step="1" placeholder="e.g., 10 (empty = no cap)" value={rulesConfig.daily_loss_cap || ""} onChange={e => setRulesConfig({...rulesConfig, daily_loss_cap: e.target.value ? parseFloat(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.daily_loss_cap} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.daily_loss_cap ? "opacity-40" : ""}`} />
                    )}
                    <p className="text-[10px] text-gray-500">{rulesConfig.daily_loss_mode === 'percentage' ? "% of day's opening balance — scales as account grows" : "Fixed $ drawdown from day's opening balance"}</p>
                  </div>

                  {/* Max Trade Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Max Trade Duration (hours)</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Maximum time a trade can be held open. Trades exceeding this are flagged and profits removed.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, max_hold_hours: !rulesConfig.rules_enabled?.max_hold_hours}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.max_hold_hours ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.max_hold_hours ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 24 (empty = unlimited)" value={rulesConfig.max_hold_hours || ""} onChange={e => setRulesConfig({...rulesConfig, max_hold_hours: e.target.value ? parseInt(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.max_hold_hours} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.max_hold_hours ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Trades held longer will have profits removed</p>
                  </div>

                  {/* Min Trade Duration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Min Trade Duration (minutes)</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Minimum time a trade must be held. Prevents ultra-short scalping or bot-like behavior.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, min_trade_duration: !rulesConfig.rules_enabled?.min_trade_duration}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.min_trade_duration ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.min_trade_duration ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 2 (empty = no minimum)" value={rulesConfig.min_trade_duration_minutes || ""} onChange={e => setRulesConfig({...rulesConfig, min_trade_duration_minutes: e.target.value ? parseInt(e.target.value) : null})} disabled={rulesLocked || !rulesConfig.rules_enabled?.min_trade_duration} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.min_trade_duration ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Trades closed faster than this will have profits removed</p>
                  </div>

                  {/* Min Active Trading Days */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Min Active Trading Days</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Minimum number of distinct days the participant must trade to qualify for prizes.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, min_active_days: !rulesConfig.rules_enabled?.min_active_days}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.min_active_days ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.min_active_days ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 7" value={rulesConfig.min_active_days || ""} onChange={e => setRulesConfig({...rulesConfig, min_active_days: e.target.value ? parseInt(e.target.value) : 0})} disabled={rulesLocked || !rulesConfig.rules_enabled?.min_active_days} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.min_active_days ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Minimum days user must trade to qualify for prizes</p>
                  </div>

                  {/* Min Total Trades */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-300">Min Total Trades</label>
                        <div className="relative group"><span className="cursor-help text-gray-500 hover:text-royal transition-colors">&#9432;</span><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-xs text-gray-300 w-56 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">Minimum total closed trades to qualify. At challenge end, users who haven&apos;t met this are DQ&apos;d.</div></div>
                      </div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, min_total_trades: !rulesConfig.rules_enabled?.min_total_trades}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.min_total_trades ? "bg-profit" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.min_total_trades ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                    </div>
                    <input type="number" placeholder="e.g., 10 (empty = no minimum)" value={rulesConfig.min_total_trades || ""} onChange={e => setRulesConfig({...rulesConfig, min_total_trades: e.target.value ? parseInt(e.target.value) : null})} disabled={rulesLocked || !rulesConfig.rules_enabled?.min_total_trades} className={`w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none ${!rulesConfig.rules_enabled?.min_total_trades ? "opacity-40" : ""}`} />
                    <p className="text-[10px] text-gray-500">Users with fewer trades will be DQ&apos;d at challenge end</p>
                  </div>

                  {/* Toggles */}
                  <div className="space-y-4 md:col-span-2">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex items-center gap-2">
                        <div><p className="text-sm text-white font-medium">Stop Loss Required</p><p className="text-[10px] text-gray-500">All trades must have SL within risk limit</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, stop_loss_required: !rulesConfig.rules_enabled?.stop_loss_required}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.stop_loss_required ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.stop_loss_required ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                        <button onClick={() => !rulesLocked && rulesConfig.rules_enabled?.stop_loss_required && setRulesConfig({...rulesConfig, stop_loss_required: !rulesConfig.stop_loss_required})} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.stop_loss_required && rulesConfig.rules_enabled?.stop_loss_required ? "bg-profit" : "bg-white/20"} ${!rulesConfig.rules_enabled?.stop_loss_required ? "opacity-40" : ""}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.stop_loss_required && rulesConfig.rules_enabled?.stop_loss_required ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                      <div><p className="text-sm text-white font-medium">Weekend Trading</p><p className="text-[10px] text-gray-500">Allow trading on weekends (crypto pairs)</p></div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, weekend_trading: !rulesConfig.rules_enabled?.weekend_trading}})} className={`w-10 h-5 rounded-full transition-all ${rulesConfig.rules_enabled?.weekend_trading ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.weekend_trading ? "translate-x-5" : "translate-x-0.5"}`}></div></button>
                        <button onClick={() => !rulesLocked && rulesConfig.rules_enabled?.weekend_trading && setRulesConfig({...rulesConfig, weekend_trading: !rulesConfig.weekend_trading})} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.weekend_trading && rulesConfig.rules_enabled?.weekend_trading ? "bg-profit" : "bg-white/20"} ${!rulesConfig.rules_enabled?.weekend_trading ? "opacity-40" : ""}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.weekend_trading && rulesConfig.rules_enabled?.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                      <div><p className="text-sm text-white font-medium">Only Cent Account</p><p className="text-[10px] text-gray-500">Real category requires cent accounts only</p></div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, only_cent_account: !rulesConfig.only_cent_account})} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.only_cent_account ? "bg-profit" : "bg-white/20"}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.only_cent_account ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                    </div>
                  </div>
                </div>

                {/* Fixed rules info */}
                <div className="mt-6 p-4 bg-royal/10 border border-royal/20 rounded-xl">
                  <p className="text-xs text-gray-300 font-semibold mb-2">Always enforced (shown to users):</p>
                  <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                    <li>No recharging (additional deposits) during the challenge</li>
                    <li>Unlimited trades per day &mdash; as long as all rules are followed</li>
                    <li>No leverage limit</li>
                    <li>Trades against rules have profits disqualified (losses still count)</li>
                  </ul>
                </div>
              </div>
              )}

              {/* Save */}
              {!rulesLocked && rulesConfig && (
                <div className="mt-6 flex justify-end">
                  <button onClick={async () => {
                    setRulesSaving(true);
                    try {
                      const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, { method: "PUT", headers: headers(), body: JSON.stringify(rulesConfig) });
                      if (res.ok) { setRulesSaved(true); setTimeout(() => setRulesSaved(false), 3000); }
                      else { const d = await res.json(); alert(d.error || "Failed to save rules"); }
                    } catch { alert("Connection error"); }
                    setRulesSaving(false);
                  }} disabled={rulesSaving} className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all ${rulesSaved ? "bg-profit/20 text-profit border border-profit/30" : "bg-gradient-to-r from-royal to-purple-600 hover:opacity-90 text-white shadow-lg shadow-royal/20"}`}>{rulesSaving ? "Saving..." : rulesSaved ? "&#10003; Rules Saved" : "Save Rules"}</button>
                </div>
              )}
            </div>
          )}

          {/* ===== SETTINGS ===== */}
          {activeTab === "settings" && (
            <div className="container mx-auto max-w-3xl relative">
              <div className="glass rounded-2xl border border-white/10 p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Challenge Settings</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${selectedChallenge?.status === "active" ? "bg-profit/20 text-profit border-profit/30" : "bg-white/10 text-gray-300 border-white/20"}`}>{selectedChallenge?.status || "—"}</span>
                </div>

                {settingsSaved && <div className="p-3 rounded-xl text-sm font-semibold bg-profit/10 text-profit border border-profit/30">&#10003; Saved successfully</div>}

                {/* Edit Fields */}
                <div className="space-y-4">
                  <div><label className="text-xs text-gray-400 font-medium mb-1 block">Title</label><input value={settingsForm.title || ""} onChange={e => setSettingsForm((p: any) => ({...p, title: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Start (EAT)</label><input type="datetime-local" value={settingsForm.start_date || ""} onChange={e => setSettingsForm((p: any) => ({...p, start_date: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">End (EAT)</label><input type="datetime-local" value={settingsForm.end_date || ""} onChange={e => setSettingsForm((p: any) => ({...p, end_date: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  </div>
                  {selectedChallenge?.deposit_mode === 'fixed' || !selectedChallenge?.deposit_mode ? (
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Balance ($)</label><input value={settingsForm.target_balance || ""} onChange={e => setSettingsForm((p: any) => ({...p, target_balance: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  ) : (
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Growth (%)</label><input value={settingsForm.target_percent || ""} onChange={e => setSettingsForm((p: any) => ({...p, target_percent: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  )}
                  <button onClick={async () => {
                    setSettingsSaving(true);
                    const payload: any = {};
                    if (settingsForm.title) payload.title = settingsForm.title;
                    if (settingsForm.end_date) payload.end_date = settingsForm.end_date;
                    if (settingsForm.start_date) payload.start_date = settingsForm.start_date;
                    if (settingsForm.target_balance) payload.target_balance = parseFloat(settingsForm.target_balance);
                    if (settingsForm.target_percent) payload.target_percent = parseFloat(settingsForm.target_percent);
                    await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/settings`, { method: "PUT", headers: headers(), body: JSON.stringify(payload) });
                    setSettingsSaved(true); setSettingsSaving(false);
                    setTimeout(() => setSettingsSaved(false), 3000);
                  }} disabled={settingsSaving} className="w-full py-3 rounded-xl bg-gradient-to-r from-royal to-purple-600 text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50">{settingsSaving ? "Saving..." : "Save Changes"}</button>
                </div>

                {/* Status Actions */}
                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wider">Status Actions</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button onClick={() => { if(confirm('Open registration?')) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/direct-status`, 'PATCH', { status: 'registration_open' }); }} disabled={selectedChallenge?.status === 'registration_open' || actionLoading} className="p-2.5 rounded-lg bg-profit/10 border border-profit/30 text-profit text-xs font-semibold hover:bg-profit/20 transition-all disabled:opacity-30">Open Reg</button>
                    <button onClick={() => { if(confirm('Start challenge?')) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/direct-status`, 'PATCH', { status: 'active' }); }} disabled={selectedChallenge?.status === 'active' || actionLoading} className="p-2.5 rounded-lg bg-gradient-to-r from-royal/20 to-purple-600/20 border border-royal/30 text-royal text-xs font-semibold hover:from-royal/30 hover:to-purple-600/30 transition-all disabled:opacity-30">Start</button>
                    <button onClick={() => { if(confirm('End challenge for review?')) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/direct-status`, 'PATCH', { status: 'reviewing' }); }} disabled={selectedChallenge?.status === 'reviewing' || actionLoading} className="p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/20 transition-all disabled:opacity-30">End &rarr; Review</button>
                    <button onClick={() => { if(confirm('Mark as completed?')) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/direct-status`, 'PATCH', { status: 'completed' }); }} disabled={selectedChallenge?.status === 'completed' || actionLoading} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all disabled:opacity-30">Completed</button>
                  </div>
                </div>

                {/* Exports */}
                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wider">Exports</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/export-registrations`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const csv = "nickname,email,category,account_number,server,investor_password\n" + (data.registrations || []).map((r: any) => `${r.nickname},${r.email||''},${r.account_type},${r.account_number},${r.mt5_server},${r.investor_password}`).join("\n");
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(settingsForm.title || 'challenge').replace(/\s+/g, '_')}_registrations.csv`; a.click();
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">&#128229; Registrations CSV</button>
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const rows = (data.leaderboard || []).map((e: any) => `${e.rank},${e.nickname},${e.accountNumber},${e.accountType},${e.adjustedBalance},${e.totalTrades},${e.flaggedTrades},${e.qualifiedProfit}`);
                        const csv = "rank,nickname,account,type,balance,trades,flagged,profit\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(settingsForm.title || 'challenge').replace(/\s+/g, '_')}_leaderboard.csv`; a.click();
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">&#128202; Leaderboard CSV</button>
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/violations`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const rows = (data.violations || []).flatMap((v: any) => (v.flagged_trades || []).map((t: any) => `${v.nickname},${t.symbol},${t.ticket},"${(t.violations || []).join('; ')}",${t.profit}`));
                        const csv = "nickname,symbol,ticket,violations,profit\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(settingsForm.title || 'challenge').replace(/\s+/g, '_')}_violations.csv`; a.click();
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">&#128203; Violations CSV</button>
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const rows = (data.participants || []).map((p: any) => `${p.rank||''},${p.nickname},${p.email||''},${p.accountNumber},${p.accountType},${p.lastKnownBalance||''},${p.qualifiedProfit||''},${p.totalTrades||0},${p.disqualified?'DQ':'Active'}`);
                        const csv = "rank,nickname,email,account,type,balance,profit,trades,status\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(settingsForm.title || 'challenge').replace(/\s+/g, '_')}_full_report.csv`; a.click();
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">&#128203; Full Report CSV</button>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="border-t border-loss/20 pt-5">
                  <p className="text-xs text-loss font-semibold mb-3 uppercase tracking-wider">Danger Zone</p>
                  <button onClick={() => { if(confirm("Delete this challenge? This cannot be undone.")) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}`, 'DELETE'); }} className="px-4 py-2.5 rounded-lg bg-loss/10 text-loss text-xs font-semibold border border-loss/20 hover:bg-loss/20 transition-all" disabled={actionLoading}>Delete Challenge</button>
                </div>
              </div>
            </div>
          )}

          </>)}
        </>)}
      </div>
      )}

      {/* Participant Detail Modal */}
      {selectedParticipant && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedParticipant(null)}>
          <div className="bg-[#1a2235] rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto border border-white/15" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#1a2235] p-4 border-b border-white/10 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-bold text-white">{selectedParticipant.nickname}</h3>
              <button onClick={() => setSelectedParticipant(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-lg p-2"><span className="text-gray-500">Account:</span> <span className="text-white">{selectedParticipant.accountNumber}</span></div>
                <div className="bg-white/5 rounded-lg p-2"><span className="text-gray-500">Type:</span> <span className="text-white">{selectedParticipant.accountType}</span></div>
                <div className="bg-white/5 rounded-lg p-2"><span className="text-gray-500">Balance:</span> <span className="text-white">${parseFloat(selectedParticipant.lastKnownBalance || 0).toFixed(2)}</span></div>
                <div className="bg-white/5 rounded-lg p-2"><span className="text-gray-500">Status:</span> <span className={selectedParticipant.disqualified ? "text-loss" : "text-profit"}>{selectedParticipant.disqualified ? "DQ" : "Active"}</span></div>
              </div>
              <h4 className="text-xs font-semibold text-gray-400 mt-4">Recent Trades</h4>
              {selectedParticipantTrades.length === 0 ? <p className="text-xs text-gray-600">No trades</p> : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {selectedParticipantTrades.slice(0, 20).map((t: any) => (
                    <div key={t.ticket} className={`flex items-center justify-between p-2 rounded-lg text-xs ${t.is_qualified ? 'bg-white/5' : 'bg-loss/5'}`}>
                      <div><span className="text-white font-medium">{t.symbol}</span> <span className="text-gray-500">{t.volume} lots</span></div>
                      <span className={`font-semibold ${t.profit >= 0 ? 'text-profit' : 'text-loss'}`}>${parseFloat(t.profit).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Challenge Modal - keeping existing */}
      {showCreateModal && <CreateChallengeModal
        createStep={createStep} setCreateStep={setCreateStep}
        createForm={createForm} setCreateForm={setCreateForm}
        createRules={createRules} setCreateRules={setCreateRules}
        createLoading={createLoading} setCreateLoading={setCreateLoading}
        createResult={createResult} setCreateResult={setCreateResult}
        onClose={() => setShowCreateModal(false)}
        hostInfo={hostInfo} getToken={getToken}
        setShowAccountSettings={setShowAccountSettings}
        setShowCreateModal={setShowCreateModal}
      />}
    </div>
  );
}

// ===== HELPER COMPONENTS =====

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-profit/20 text-profit border-profit/30',
    registration_open: 'bg-gold/20 text-gold border-gold/30',
    pending_approval: 'bg-royal/20 text-royal border-royal/30',
    rejected: 'bg-loss/20 text-loss border-loss/30',
  };
  const labels: Record<string, string> = {
    active: 'Active', registration_open: 'Registration Open',
    pending_approval: 'Pending Approval', rejected: 'Rejected',
    reviewing: 'Reviewing', completed: 'Completed', draft: 'Draft',
  };
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${colors[status] || 'bg-white/10 text-gray-400 border-white/20'}`}>{labels[status] || status}</span>;
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: any; sub: string; color: string }) {
  return (
    <div className="glass rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10">
      <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>{icon}<p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p></div>
      <p className={`text-lg sm:text-2xl md:text-3xl font-bold ${color} truncate`}>{value}</p>
      {sub && <p className="text-[9px] sm:text-[10px] text-gray-500 mt-1 truncate">{sub}</p>}
    </div>
  );
}

function MetricCard({ title, value, sub, user, color }: { title: string; value: string; sub: string; user?: string; color: string }) {
  return (
    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
      <p className="text-[9px] text-gray-400 uppercase mb-0.5">{title}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[9px] text-gray-500">{sub}</p>
      {user && <p className="text-[9px] text-white font-medium mt-0.5">{user}</p>}
    </div>
  );
}

function ScreeningTab({ challengeId, getToken }: { challengeId: number; getToken: () => string }) {
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

  const runScreening = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiUrl}/api/host/challenge/${challengeId}/screening`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (res.ok) { setResults(data.results || []); setStats({ total: data.total, allocated: data.allocated, notAllocated: data.notAllocated, failed: data.failed }); }
      else setError(data.error || "Failed");
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Target size={16} className="text-gold" /> Partner Screening</h3>
      <button onClick={runScreening} disabled={loading} className="px-5 py-2.5 rounded-xl bg-gold/10 text-gold text-sm font-semibold border border-gold/20 hover:bg-gold/20 disabled:opacity-50 mb-4">{loading ? "Checking..." : "Run Screening"}</button>
      {error && <p className="text-loss text-sm mb-3">{error}</p>}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white/5 rounded-lg p-3 text-center"><p className="text-lg font-bold text-white">{stats.total}</p><p className="text-[10px] text-gray-500">Total</p></div>
          <div className="bg-profit/5 rounded-lg p-3 text-center"><p className="text-lg font-bold text-profit">{stats.allocated}</p><p className="text-[10px] text-gray-500">Allocated</p></div>
          <div className="bg-loss/5 rounded-lg p-3 text-center"><p className="text-lg font-bold text-loss">{stats.notAllocated}</p><p className="text-[10px] text-gray-500">Not Allocated</p></div>
          <div className="bg-white/5 rounded-lg p-3 text-center"><p className="text-lg font-bold text-gray-400">{stats.failed}</p><p className="text-[10px] text-gray-500">No Data</p></div>
        </div>
      )}
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 text-xs">
              <span className="text-white font-medium">{r.nickname}</span>
              <span className={`font-semibold ${r.status === 'allocated' ? 'text-profit' : r.status === 'not_allocated' ? 'text-loss' : 'text-gray-500'}`}>{r.status === 'allocated' ? 'Allocated' : r.status === 'not_allocated' ? 'Not Allocated' : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BrokerCredentialsSection() {
  const [hasBroker, setHasBroker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ brokerEmail: "", brokerPassword: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
  const getToken = () => localStorage.getItem("host_token") || "";

  useEffect(() => {
    fetch(`${apiUrl}/api/host/broker-status`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(data => { setHasBroker(data.hasBrokerIntegration || false); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.brokerEmail || !form.brokerPassword) { setError("Email and password required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`${apiUrl}/api/host/broker-credentials`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setSaved(true); setHasBroker(true); setShowForm(false); setForm({ brokerEmail: "", brokerPassword: "" }); }
      else { const d = await res.json(); setError(d.error || "Failed"); }
    } catch { setError("Network error"); }
    setSaving(false); setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return <div className="glass rounded-2xl border border-white/10 p-5"><Loader2 className="animate-spin text-royal mx-auto" size={20} /></div>;

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Shield size={16} className="text-gold" /> Broker Integration</h3>
      <p className="text-xs text-gray-500 mb-4">Connect broker credentials for partner allocation verification.</p>
      {saved && <div className="p-2 mb-3 rounded-lg bg-profit/10 text-profit text-xs">Updated</div>}
      {hasBroker && !showForm ? (
        <div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-profit/5 border border-profit/20 mb-3"><div className="w-2.5 h-2.5 rounded-full bg-profit" /><p className="text-sm text-profit font-medium">Active</p></div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 text-gray-300 border border-white/10">Update</button>
            <button onClick={async () => { if(!confirm("Remove broker credentials?")) return; await fetch(`${apiUrl}/api/host/broker-credentials`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } }); setHasBroker(false); }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-loss/10 text-loss border border-loss/20">Remove</button>
          </div>
        </div>
      ) : (
        <div>
          {!showForm && <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-gold/10 text-gold border border-gold/20">Setup Credentials</button>}
          {showForm && (
            <div className="space-y-3">
              {error && <p className="text-xs text-loss">{error}</p>}
              <div><label className="text-xs text-gray-400 mb-1 block">Broker Email</label><input type="email" value={form.brokerEmail} onChange={e => setForm(p => ({...p, brokerEmail: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
              <div><label className="text-xs text-gray-400 mb-1 block">Broker Password</label><input type="password" value={form.brokerPassword} onChange={e => setForm(p => ({...p, brokerPassword: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl bg-gold text-black text-sm font-semibold disabled:opacity-50">Save</button>
                <button onClick={() => { setShowForm(false); setError(""); }} className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Create Challenge Modal (extracted)
function CreateChallengeModal({ createStep, setCreateStep, createForm, setCreateForm, createRules, setCreateRules, createLoading, setCreateLoading, createResult, setCreateResult, onClose, hostInfo, getToken, setShowAccountSettings, setShowCreateModal }: any) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

  const handleSubmit = async () => {
    setCreateLoading(true); setCreateResult(null);
    try {
      const res = await fetch(`${API_URL}/api/host/challenges`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, starting_balance: parseFloat(createForm.starting_balance), target_balance: parseFloat(createForm.target_balance), target_percent: createForm.deposit_mode !== 'fixed' ? parseFloat(createForm.target_percent) : null, real_winners_count: parseInt(createForm.real_winners_count) || 0, demo_winners_count: parseInt(createForm.demo_winners_count) || 0, real_prizes: createForm.real_prizes ? createForm.real_prizes.split(',').map((p: string) => p.trim()).filter(Boolean) : [], demo_prizes: createForm.demo_prizes ? createForm.demo_prizes.split(',').map((p: string) => p.trim()).filter(Boolean) : [], rules: createRules }),
      });
      const data = await res.json();
      if (res.ok && data.success) setCreateResult({ success: true });
      else setCreateResult({ error: data.error || 'Failed' });
    } catch { setCreateResult({ error: 'Could not connect to server' }); }
    setCreateLoading(false);
  };

  const Tip = ({ text }: { text: string }) => (
    <div className="relative group inline-block ml-1">
      <span className="cursor-help text-gray-500 hover:text-royal transition-colors text-xs">&#9432;</span>
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[#1a1a2e] border border-white/20 rounded-lg text-[10px] text-gray-300 w-52 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50 shadow-xl">{text}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#0a0e1a]/95 z-50 flex items-center justify-center p-4" onClick={() => !createLoading && onClose()}>
      <div className="bg-[#1a2235] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/15 shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1a2235] px-6 pt-5 pb-4 border-b border-white/10 z-10 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Create Challenge</h3>
            <button onClick={() => !createLoading && onClose()} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={16} className="text-gray-500" /></button>
          </div>
          <div className="flex gap-2">{[1,2,3].map(s => <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= createStep ? "bg-royal" : "bg-white/10"}`} />)}</div>
          <p className="text-[10px] text-gray-500 mt-2">{createStep === 1 ? "Step 1: Details & Rewards" : createStep === 2 ? "Step 2: Rules" : "Step 3: Review & Submit"}</p>
        </div>
        <div className="px-6 py-5">
          {createResult?.success ? (
            <div className="text-center py-8">
              <p className="text-profit font-bold text-lg mb-2">Submitted for Approval</p>
              <p className="text-gray-400 text-sm">Admin will review your challenge.</p>
              <button onClick={() => { onClose(); window.location.reload(); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal/20 text-royal font-semibold text-sm border border-royal/30">Done</button>
            </div>
          ) : (<>
            {/* ====== STEP 1: Details & Rewards ====== */}
            {createStep === 1 && (
              <div className="space-y-4">
                <div><label className="text-xs text-gray-400 mb-1 block">Title *</label><input value={createForm.title} onChange={(e: any) => setCreateForm({...createForm, title: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="Challenge Title" /></div>
                <div><label className="text-xs text-gray-400 mb-1 block">Type</label><select value={createForm.type} onChange={(e: any) => setCreateForm({...createForm, type: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none"><option value="hybrid" className="bg-[#0f1629]">Hybrid (Demo + Real)</option><option value="demo" className="bg-[#0f1629]">Demo Only</option><option value="real" className="bg-[#0f1629]">Real Only</option></select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Start Date *</label><input type="datetime-local" value={createForm.start_date} onChange={(e: any) => setCreateForm({...createForm, start_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div><label className="text-xs text-gray-400 mb-1 block">End Date *</label><input type="datetime-local" value={createForm.end_date} onChange={(e: any) => setCreateForm({...createForm, end_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                </div>
                <div><label className="text-xs text-gray-400 mb-1 block">Timezone</label><select value={createForm.timezone} onChange={(e: any) => setCreateForm({...createForm, timezone: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none"><option value="Africa/Nairobi">East Africa (Nairobi) UTC+3</option><option value="Asia/Dubai">UAE (Dubai) UTC+4</option><option value="Europe/London">UK (London)</option><option value="America/New_York">US Eastern</option><option value="Asia/Shanghai">China (Shanghai)</option><option value="UTC">UTC</option></select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Starting Balance ($)</label><input value={createForm.starting_balance} onChange={(e: any) => setCreateForm({...createForm, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div><label className="text-xs text-gray-400 mb-1 block">Target Balance ($)</label><input value={createForm.target_balance} onChange={(e: any) => setCreateForm({...createForm, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                </div>

                {/* Rewards Section */}
                <div className="border-t border-white/10 pt-4 mt-4">
                  <p className="text-xs text-gray-300 font-semibold mb-3 uppercase tracking-wider">Rewards / Prizes</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400 mb-1 block">Real Winners #</label><input value={createForm.real_winners_count} onChange={(e: any) => setCreateForm({...createForm, real_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="3" /></div>
                    <div><label className="text-xs text-gray-400 mb-1 block">Demo Winners #</label><input value={createForm.demo_winners_count} onChange={(e: any) => setCreateForm({...createForm, demo_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="3" /></div>
                  </div>
                  <div className="mt-3"><label className="text-xs text-gray-400 mb-1 block">Real Prizes (comma separated)</label><input value={createForm.real_prizes} onChange={(e: any) => setCreateForm({...createForm, real_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="$100, $50, $25" /></div>
                  <div className="mt-3"><label className="text-xs text-gray-400 mb-1 block">Demo Prizes (comma separated)</label><input value={createForm.demo_prizes} onChange={(e: any) => setCreateForm({...createForm, demo_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="$50, $30, $20" /></div>
                </div>

                {/* Registration Mode */}
                <div className="border-t border-white/10 pt-4 mt-4">
                  <p className="text-xs text-gray-300 font-semibold mb-3 uppercase tracking-wider">Registration Mode</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setCreateForm({...createForm, registration_mode: 'winnerpip'})} className={`p-3 rounded-xl border text-center transition-all ${createForm.registration_mode === 'winnerpip' ? 'bg-royal/20 border-royal/40 text-royal' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                      <p className="text-sm font-semibold">Online</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Users register on WinnerPip</p>
                    </button>
                    <button type="button" onClick={() => setCreateForm({...createForm, registration_mode: 'manual'})} className={`p-3 rounded-xl border text-center transition-all ${createForm.registration_mode === 'manual' ? 'bg-gold/20 border-gold/40 text-gold' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                      <p className="text-sm font-semibold">Manual (CSV)</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Upload participant list</p>
                    </button>
                  </div>
                </div>

                <button onClick={() => setCreateStep(2)} disabled={!createForm.title || !createForm.start_date || !createForm.end_date} className="w-full py-3 rounded-xl bg-royal text-white font-semibold disabled:opacity-40 mt-4">Next: Rules</button>
              </div>
            )}

            {/* ====== STEP 2: Rules (Admin-style) ====== */}
            {createStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-3">Toggle rules ON/OFF. Hover &#9432; for details. Disabled rules won&apos;t be enforced during evaluation.</p>

                {/* Max Lot Size */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.max_lot_size ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, max_lot_size: !createRules.rules_enabled.max_lot_size}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.max_lot_size ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.max_lot_size ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Max Lot Size</p>
                    <Tip text="Limits the maximum lot size per position. Trades exceeding this have profits removed." />
                  </div>
                  <input type="number" step="0.01" value={createRules.max_lot_size || ""} onChange={e => setCreateRules({...createRules, max_lot_size: parseFloat(e.target.value) || 0})} disabled={!createRules.rules_enabled.max_lot_size} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.max_lot_size ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Max Open Trades */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.max_open_trades ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, max_open_trades: !createRules.rules_enabled.max_open_trades}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.max_open_trades ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.max_open_trades ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Max Open Trades</p>
                    <Tip text="Limits simultaneous open trades. All overlapping trades get flagged when exceeded." />
                  </div>
                  <input type="number" value={createRules.max_open_trades || ""} onChange={e => setCreateRules({...createRules, max_open_trades: parseInt(e.target.value) || 0})} disabled={!createRules.rules_enabled.max_open_trades} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.max_open_trades ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Pair Limit */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.pair_limit ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, pair_limit: !createRules.rules_enabled.pair_limit}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.pair_limit ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.pair_limit ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Pair Limit</p>
                    <Tip text="Max trades on the same pair open at once. Prevents overexposure to a single instrument." />
                  </div>
                  <input type="number" value={createRules.pair_limit || ""} onChange={e => setCreateRules({...createRules, pair_limit: parseInt(e.target.value) || 0})} disabled={!createRules.rules_enabled.pair_limit} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.pair_limit ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Max Risk (with mode) */}
                <div className={`p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 ${!createRules.rules_enabled.stop_loss_required ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, stop_loss_required: !createRules.rules_enabled.stop_loss_required}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.stop_loss_required ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.stop_loss_required ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                      <p className="text-sm text-white font-medium">Max Risk</p>
                      <Tip text="Max risk per trade measured by SL distance. Fixed = same $ for all. Percentage = from balance at trade open." />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => createRules.rules_enabled.stop_loss_required && setCreateRules({...createRules, max_risk_mode: 'fixed'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${createRules.max_risk_mode !== 'percentage' ? 'bg-royal/30 text-royal border border-royal/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>Fixed $</button>
                      <button type="button" onClick={() => createRules.rules_enabled.stop_loss_required && setCreateRules({...createRules, max_risk_mode: 'percentage'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${createRules.max_risk_mode === 'percentage' ? 'bg-gold/30 text-gold border border-gold/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>% Balance</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" step="any" value={createRules.max_risk_mode === 'percentage' ? (createRules.max_risk_percent || "") : (createRules.max_risk_dollars || "")} onChange={e => createRules.max_risk_mode === 'percentage' ? setCreateRules({...createRules, max_risk_percent: parseFloat(e.target.value) || 0}) : setCreateRules({...createRules, max_risk_dollars: parseFloat(e.target.value) || 0})} disabled={!createRules.rules_enabled.stop_loss_required} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.stop_loss_required ? "cursor-not-allowed" : ""}`} />
                    <span className="text-xs text-gray-500">{createRules.max_risk_mode === 'percentage' ? '% of account balance' : '$ per trade'}</span>
                  </div>
                </div>

                {/* Daily Loss Cap (with mode) */}
                <div className={`p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 ${!createRules.rules_enabled.daily_loss_cap ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, daily_loss_cap: !createRules.rules_enabled.daily_loss_cap}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.daily_loss_cap ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.daily_loss_cap ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                      <p className="text-sm text-white font-medium">Daily Loss Cap</p>
                      <Tip text="Max drawdown from day's opening balance. Fixed = same $ cap every day. Percentage = scales with account growth." />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => createRules.rules_enabled.daily_loss_cap && setCreateRules({...createRules, daily_loss_mode: 'fixed'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${createRules.daily_loss_mode !== 'percentage' ? 'bg-royal/30 text-royal border border-royal/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>Fixed $</button>
                      <button type="button" onClick={() => createRules.rules_enabled.daily_loss_cap && setCreateRules({...createRules, daily_loss_mode: 'percentage'})} className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-all ${createRules.daily_loss_mode === 'percentage' ? 'bg-gold/30 text-gold border border-gold/40' : 'bg-white/5 text-gray-500 border border-white/10'}`}>% Balance</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" step="any" value={createRules.daily_loss_mode === 'percentage' ? (createRules.daily_loss_percent || "") : (createRules.daily_loss_cap || "")} onChange={e => createRules.daily_loss_mode === 'percentage' ? setCreateRules({...createRules, daily_loss_percent: parseFloat(e.target.value) || 0}) : setCreateRules({...createRules, daily_loss_cap: parseFloat(e.target.value) || 0})} disabled={!createRules.rules_enabled.daily_loss_cap} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.daily_loss_cap ? "cursor-not-allowed" : ""}`} />
                    <span className="text-xs text-gray-500">{createRules.daily_loss_mode === 'percentage' ? '% of day open balance' : '$ from day open'}</span>
                  </div>
                </div>

                {/* Max Hold Hours */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.max_hold_hours ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, max_hold_hours: !createRules.rules_enabled.max_hold_hours}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.max_hold_hours ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.max_hold_hours ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Max Hold Hours</p>
                    <Tip text="Max time a trade can be held. Exceeding this flags the trade and removes profits." />
                  </div>
                  <input type="number" value={createRules.max_hold_hours || ""} onChange={e => setCreateRules({...createRules, max_hold_hours: parseInt(e.target.value) || 0})} disabled={!createRules.rules_enabled.max_hold_hours} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.max_hold_hours ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Min Trade Duration */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.min_trade_duration ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, min_trade_duration: !createRules.rules_enabled.min_trade_duration}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.min_trade_duration ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.min_trade_duration ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Min Duration (min)</p>
                    <Tip text="Minimum hold time. Trades closed faster are flagged. Prevents ultra-short scalping." />
                  </div>
                  <input type="number" value={createRules.min_trade_duration_minutes || ""} onChange={e => setCreateRules({...createRules, min_trade_duration_minutes: parseInt(e.target.value) || null})} disabled={!createRules.rules_enabled.min_trade_duration} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.min_trade_duration ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Min Active Days */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.min_active_days ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, min_active_days: !createRules.rules_enabled.min_active_days}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.min_active_days ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.min_active_days ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Min Active Days</p>
                    <Tip text="Minimum distinct trading days to qualify for prizes. DQ'd at challenge end if not met." />
                  </div>
                  <input type="number" value={createRules.min_active_days || ""} onChange={e => setCreateRules({...createRules, min_active_days: parseInt(e.target.value) || 0})} disabled={!createRules.rules_enabled.min_active_days} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.min_active_days ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Min Total Trades */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.min_total_trades ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, min_total_trades: !createRules.rules_enabled.min_total_trades}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.min_total_trades ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.min_total_trades ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Min Total Trades</p>
                    <Tip text="Minimum closed trades to qualify. Users who don't meet this are DQ'd at challenge end." />
                  </div>
                  <input type="number" value={createRules.min_total_trades || ""} onChange={e => setCreateRules({...createRules, min_total_trades: parseInt(e.target.value) || null})} disabled={!createRules.rules_enabled.min_total_trades} className={`w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none ${!createRules.rules_enabled.min_total_trades ? "cursor-not-allowed" : ""}`} />
                </div>

                {/* Weekend Trading (toggle with enable) */}
                <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!createRules.rules_enabled.weekend_trading ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, weekend_trading: !createRules.rules_enabled.weekend_trading}})} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${createRules.rules_enabled.weekend_trading ? "bg-royal" : "bg-white/20"}`}><div className={`w-4 h-4 bg-white rounded-full transition-transform ${createRules.rules_enabled.weekend_trading ? "translate-x-4" : "translate-x-0.5"}`}></div></button>
                    <p className="text-sm text-white font-medium">Weekend Trading</p>
                    <Tip text="Controls crypto trades on weekends. When OFF (and enabled), weekend crypto trades are flagged." />
                  </div>
                  <button type="button" onClick={() => createRules.rules_enabled.weekend_trading && setCreateRules({...createRules, weekend_trading: !createRules.weekend_trading})} className={`w-12 h-6 rounded-full transition-all ${createRules.weekend_trading && createRules.rules_enabled.weekend_trading ? "bg-profit" : "bg-white/20"} ${!createRules.rules_enabled.weekend_trading ? "cursor-not-allowed" : ""}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${createRules.weekend_trading && createRules.rules_enabled.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                </div>

                {/* Only Cent Account */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">Only Cent Account (Real)</p>
                    <Tip text="Real category only accepts cent accounts. Not a toggleable evaluation rule — it's a registration filter." />
                  </div>
                  <button type="button" onClick={() => setCreateRules({...createRules, only_cent_account: !createRules.only_cent_account, ...((!createRules.only_cent_account) ? { allow_professional: false } : {})})} className={`w-12 h-6 rounded-full transition-all ${createRules.only_cent_account ? "bg-profit" : "bg-white/20"}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${createRules.only_cent_account ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                </div>

                {/* Allow Professional Accounts */}
                {!createRules.only_cent_account && (
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-medium">Allow Professional Accounts</p>
                      <Tip text="Allow Pro/Zero/Raw Spread account types. When OFF, only Standard accounts are accepted for real category." />
                    </div>
                    <button type="button" onClick={() => setCreateRules({...createRules, allow_professional: !createRules.allow_professional})} className={`w-12 h-6 rounded-full transition-all ${createRules.allow_professional ? "bg-profit" : "bg-white/20"}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${createRules.allow_professional ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
                  </div>
                )}

                <div className="flex gap-3 mt-4">
                  <button onClick={() => setCreateStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm font-semibold hover:bg-white/10 transition-all">Back</button>
                  <button onClick={() => setCreateStep(3)} className="flex-1 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold hover:opacity-90 transition-all">Review</button>
                </div>
              </div>
            )}

            {/* ====== STEP 3: Review ====== */}
            {createStep === 3 && (
              <div>
                <div className="space-y-2 mb-5 text-xs">
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Challenge Details</p>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Title</span><span className="text-white font-medium">{createForm.title}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Type</span><span className="text-white capitalize">{createForm.type}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Balance</span><span className="text-white">${createForm.starting_balance} &rarr; ${createForm.target_balance}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Timezone</span><span className="text-white">{createForm.timezone}</span></div>

                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-4 mb-2">Rewards</p>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Real Winners</span><span className="text-white">{createForm.real_winners_count || "0"}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Demo Winners</span><span className="text-white">{createForm.demo_winners_count || "0"}</span></div>
                  {createForm.real_prizes && <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Real Prizes</span><span className="text-white">{createForm.real_prizes}</span></div>}
                  {createForm.demo_prizes && <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Demo Prizes</span><span className="text-white">{createForm.demo_prizes}</span></div>}
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Registration</span><span className="text-white">{createForm.registration_mode === 'winnerpip' ? 'Online (WinnerPip)' : 'Manual (CSV)'}</span></div>

                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-4 mb-2">Rules</p>
                  {createRules.rules_enabled.max_lot_size && <div className="flex justify-between py-1.5"><span className="text-gray-500">Max Lot Size</span><span className="text-white">{createRules.max_lot_size}</span></div>}
                  {createRules.rules_enabled.max_open_trades && <div className="flex justify-between py-1.5"><span className="text-gray-500">Max Open Trades</span><span className="text-white">{createRules.max_open_trades}</span></div>}
                  {createRules.rules_enabled.pair_limit && <div className="flex justify-between py-1.5"><span className="text-gray-500">Pair Limit</span><span className="text-white">{createRules.pair_limit}</span></div>}
                  {createRules.rules_enabled.stop_loss_required && <div className="flex justify-between py-1.5"><span className="text-gray-500">Max Risk</span><span className="text-white">{createRules.max_risk_mode === 'percentage' ? `${createRules.max_risk_percent}% of balance` : `$${createRules.max_risk_dollars}`}</span></div>}
                  {createRules.rules_enabled.daily_loss_cap && <div className="flex justify-between py-1.5"><span className="text-gray-500">Daily Loss Cap</span><span className="text-white">{createRules.daily_loss_mode === 'percentage' ? `${createRules.daily_loss_percent}% of day balance` : `$${createRules.daily_loss_cap}`}</span></div>}
                  {createRules.rules_enabled.max_hold_hours && <div className="flex justify-between py-1.5"><span className="text-gray-500">Max Hold</span><span className="text-white">{createRules.max_hold_hours}h</span></div>}
                  {createRules.rules_enabled.min_trade_duration && <div className="flex justify-between py-1.5"><span className="text-gray-500">Min Duration</span><span className="text-white">{createRules.min_trade_duration_minutes}min</span></div>}
                  {createRules.rules_enabled.min_active_days && <div className="flex justify-between py-1.5"><span className="text-gray-500">Min Active Days</span><span className="text-white">{createRules.min_active_days}</span></div>}
                  {createRules.rules_enabled.min_total_trades && <div className="flex justify-between py-1.5"><span className="text-gray-500">Min Total Trades</span><span className="text-white">{createRules.min_total_trades}</span></div>}
                  {createRules.rules_enabled.weekend_trading && <div className="flex justify-between py-1.5"><span className="text-gray-500">Weekend Trading</span><span className="text-white">{createRules.weekend_trading ? "Allowed" : "Not Allowed"}</span></div>}
                  {createRules.only_cent_account && <div className="flex justify-between py-1.5"><span className="text-gray-500">Cent Account</span><span className="text-white">Required</span></div>}
                  {createRules.allow_professional && <div className="flex justify-between py-1.5"><span className="text-gray-500">Professional Accounts</span><span className="text-white">Allowed</span></div>}
                </div>
                {createResult?.error && <p className="text-xs text-loss mb-3">{createResult.error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setCreateStep(2)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm">Back</button>
                  <button onClick={handleSubmit} disabled={createLoading} className="flex-1 py-2.5 rounded-xl bg-profit/20 border border-profit/30 text-profit text-sm font-bold disabled:opacity-50">{createLoading ? "Submitting..." : "Submit for Approval"}</button>
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
