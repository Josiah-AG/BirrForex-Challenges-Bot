"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Trophy, FileText, Settings, RefreshCw,
  LogOut, Loader2, ChevronDown, Calendar, Target, Activity, Shield, Info, X,
  AlertTriangle, Zap, Clock, TrendingUp, Key, UserMinus, Ban, BarChart3,
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
    only_cent_account: false,
    rules_enabled: { max_lot_size: true, max_open_trades: true, pair_limit: true, stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true, min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true },
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState("");

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
        setChallenges(data.challenges || []);
        if (data.challenges?.length > 0) {
          const active = data.challenges.find((c: any) => ['active', 'registration_open'].includes(c.status));
          setSelectedChallengeId(active?.id || data.challenges[0].id);
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <StatCard icon={<Users size={16} />} label="Participants" value={overview.totalParticipants} sub={`Demo: ${overview.demoParticipants} | Real: ${overview.realParticipants}`} color="text-royal" />
              <StatCard icon={<Activity size={16} />} label="Total Trades" value={overview.totalTrades} sub={`Violations: ${overview.totalViolations}`} color="text-white" />
              <StatCard icon={<AlertTriangle size={16} />} label="Violations" value={overview.totalViolations} sub={`${overview.violationRate}% rate`} color="text-loss" />
              <StatCard icon={<Trophy size={16} />} label="Above Target" value={overview.aboveTarget} sub={`${overview.totalParticipants > 0 ? ((overview.aboveTarget / overview.totalParticipants) * 100).toFixed(1) : 0}% qualified`} color="text-gold" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6">
              <StatCard icon={<Zap size={16} />} label="Updates Today" value={overview.pullsToday} sub="" color="text-royal" />
              <StatCard icon={<Shield size={16} />} label="Last Update" value={overview.lastPull ? (overview.lastPull.successful + " ok") : "—"} sub={overview.lastPull ? `Failed: ${overview.lastPull.failed}` : ""} color="text-profit" />
              <StatCard icon={<Key size={16} />} label="PW Changed" value={overview.passwordChanged} sub="Credential failures" color="text-gold" />
              <StatCard icon={<Clock size={16} />} label="DQ'd" value={overview.disqualified} sub="Disqualified" color="text-loss" />
            </div>
            {/* Top Violations */}
            {overview.topViolations?.length > 0 && (
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Top Rule Violations</h3>
                <div className="space-y-3">
                  {overview.topViolations.map((v: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between mb-1"><span className="text-sm text-gray-300">{v.rule}</span><span className="text-xs text-gray-500">{v.count}</span></div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-loss/60 rounded-full" style={{ width: `${Math.min((v.count / Math.max(...overview.topViolations.map((x: any) => x.count), 1)) * 100, 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {/* ===== PARTICIPANTS ===== */}
          {activeTab === "participants" && (
            <div className="glass rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-royal" /> Participants ({participantsPagination?.total || participants.length})</h3>
              {participants.length === 0 ? <p className="text-gray-500 text-sm text-center py-10">No participants yet</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-white/10">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Nickname</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Account</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Type</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Balance</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Actions</th>
                    </tr></thead>
                    <tbody>
                      {participants.map(p => (
                        <tr key={p.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => setSelectedParticipant(p)}>
                          <td className="py-2.5 px-3 text-white font-medium">{p.nickname}</td>
                          <td className="py-2.5 px-3 text-gray-300">{p.accountNumber}</td>
                          <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.accountType === 'real' ? 'bg-gold/20 text-gold' : 'bg-royal/20 text-royal'}`}>{p.accountType}</span></td>
                          <td className="py-2.5 px-3">{p.disqualified ? <span className="text-loss text-xs font-semibold">DQ</span> : p.pullStatus === 'password_changed' ? <span className="text-gold text-xs">PW Changed</span> : <span className="text-profit text-xs">Active</span>}</td>
                          <td className="py-2.5 px-3 text-gray-300">{p.lastKnownBalance ? `$${parseFloat(p.lastKnownBalance).toFixed(2)}` : "—"}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button onClick={e => { e.stopPropagation(); if(confirm(`Disqualify ${p.nickname}?`)) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/disqualify`, 'POST', { registrationId: p.id, reason: 'Host decision' }); }} className="text-loss text-[10px] font-semibold px-2 py-1 rounded bg-loss/10 hover:bg-loss/20 mr-1" disabled={p.disqualified}>DQ</button>
                            <button onClick={e => { e.stopPropagation(); if(confirm(`Remove ${p.nickname}?`)) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/unverify`, 'POST', { registrationId: p.id }); }} className="text-gray-400 text-[10px] font-semibold px-2 py-1 rounded bg-white/5 hover:bg-white/10">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ===== LEADERBOARD ===== */}
          {activeTab === "leaderboard" && (
            <div className="glass rounded-2xl border border-white/10 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Trophy size={16} className="text-gold" /> Leaderboard</h3>
                <button onClick={() => { window.open(`${API_URL}/api/host/challenge/${selectedChallengeId}/export-registrations?token=${getToken()}`, '_blank'); }} className="text-xs text-royal font-semibold px-3 py-1.5 rounded-lg bg-royal/10 border border-royal/20">Export CSV</button>
              </div>
              {leaderboard.length === 0 ? <p className="text-gray-500 text-sm text-center py-10">Leaderboard populates after first update</p> : (
                <div className="space-y-2">
                  {leaderboard.map((entry: any) => (
                    <div key={entry.nickname} className={`flex items-center justify-between p-3 rounded-xl ${entry.isDisqualified ? 'bg-loss/5 border border-loss/20' : 'bg-white/5 border border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${entry.rank === 1 ? 'bg-gold/20 text-gold' : entry.rank === 2 ? 'bg-gray-300/20 text-gray-300' : entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' : 'bg-white/5 text-gray-500'}`}>{entry.isDisqualified ? 'DQ' : `#${entry.rank || '—'}`}</span>
                        <div>
                          <p className="text-sm font-semibold text-white">{entry.nickname}</p>
                          <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.flaggedTrades} flagged • {entry.accountType}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{entry.growthPercent > 0 ? `+${entry.growthPercent.toFixed(1)}%` : `$${parseFloat(entry.adjustedBalance || 0).toFixed(2)}`}</p>
                        {entry.isDisqualified && <p className="text-[10px] text-loss">{entry.disqualifyReason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== VIOLATIONS ===== */}
          {activeTab === "violations" && (
            <div className="glass rounded-2xl border border-white/10 p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-loss" /> Violations by User</h3>
              {violations.length === 0 ? <p className="text-gray-500 text-sm text-center py-10">No violations yet</p> : (
                <div className="space-y-3">
                  {violations.map((v: any, i: number) => (
                    <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">{v.nickname}</span>
                        <span className="text-xs text-loss font-semibold">{v.violation_count} violations • ${parseFloat(v.profit_removed || 0).toFixed(2)} removed</span>
                      </div>
                      <div className="space-y-1">
                        {(v.flagged_trades || []).slice(0, 5).map((t: any, j: number) => (
                          <div key={j} className="flex items-center gap-2 text-xs text-gray-400">
                            <span className="text-white font-medium">{t.symbol}</span>
                            <span className="truncate">{t.violations?.[0] || "Rule violation"}</span>
                            <span className="ml-auto text-loss">${parseFloat(t.profit || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== UPDATES (Pulls) ===== */}
          {activeTab === "updates" && (
            <div className="space-y-4">
              {/* Action buttons */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><RefreshCw size={16} className="text-royal" /> Update Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update`)} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-royal/20 text-royal text-xs font-semibold border border-royal/30 hover:bg-royal/30 disabled:opacity-50">Force Update (All)</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update-rank`)} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-profit/20 text-profit text-xs font-semibold border border-profit/30 hover:bg-profit/30 disabled:opacity-50">Update Non-DQ</button>
                  {failedAccounts?.credentialFailures?.length > 0 && (
                    <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`)} disabled={actionLoading} className="px-4 py-2 rounded-lg bg-gold/20 text-gold text-xs font-semibold border border-gold/30 hover:bg-gold/30 disabled:opacity-50">Retry Credentials ({failedAccounts.credentialFailures.length})</button>
                  )}
                </div>
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
                          <p className="text-[10px] text-gray-500">{f.account_number} • {f.mt5_server}</p>
                        </div>
                        <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, 'POST', { registrationId: f.id })} className="text-[10px] text-royal font-semibold px-2 py-1 rounded bg-royal/10">Re-evaluate</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Update History */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-3">Update History</h3>
                {pullHistory.length === 0 ? <p className="text-gray-500 text-sm text-center py-6">No updates yet</p> : (
                  <div className="space-y-2">
                    {pullHistory.map((b: any, i: number) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${b.status === 'completed' ? 'bg-profit' : b.status === 'running' ? 'bg-gold animate-pulse' : 'bg-loss'}`} />
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
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Shield size={16} className="text-royal" /> Rule Configuration</h3>
              <p className="text-xs text-gray-500 mb-5">{rulesLocked ? "Rules are locked — challenge has started." : "Rules can be changed before the challenge starts."}</p>
              {rulesLoading ? <Loader2 className="animate-spin text-royal mx-auto" size={20} /> : rulesConfig && (
                <div className="space-y-2">
                  <RuleRow label="Max Lot Size" tooltip="Maximum lot size per trade" enabled={rulesConfig.rules_enabled?.max_lot_size} onToggle={v => setRulesConfig((p: any) => ({...p, rules_enabled: {...p.rules_enabled, max_lot_size: v}}))} locked={rulesLocked}>
                    <input type="number" step="0.01" value={rulesConfig.max_lot_size} onChange={e => setRulesConfig((p: any) => ({...p, max_lot_size: parseFloat(e.target.value)||0}))} disabled={rulesLocked || !rulesConfig.rules_enabled?.max_lot_size} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                  </RuleRow>
                  <RuleRow label="Max Open Trades" tooltip="Maximum simultaneous positions" enabled={rulesConfig.rules_enabled?.max_open_trades} onToggle={v => setRulesConfig((p: any) => ({...p, rules_enabled: {...p.rules_enabled, max_open_trades: v}}))} locked={rulesLocked}>
                    <input type="number" value={rulesConfig.max_open_trades} onChange={e => setRulesConfig((p: any) => ({...p, max_open_trades: parseInt(e.target.value)||1}))} disabled={rulesLocked || !rulesConfig.rules_enabled?.max_open_trades} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                  </RuleRow>
                  <RuleRow label="Daily Loss Cap" tooltip="Max daily drawdown" enabled={rulesConfig.rules_enabled?.daily_loss_cap} onToggle={v => setRulesConfig((p: any) => ({...p, rules_enabled: {...p.rules_enabled, daily_loss_cap: v}}))} locked={rulesLocked}>
                    <input type="number" value={rulesConfig.daily_loss_cap} onChange={e => setRulesConfig((p: any) => ({...p, daily_loss_cap: parseFloat(e.target.value)||0}))} disabled={rulesLocked || !rulesConfig.rules_enabled?.daily_loss_cap} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                  </RuleRow>
                  <RuleRow label="Min Active Days" tooltip="Minimum trading days to qualify" enabled={rulesConfig.rules_enabled?.min_active_days} onToggle={v => setRulesConfig((p: any) => ({...p, rules_enabled: {...p.rules_enabled, min_active_days: v}}))} locked={rulesLocked}>
                    <input type="number" value={rulesConfig.min_active_days} onChange={e => setRulesConfig((p: any) => ({...p, min_active_days: parseInt(e.target.value)||1}))} disabled={rulesLocked || !rulesConfig.rules_enabled?.min_active_days} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                  </RuleRow>
                  {!rulesLocked && (
                    <div className="pt-4 flex items-center gap-3">
                      <button onClick={async () => {
                        setRulesSaving(true);
                        await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, { method: "PUT", headers: headers(), body: JSON.stringify(rulesConfig) });
                        setRulesSaved(true); setRulesSaving(false);
                        setTimeout(() => setRulesSaved(false), 3000);
                      }} disabled={rulesSaving} className="px-6 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold disabled:opacity-50">
                        {rulesSaving ? <Loader2 size={14} className="animate-spin" /> : null} Save Rules
                      </button>
                      {rulesSaved && <span className="text-sm text-profit">Saved</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ===== SETTINGS ===== */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              {/* Status Actions */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Status Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {['registration_open', 'active', 'reviewing', 'completed'].map(s => (
                    <button key={s} onClick={() => { if(confirm(`Change status to "${s}"?`)) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/direct-status`, 'PATCH', { status: s }); }} disabled={selectedChallenge?.status === s || actionLoading} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-30 ${selectedChallenge?.status === s ? 'bg-royal/20 text-royal border-royal/30' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}>{s.replace('_', ' ')}</button>
                  ))}
                </div>
              </div>

              {/* Challenge Details */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Challenge Details</h3>
                <div className="space-y-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Title</label><input value={settingsForm.title || ""} onChange={e => setSettingsForm((p: any) => ({...p, title: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div><label className="text-xs text-gray-400 mb-1 block">End Date</label><input type="datetime-local" value={settingsForm.end_date || ""} onChange={e => setSettingsForm((p: any) => ({...p, end_date: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400 mb-1 block">Real Winners #</label><input value={settingsForm.real_winners_count || ""} onChange={e => setSettingsForm((p: any) => ({...p, real_winners_count: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                    <div><label className="text-xs text-gray-400 mb-1 block">Demo Winners #</label><input value={settingsForm.demo_winners_count || ""} onChange={e => setSettingsForm((p: any) => ({...p, demo_winners_count: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  </div>
                  <button onClick={async () => {
                    setSettingsSaving(true);
                    const payload: any = {};
                    if (settingsForm.title) payload.title = settingsForm.title;
                    if (settingsForm.end_date) payload.end_date = settingsForm.end_date;
                    if (settingsForm.real_winners_count !== "") payload.real_winners_count = parseInt(settingsForm.real_winners_count) || 0;
                    if (settingsForm.demo_winners_count !== "") payload.demo_winners_count = parseInt(settingsForm.demo_winners_count) || 0;
                    await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/settings`, { method: "PUT", headers: headers(), body: JSON.stringify(payload) });
                    setSettingsSaved(true); setSettingsSaving(false);
                    setTimeout(() => setSettingsSaved(false), 3000);
                  }} disabled={settingsSaving} className="px-6 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold disabled:opacity-50">Save</button>
                  {settingsSaved && <span className="text-sm text-profit ml-3">Saved</span>}
                </div>
              </div>

              {/* Export */}
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Export</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={async () => {
                    const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/export-registrations`, { headers: { Authorization: `Bearer ${getToken()}` } });
                    const data = await res.json();
                    const csv = "nickname,email,category,account_number,server,investor_password\n" + (data.registrations || []).map((r: any) => `${r.nickname},${r.email||''},${r.account_type},${r.account_number},${r.mt5_server},${r.investor_password}`).join("\n");
                    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'registrations.csv'; a.click();
                  }} className="px-4 py-2 rounded-lg bg-white/5 text-gray-300 text-xs font-semibold border border-white/10 hover:bg-white/10">Export Registrations (CSV)</button>
                </div>
              </div>

              {/* Delete */}
              <div className="glass rounded-2xl border border-loss/20 p-5">
                <h3 className="text-sm font-semibold text-loss mb-2">Danger Zone</h3>
                <button onClick={() => { if(confirm("Delete this challenge? This cannot be undone.")) doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}`, 'DELETE'); }} className="px-4 py-2 rounded-lg bg-loss/10 text-loss text-xs font-semibold border border-loss/20 hover:bg-loss/20" disabled={actionLoading}>Delete Challenge</button>
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
    <div className="glass rounded-xl p-3 sm:p-4 border border-white/10">
      <div className={`flex items-center gap-1.5 mb-1.5 ${color}`}>{icon}<p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p></div>
      <p className={`text-lg sm:text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function RuleRow({ label, tooltip, enabled, onToggle, locked, children }: { label: string; tooltip: string; enabled: boolean; onToggle: (v: boolean) => void; locked: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!enabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <button onClick={() => !locked && onToggle(!enabled)} disabled={locked} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${enabled ? "bg-royal" : "bg-white/20"}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <p className="text-sm text-white font-medium">{label}</p>
        <div className="relative group"><Info size={12} className="text-gray-500 cursor-help" /><div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-[10px] text-white bg-black/95 rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{tooltip}</div></div>
      </div>
      {children}
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

  return (
    <div className="fixed inset-0 bg-[#0a0e1a]/95 z-50 flex items-center justify-center p-4" onClick={() => !createLoading && onClose()}>
      <div className="bg-[#1a2235] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/15 shadow-2xl" onClick={(e: any) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#1a2235] px-6 pt-5 pb-4 border-b border-white/10 z-10 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">Create Challenge</h3>
            <button onClick={() => !createLoading && onClose()} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={16} className="text-gray-500" /></button>
          </div>
          <div className="flex gap-2">{[1,2,3].map(s => <div key={s} className={`flex-1 h-1.5 rounded-full ${s <= createStep ? "bg-royal" : "bg-white/10"}`} />)}</div>
        </div>
        <div className="px-6 py-5">
          {createResult?.success ? (
            <div className="text-center py-8">
              <p className="text-profit font-bold text-lg mb-2">Submitted for Approval</p>
              <p className="text-gray-400 text-sm">Admin will review your challenge.</p>
              <button onClick={() => { onClose(); window.location.reload(); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal/20 text-royal font-semibold text-sm border border-royal/30">Done</button>
            </div>
          ) : (<>
            {createStep === 1 && (
              <div className="space-y-4">
                <div><label className="text-xs text-gray-400 mb-1 block">Title *</label><input value={createForm.title} onChange={(e: any) => setCreateForm({...createForm, title: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="Challenge Title" /></div>
                <div><label className="text-xs text-gray-400 mb-1 block">Type</label><select value={createForm.type} onChange={(e: any) => setCreateForm({...createForm, type: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none"><option value="hybrid" className="bg-[#0f1629]">Hybrid</option><option value="demo" className="bg-[#0f1629]">Demo</option><option value="real" className="bg-[#0f1629]">Real</option></select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Start Date *</label><input type="datetime-local" value={createForm.start_date} onChange={(e: any) => setCreateForm({...createForm, start_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div><label className="text-xs text-gray-400 mb-1 block">End Date *</label><input type="datetime-local" value={createForm.end_date} onChange={(e: any) => setCreateForm({...createForm, end_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                </div>
                <div><label className="text-xs text-gray-400 mb-1 block">Timezone</label><select value={createForm.timezone} onChange={(e: any) => setCreateForm({...createForm, timezone: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none"><option value="Africa/Nairobi">East Africa (Nairobi) UTC+3</option><option value="Asia/Dubai">UAE (Dubai) UTC+4</option><option value="Europe/London">UK (London)</option><option value="America/New_York">US Eastern</option><option value="Asia/Shanghai">China (Shanghai)</option><option value="UTC">UTC</option></select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Starting Balance ($)</label><input value={createForm.starting_balance} onChange={(e: any) => setCreateForm({...createForm, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  <div><label className="text-xs text-gray-400 mb-1 block">Target Balance ($)</label><input value={createForm.target_balance} onChange={(e: any) => setCreateForm({...createForm, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                </div>
                <button onClick={() => setCreateStep(2)} disabled={!createForm.title || !createForm.start_date || !createForm.end_date} className="w-full py-3 rounded-xl bg-royal text-white font-semibold disabled:opacity-40">Next: Rules</button>
              </div>
            )}
            {createStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 mb-2">Configure rules for your challenge.</p>
                <RuleRowSimple label="Max Lot Size" value={createRules.max_lot_size} onChange={(v: number) => setCreateRules({...createRules, max_lot_size: v})} />
                <RuleRowSimple label="Max Open Trades" value={createRules.max_open_trades} onChange={(v: number) => setCreateRules({...createRules, max_open_trades: v})} />
                <RuleRowSimple label="Daily Loss Cap ($)" value={createRules.daily_loss_cap} onChange={(v: number) => setCreateRules({...createRules, daily_loss_cap: v})} />
                <RuleRowSimple label="Min Active Days" value={createRules.min_active_days} onChange={(v: number) => setCreateRules({...createRules, min_active_days: v})} />
                <div className="flex gap-3 mt-4">
                  <button onClick={() => setCreateStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm">Back</button>
                  <button onClick={() => setCreateStep(3)} className="flex-1 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold">Review</button>
                </div>
              </div>
            )}
            {createStep === 3 && (
              <div>
                <div className="space-y-2 mb-5 text-xs">
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Title</span><span className="text-white">{createForm.title}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Type</span><span className="text-white">{createForm.type}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Balance</span><span className="text-white">${createForm.starting_balance} → ${createForm.target_balance}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Timezone</span><span className="text-white">{createForm.timezone}</span></div>
                  <div className="flex justify-between py-2"><span className="text-gray-500">Max Lot</span><span className="text-white">{createRules.max_lot_size}</span></div>
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

function RuleRowSimple({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
      <p className="text-sm text-white font-medium">{label}</p>
      <input type="number" step="any" value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none" />
    </div>
  );
}
