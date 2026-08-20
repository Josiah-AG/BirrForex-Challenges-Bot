"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Trophy, FileText, Settings, RefreshCw,
  LogOut, Loader2, ChevronDown, Calendar, Target, Activity, Shield, Info, X,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

export default function HostDashboardPage() {
  const [isAuth, setIsAuth] = useState(false);
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "participants" | "leaderboard" | "updates" | "rules" | "settings" | "screening">("overview");
  const [loading, setLoading] = useState(true);

  // Tab data
  const [overview, setOverview] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantsPagination, setParticipantsPagination] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [updates, setUpdates] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // CSV upload
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success?: boolean; error?: string; totalRows?: number } | null>(null);
  const [csvStatus, setCsvStatus] = useState<any>(null);

  // Rules state
  const [rulesConfig, setRulesConfig] = useState<any>({
    max_lot_size: 0.02, max_open_trades: 3, pair_limit: 2,
    stop_loss_required: true, max_risk_dollars: 5, max_risk_mode: 'fixed' as 'fixed' | 'percentage',
    max_risk_percent: 10, daily_loss_cap: 10, daily_loss_mode: 'fixed' as 'fixed' | 'percentage',
    daily_loss_percent: 20, max_hold_hours: 24, min_trade_duration_minutes: null as number | null,
    weekend_trading: false, min_active_days: 7, min_total_trades: null as number | null,
    only_cent_account: false,
    rules_enabled: {
      max_lot_size: true, max_open_trades: true, pair_limit: true,
      stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true,
      min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true,
    } as Record<string, boolean>,
  });
  const [rulesLocked, setRulesLocked] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  // Settings state
  const [settingsForm, setSettingsForm] = useState<any>({
    title: "", end_date: "", target_balance: "", target_percent: "",
    prize_pool_text: "", real_winners_count: "", demo_winners_count: "",
    real_prizes: "", demo_prizes: "",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Create challenge modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [createStep, setCreateStep] = useState(1); // 1=details, 2=rules, 3=review
  const [createForm, setCreateForm] = useState({
    title: "", type: "hybrid", start_date: "", end_date: "",
    starting_balance: "30", target_balance: "60", deposit_mode: "fixed",
    target_percent: "100",
    real_winners_count: "3", demo_winners_count: "3",
    real_prizes: "", demo_prizes: "",
    registration_mode: (hostInfo?.hasBrokerIntegration ? "winnerpip" : "manual") as "winnerpip" | "manual",
  });
  const [createRules, setCreateRules] = useState({
    max_lot_size: 0.02, max_open_trades: 3, pair_limit: 2,
    stop_loss_required: true, max_risk_dollars: 5, max_risk_mode: 'fixed' as 'fixed' | 'percentage',
    max_risk_percent: 10, daily_loss_cap: 10, daily_loss_mode: 'fixed' as 'fixed' | 'percentage',
    daily_loss_percent: 20, max_hold_hours: 24, min_trade_duration_minutes: null as number | null,
    weekend_trading: false, min_active_days: 7, min_total_trades: null as number | null,
    only_cent_account: false,
    rules_enabled: {
      max_lot_size: true, max_open_trades: true, pair_limit: true,
      stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true,
      min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true,
    } as Record<string, boolean>,
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const getToken = () => localStorage.getItem("host_token") || "";

  // Auth check on mount
  useEffect(() => {
    const token = localStorage.getItem("host_token");
    const info = localStorage.getItem("host_info");
    if (!token || !info) {
      window.location.href = "/host/login";
      return;
    }

    // Verify token
    fetch(`${API_URL}/api/host/verify-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setHostInfo(data.host);
          setIsAuth(true);
        } else {
          localStorage.removeItem("host_token");
          localStorage.removeItem("host_info");
          window.location.href = "/host/login";
        }
      })
      .catch(() => {
        // Offline — use cached info
        try { setHostInfo(JSON.parse(info)); setIsAuth(true); } catch (_e) { window.location.href = "/host/login"; }
      });
  }, []);

  // Fetch challenges after auth
  useEffect(() => {
    if (!isAuth) return;
    fetch(`${API_URL}/api/host/challenges`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => {
        setChallenges(data.challenges || []);
        if (data.challenges?.length > 0) {
          // Select the most recent active challenge, or first
          const active = data.challenges.find((c: any) => c.status === "active" || c.status === "registration_open");
          setSelectedChallengeId(active?.id || data.challenges[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isAuth]);

  // Fetch tab data when challenge or tab changes
  useEffect(() => {
    if (!selectedChallengeId || !isAuth) return;
    setTabLoading(true);

    const headers = { Authorization: `Bearer ${getToken()}` };

    if (activeTab === "overview") {
      fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/overview`, { headers })
        .then(r => r.json())
        .then(data => { setOverview(data); setTabLoading(false); })
        .catch(() => setTabLoading(false));
    } else if (activeTab === "participants") {
      fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/participants`, { headers })
        .then(r => r.json())
        .then(data => { setParticipants(data.participants || []); setParticipantsPagination(data.pagination); setTabLoading(false); })
        .catch(() => setTabLoading(false));
    } else if (activeTab === "leaderboard") {
      fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers })
        .then(r => r.json())
        .then(data => { setLeaderboard(data.leaderboard || []); setTabLoading(false); })
        .catch(() => setTabLoading(false));
    } else if (activeTab === "updates") {
      fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/updates`, { headers })
        .then(r => r.json())
        .then(data => { setUpdates(data.updates || []); setTabLoading(false); })
        .catch(() => setTabLoading(false));
    } else if (activeTab === "rules") {
      setRulesLoading(true);
      fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, { headers })
        .then(r => r.json())
        .then(data => {
          setRulesLocked(data.locked || false);
          if (data.rules) {
            setRulesConfig({
              max_lot_size: data.rules.max_lot_size ?? 0.02,
              max_open_trades: data.rules.max_open_trades ?? 3,
              pair_limit: data.rules.pair_limit ?? 2,
              stop_loss_required: data.rules.stop_loss_required ?? true,
              max_risk_dollars: data.rules.max_risk_dollars ?? 5,
              max_risk_mode: data.rules.max_risk_mode ?? 'fixed',
              max_risk_percent: data.rules.max_risk_percent ?? 10,
              daily_loss_cap: data.rules.daily_loss_cap ?? 10,
              daily_loss_mode: data.rules.daily_loss_mode ?? 'fixed',
              daily_loss_percent: data.rules.daily_loss_percent ?? 20,
              max_hold_hours: data.rules.max_hold_hours ?? 24,
              min_trade_duration_minutes: data.rules.min_trade_duration_minutes ?? null,
              weekend_trading: data.rules.weekend_trading ?? false,
              min_active_days: data.rules.min_active_days ?? 7,
              min_total_trades: data.rules.min_total_trades ?? null,
              only_cent_account: data.rules.only_cent_account ?? false,
              rules_enabled: data.rules.rules_enabled ?? {
                max_lot_size: true, max_open_trades: true, pair_limit: true,
                stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true,
                min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true,
              },
            });
          }
          setRulesSaved(false);
          setRulesLoading(false);
          setTabLoading(false);
        })
        .catch(() => { setRulesLoading(false); setTabLoading(false); });
    } else if (activeTab === "settings") {
      setSettingsLoading(true);
      // Load current challenge data to populate form
      const ch = challenges.find((c: any) => c.id === selectedChallengeId);
      if (ch) {
        setSettingsForm({
          title: ch.title || "",
          end_date: ch.end_date ? new Date(ch.end_date).toISOString().slice(0, 16) : "",
          target_balance: ch.target_balance ?? "",
          target_percent: ch.target_percent ?? "",
          prize_pool_text: ch.prize_pool_text || "",
          real_winners_count: ch.real_winners_count ?? "",
          demo_winners_count: ch.demo_winners_count ?? "",
          real_prizes: Array.isArray(ch.real_prizes) ? ch.real_prizes.join(", ") : (ch.real_prizes || ""),
          demo_prizes: Array.isArray(ch.demo_prizes) ? ch.demo_prizes.join(", ") : (ch.demo_prizes || ""),
        });
      }
      setSettingsLoading(false);
      setSettingsSaved(false);
      setTabLoading(false);
    }
  }, [selectedChallengeId, activeTab, isAuth]);

  const handleLogout = () => {
    localStorage.removeItem("host_token");
    localStorage.removeItem("host_info");
    window.location.href = "/host/login";
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChallengeId) return;
    setCsvResult(null);
    setCsvUploading(true);

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const header = lines[0].toLowerCase();

      const delimiter = header.includes('\t') ? '\t' : ',';
      const headers = header.split(delimiter).map(h => h.trim().replace(/"/g, ''));

      const nickIdx = headers.findIndex(h => h.includes('nick') || h === 'username' || h === 'name');
      const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('account_type'));
      const acctIdx = headers.findIndex(h => h.includes('account') && !h.includes('type'));
      const srvIdx = headers.findIndex(h => h.includes('server'));
      const pwIdx = headers.findIndex(h => h.includes('password') || h.includes('investor'));

      if (nickIdx < 0 || typeIdx < 0 || acctIdx < 0 || srvIdx < 0 || pwIdx < 0) {
        setCsvResult({ error: 'CSV must have columns: nickname, accountType, accountNumber, server, investorPassword' });
        setCsvUploading(false);
        return;
      }

      const participants: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delimiter).map(c => c.trim().replace(/"/g, ''));
        if (cols.length < 5 || !cols[acctIdx]) continue;
        participants.push({
          nickname: cols[nickIdx],
          accountType: cols[typeIdx]?.toLowerCase(),
          accountNumber: cols[acctIdx],
          server: cols[srvIdx],
          investorPassword: cols[pwIdx],
        });
      }

      if (participants.length === 0) {
        setCsvResult({ error: 'No valid rows found in CSV' });
        setCsvUploading(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/upload-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCsvResult({ success: true, totalRows: data.totalRows });
      } else {
        setCsvResult({ error: data.error || 'Upload failed' });
      }
    } catch (_csvErr) {
      setCsvResult({ error: 'Failed to parse CSV file' });
    }
    setCsvUploading(false);
    e.target.value = '';
  };

  if (!isAuth || loading) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-royal animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const selectedChallenge = challenges.find(c => c.id === selectedChallengeId);

  return (
    <div className="min-h-screen bg-[#0a0e1a] relative">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-royal/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-gold/5 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="glass border-b border-white/5 sticky top-0 z-50 backdrop-blur-xl">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between max-w-7xl">
          <div className="flex items-center gap-3">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={32} height={32} className="rounded-lg" />
            <div>
              <p className="text-sm font-bold text-white leading-tight">{hostInfo?.displayName || "Host"}</p>
              <p className="text-[10px] text-royal/80 font-semibold tracking-wider">HOST DASHBOARD</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAccountSettings(!showAccountSettings)} className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs font-medium ${showAccountSettings ? 'text-royal bg-royal/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <Settings size={14} /> Settings
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-loss hover:bg-loss/10 rounded-lg transition-all text-xs font-medium">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Account Settings Panel */}
      {showAccountSettings && (
        <div className="container mx-auto px-4 sm:px-6 py-6 max-w-2xl relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Account Settings</h2>
            <button onClick={() => setShowAccountSettings(false)} className="text-xs text-gray-400 hover:text-white transition-all">Back to Dashboard</button>
          </div>
          <BrokerCredentialsSection />
        </div>
      )}

      {!showAccountSettings && (
      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-7xl relative">
        {/* Challenge Selector */}
        {challenges.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative">
                <select
                  value={selectedChallengeId || ""}
                  onChange={(e) => setSelectedChallengeId(parseInt(e.target.value))}
                  className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm font-medium outline-none focus:border-royal/40 cursor-pointer min-w-[180px]"
                >
                  {challenges.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#0f1629]">
                      {c.title} ({c.status})
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              </div>
              {selectedChallenge && (
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${selectedChallenge.status === 'active' ? 'bg-profit/20 text-profit border border-profit/30' : selectedChallenge.status === 'registration_open' ? 'bg-gold/20 text-gold border border-gold/30' : selectedChallenge.status === 'pending_approval' ? 'bg-royal/20 text-royal border border-royal/30' : selectedChallenge.status === 'rejected' ? 'bg-loss/20 text-loss border border-loss/30' : 'bg-white/10 text-gray-400 border border-white/20'}`}>
                  {selectedChallenge.status === 'active' ? 'Active' : selectedChallenge.status === 'registration_open' ? 'Registration Open' : selectedChallenge.status === 'pending_approval' ? 'Pending Approval' : selectedChallenge.status === 'rejected' ? 'Rejected' : selectedChallenge.status}
                </span>
              )}
            </div>
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); }} className="px-4 py-2 rounded-xl bg-royal/20 text-royal text-sm font-semibold border border-royal/30 hover:bg-royal/30 transition-all whitespace-nowrap">+ New Challenge</button>
          </div>
        )}

        {/* No challenges */}
        {challenges.length === 0 && (<>
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
              <Trophy className="w-10 h-10 text-gray-600" />
            </div>
            <p className="text-gray-300 text-lg font-semibold">No challenges yet</p>
            <p className="text-gray-500 text-sm mt-2 max-w-sm mx-auto">Your challenges will appear here once created and approved by admin.</p>
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal text-white font-semibold text-sm hover:bg-royal/80 transition-all">Create Challenge</button>
          </div>
        </>)}

        {/* Tab Navigation */}
        {selectedChallengeId && (
          <>
            <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto scrollbar-hide">
              {[
                { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
                { key: "participants", label: "Participants", icon: <Users size={14} /> },
                { key: "leaderboard", label: "Leaderboard", icon: <Trophy size={14} /> },
                { key: "rules", label: "Rules", icon: <Shield size={14} /> },
                { key: "settings", label: "Settings", icon: <Settings size={14} /> },
                ...(hostInfo?.hasBrokerIntegration ? [{ key: "screening", label: "Screening", icon: <Target size={14} /> }] : []),
                { key: "updates", label: "Updates", icon: <RefreshCw size={14} /> },
              ].map((tab: any) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {tabLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 text-royal animate-spin" />
                  <p className="text-xs text-gray-500">Loading data...</p>
                </div>
              </div>
            ) : (
              <>
                {/* OVERVIEW TAB */}
                {activeTab === "overview" && overview && (
                  <div className="space-y-5">
                    {/* Challenge Info */}
                    <div className="glass rounded-2xl border border-white/10 p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-royal" /> Challenge Overview</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Participants</p>
                          <p className="text-2xl font-bold text-white">{overview.participants.total}</p>
                          <p className="text-[10px] text-gray-500 mt-1">Real: {overview.participants.real} · Demo: {overview.participants.demo}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Qualified</p>
                          <p className="text-2xl font-bold text-profit">{overview.leaderboard.qualified}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Disqualified</p>
                          <p className="text-2xl font-bold text-loss">{overview.participants.disqualified}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Last Update</p>
                          <p className="text-sm font-semibold text-white">{overview.lastUpdateAt ? new Date(new Date(overview.lastUpdateAt).getTime() + 3*60*60*1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " EAT" : "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Challenge Details */}
                    <div className="glass rounded-2xl border border-white/10 p-5">
                      <h3 className="text-sm font-semibold text-white mb-4">Challenge Details</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"><Calendar size={14} className="text-gray-500 flex-shrink-0" /><span className="text-gray-400">Period:</span><span className="text-white font-medium">{new Date(overview.challenge.startDate).toLocaleDateString()} — {new Date(overview.challenge.endDate).toLocaleDateString()}</span></div>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"><Target size={14} className="text-gray-500 flex-shrink-0" /><span className="text-gray-400">Target:</span><span className="text-white font-medium">{overview.challenge.depositMode !== 'fixed' ? `${overview.challenge.targetPercent}% growth` : `$${overview.challenge.targetBalance}`}</span></div>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"><Activity size={14} className="text-gray-500 flex-shrink-0" /><span className="text-gray-400">Type:</span><span className="text-white font-medium capitalize">{overview.challenge.type}</span></div>
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"><FileText size={14} className="text-gray-500 flex-shrink-0" /><span className="text-gray-400">Status:</span><span className="text-white font-medium capitalize">{overview.challenge.status}</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PARTICIPANTS TAB */}
                {activeTab === "participants" && (<>
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-royal" /> Participants ({participantsPagination?.total || participants.length})</h3>
                    {participants.length === 0 ? (
                      <div className="text-center py-12">
                        <Users className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No participants registered yet</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/10">
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">Nickname</th>
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">Account</th>
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">Type</th>
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                              <th className="text-left py-2 px-3 text-gray-500 font-medium">Registered</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participants.map((p: any) => (
                              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                                <td className="py-2.5 px-3 text-white font-medium">{p.nickname}</td>
                                <td className="py-2.5 px-3 text-gray-300">{p.accountNumber}</td>
                                <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.accountType === 'real' ? 'bg-gold/20 text-gold' : 'bg-royal/20 text-royal'}`}>{p.accountType}</span></td>
                                <td className="py-2.5 px-3">{p.disqualified ? <span className="text-loss text-xs font-semibold">DQ</span> : p.connectionVerified ? <span className="text-profit text-xs">Connected</span> : <span className="text-gray-500 text-xs">Pending</span>}</td>
                                <td className="py-2.5 px-3 text-gray-500 text-xs">{new Date(p.registeredAt).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* CSV Upload Section */}
                  <div className="glass rounded-2xl border border-white/10 p-5 mt-5">
                    <h3 className="text-sm font-semibold text-white mb-2">Upload Participants (CSV)</h3>
                    <p className="text-xs text-gray-500 mb-4">CSV columns: nickname, accountType (demo/real), accountNumber, server, investorPassword</p>

                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleCsvUpload(e)}
                      disabled={csvUploading}
                      className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-royal/20 file:text-royal hover:file:bg-royal/30 file:cursor-pointer cursor-pointer disabled:opacity-50"
                    />

                    {csvUploading && <p className="text-xs text-royal mt-3 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Parsing and uploading...</p>}
                    {csvResult?.success && <p className="text-xs text-profit mt-3">{csvResult.totalRows} participants uploaded. Awaiting admin approval.</p>}
                    {csvResult?.error && <p className="text-xs text-loss mt-3">{csvResult.error}</p>}
                  </div>
                </>)}

                {/* LEADERBOARD TAB */}
                {activeTab === "leaderboard" && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Trophy size={16} className="text-gold" /> Leaderboard</h3>
                    {leaderboard.length === 0 ? (
                      <div className="text-center py-12">
                        <Trophy className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Leaderboard will appear after the first data update</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {leaderboard.map((entry: any) => (
                          <div key={entry.nickname} className={`flex items-center justify-between p-3 rounded-xl ${entry.isDisqualified ? 'bg-loss/5 border border-loss/20' : 'bg-white/5 border border-white/10'}`}>
                            <div className="flex items-center gap-3">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${entry.rank === 1 ? 'bg-gold/20 text-gold' : entry.rank === 2 ? 'bg-gray-300/20 text-gray-300' : entry.rank === 3 ? 'bg-amber-700/20 text-amber-600' : 'bg-white/5 text-gray-500'}`}>
                                {entry.isDisqualified ? 'DQ' : `#${entry.rank || '—'}`}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-white">{entry.nickname}</p>
                                <p className="text-[10px] text-gray-500">{entry.totalTrades} trades • {entry.flaggedTrades} flagged • {entry.accountType}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{entry.growthPercent > 0 ? `↑ ${entry.growthPercent.toFixed(1)}%` : entry.isCent ? `${entry.adjustedBalance.toFixed(0)}¢` : `$${entry.adjustedBalance.toFixed(2)}`}</p>
                              {entry.isDisqualified && <p className="text-[10px] text-loss">{entry.disqualifyReason}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === "settings" && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Settings size={16} className="text-royal" /> Challenge Settings</h3>
                    <p className="text-xs text-gray-500 mb-5">Edit your challenge details. Changes take effect immediately.</p>

                    {settingsLoading ? (
                      <div className="flex justify-center py-12"><Loader2 className="animate-spin text-royal" size={20} /></div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Challenge Title</label>
                          <input type="text" value={settingsForm.title} onChange={e => setSettingsForm((p: any) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
                        </div>

                        <div>
                          <label className="block text-xs text-gray-400 mb-1">End Date</label>
                          <input type="datetime-local" value={settingsForm.end_date} onChange={e => setSettingsForm((p: any) => ({ ...p, end_date: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Target Balance ($)</label>
                            <input type="number" step="0.01" value={settingsForm.target_balance} onChange={e => setSettingsForm((p: any) => ({ ...p, target_balance: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="e.g. 60" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Target Growth (%)</label>
                            <input type="number" step="1" value={settingsForm.target_percent} onChange={e => setSettingsForm((p: any) => ({ ...p, target_percent: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="e.g. 100" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Prize Pool Text</label>
                          <input type="text" value={settingsForm.prize_pool_text} onChange={e => setSettingsForm((p: any) => ({ ...p, prize_pool_text: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="e.g. $1,000 Total" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Real Winners Count</label>
                            <input type="number" min="0" value={settingsForm.real_winners_count} onChange={e => setSettingsForm((p: any) => ({ ...p, real_winners_count: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Demo Winners Count</label>
                            <input type="number" min="0" value={settingsForm.demo_winners_count} onChange={e => setSettingsForm((p: any) => ({ ...p, demo_winners_count: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Real Prizes (comma separated)</label>
                            <input type="text" value={settingsForm.real_prizes} onChange={e => setSettingsForm((p: any) => ({ ...p, real_prizes: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="500, 300, 200" />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Demo Prizes (comma separated)</label>
                            <input type="text" value={settingsForm.demo_prizes} onChange={e => setSettingsForm((p: any) => ({ ...p, demo_prizes: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="300, 200, 100" />
                          </div>
                        </div>

                        {/* Save button */}
                        <div className="pt-4 flex items-center gap-3">
                          <button
                            onClick={async () => {
                              setSettingsSaving(true);
                              try {
                                const payload: any = {};
                                if (settingsForm.title) payload.title = settingsForm.title;
                                if (settingsForm.end_date) payload.end_date = settingsForm.end_date;
                                if (settingsForm.target_balance) payload.target_balance = parseFloat(settingsForm.target_balance);
                                if (settingsForm.target_percent) payload.target_percent = parseFloat(settingsForm.target_percent);
                                if (settingsForm.prize_pool_text) payload.prize_pool_text = settingsForm.prize_pool_text;
                                if (settingsForm.real_winners_count !== "") payload.real_winners_count = parseInt(settingsForm.real_winners_count) || 0;
                                if (settingsForm.demo_winners_count !== "") payload.demo_winners_count = parseInt(settingsForm.demo_winners_count) || 0;
                                if (settingsForm.real_prizes) payload.real_prizes = settingsForm.real_prizes.split(",").map((s: string) => s.trim()).filter(Boolean);
                                if (settingsForm.demo_prizes) payload.demo_prizes = settingsForm.demo_prizes.split(",").map((s: string) => s.trim()).filter(Boolean);

                                const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/settings`, {
                                  method: "PUT",
                                  headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                                  body: JSON.stringify(payload),
                                });
                                if (res.ok) setSettingsSaved(true);
                              } catch {}
                              setSettingsSaving(false);
                              setTimeout(() => setSettingsSaved(false), 3000);
                            }}
                            disabled={settingsSaving}
                            className="px-6 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold hover:bg-royal/80 disabled:opacity-50 transition-all flex items-center gap-2"
                          >
                            {settingsSaving ? <Loader2 size={14} className="animate-spin" /> : null} Save Settings
                          </button>
                          {settingsSaved && <span className="text-sm text-profit font-medium">✓ Saved</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SCREENING TAB */}
                {activeTab === "screening" && (
                  <ScreeningTab challengeId={selectedChallengeId!} getToken={getToken} />
                )}

                {/* UPDATES TAB */}
                {activeTab === "updates" && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><RefreshCw size={16} className="text-royal" /> Data Updates</h3>
                    {updates.length === 0 ? (
                      <div className="text-center py-12">
                        <RefreshCw className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">No updates yet</p>
                        <p className="text-gray-600 text-xs mt-1">Data updates run automatically 6 times per day.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {updates.map((u: any) => (
                          <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${u.status === 'completed' ? 'bg-profit' : u.status === 'running' ? 'bg-gold animate-pulse' : 'bg-loss'}`}></div>
                              <div>
                                <p className="text-sm text-white font-medium">Update #{u.updateNumber}</p>
                                <p className="text-[10px] text-gray-500">{new Date(new Date(u.startedAt).getTime() + 3*60*60*1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} EAT</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-profit font-semibold">{u.successful} OK</span>
                              {u.failed > 0 && <span className="text-loss font-semibold">{u.failed} failed</span>}
                              <span className="text-gray-500">{u.totalAccounts} accounts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* RULES TAB */}
                {activeTab === "rules" && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Shield size={16} className="text-royal" /> Rule Configuration</h3>
                    <p className="text-xs text-gray-500 mb-5">{rulesLocked ? "Rules are locked — challenge has already started." : "Configure the evaluation rules for your challenge. Rules can only be changed before the challenge starts."}</p>

                    {rulesLoading ? (
                      <div className="flex justify-center py-12"><Loader2 className="animate-spin text-royal" size={20} /></div>
                    ) : (
                      <div className="space-y-4">
                        {/* Max Lot Size */}
                        <RuleRow label="Max Lot Size" tooltip="Maximum position size allowed per trade" enabled={rulesConfig.rules_enabled.max_lot_size} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, max_lot_size: v } }))} locked={rulesLocked}>
                          <input type="number" step="0.01" min="0.01" value={rulesConfig.max_lot_size} onChange={e => setRulesConfig((p: any) => ({ ...p, max_lot_size: parseFloat(e.target.value) || 0 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.max_lot_size} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                        </RuleRow>

                        {/* Max Open Trades */}
                        <RuleRow label="Max Open Trades" tooltip="Maximum number of positions open simultaneously" enabled={rulesConfig.rules_enabled.max_open_trades} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, max_open_trades: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.max_open_trades} onChange={e => setRulesConfig((p: any) => ({ ...p, max_open_trades: parseInt(e.target.value) || 1 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.max_open_trades} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                        </RuleRow>

                        {/* Pair Limit */}
                        <RuleRow label="Pair Limit" tooltip="Max number of different instruments tradeable at the same time" enabled={rulesConfig.rules_enabled.pair_limit} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, pair_limit: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.pair_limit} onChange={e => setRulesConfig((p: any) => ({ ...p, pair_limit: parseInt(e.target.value) || 1 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.pair_limit} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                        </RuleRow>

                        {/* Stop Loss Required + Max Risk */}
                        <RuleRow label="Stop Loss Required" tooltip="Every trade must have a stop-loss set. Max risk limits the loss per trade." enabled={rulesConfig.rules_enabled.stop_loss_required} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, stop_loss_required: v } }))} locked={rulesLocked}>
                          <div className="flex items-center gap-2">
                            <div className="flex rounded-lg overflow-hidden border border-white/10">
                              <button onClick={() => setRulesConfig((p: any) => ({ ...p, max_risk_mode: 'fixed' }))} className={`px-2 py-1 text-[10px] font-bold transition-all ${rulesConfig.max_risk_mode === 'fixed' ? 'bg-royal/20 text-royal' : 'bg-white/5 text-gray-500'}`} disabled={rulesLocked || !rulesConfig.rules_enabled.stop_loss_required}>Fixed $</button>
                              <button onClick={() => setRulesConfig((p: any) => ({ ...p, max_risk_mode: 'percentage' }))} className={`px-2 py-1 text-[10px] font-bold transition-all ${rulesConfig.max_risk_mode === 'percentage' ? 'bg-royal/20 text-royal' : 'bg-white/5 text-gray-500'}`} disabled={rulesLocked || !rulesConfig.rules_enabled.stop_loss_required}>% Balance</button>
                            </div>
                            {rulesConfig.max_risk_mode === 'fixed' ? (
                              <input type="number" step="0.5" min="0" value={rulesConfig.max_risk_dollars} onChange={e => setRulesConfig((p: any) => ({ ...p, max_risk_dollars: parseFloat(e.target.value) || 0 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.stop_loss_required} className="w-20 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                            ) : (
                              <input type="number" step="1" min="1" max="100" value={rulesConfig.max_risk_percent} onChange={e => setRulesConfig((p: any) => ({ ...p, max_risk_percent: parseFloat(e.target.value) || 0 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.stop_loss_required} className="w-20 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                            )}
                          </div>
                        </RuleRow>

                        {/* Daily Loss Cap */}
                        <RuleRow label="Daily Loss Cap" tooltip="Maximum loss allowed in a single day. Exceeding triggers DQ." enabled={rulesConfig.rules_enabled.daily_loss_cap} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, daily_loss_cap: v } }))} locked={rulesLocked}>
                          <div className="flex items-center gap-2">
                            <div className="flex rounded-lg overflow-hidden border border-white/10">
                              <button onClick={() => setRulesConfig((p: any) => ({ ...p, daily_loss_mode: 'fixed' }))} className={`px-2 py-1 text-[10px] font-bold transition-all ${rulesConfig.daily_loss_mode === 'fixed' ? 'bg-royal/20 text-royal' : 'bg-white/5 text-gray-500'}`} disabled={rulesLocked || !rulesConfig.rules_enabled.daily_loss_cap}>Fixed $</button>
                              <button onClick={() => setRulesConfig((p: any) => ({ ...p, daily_loss_mode: 'percentage' }))} className={`px-2 py-1 text-[10px] font-bold transition-all ${rulesConfig.daily_loss_mode === 'percentage' ? 'bg-royal/20 text-royal' : 'bg-white/5 text-gray-500'}`} disabled={rulesLocked || !rulesConfig.rules_enabled.daily_loss_cap}>% Balance</button>
                            </div>
                            {rulesConfig.daily_loss_mode === 'fixed' ? (
                              <input type="number" step="0.5" min="0" value={rulesConfig.daily_loss_cap} onChange={e => setRulesConfig((p: any) => ({ ...p, daily_loss_cap: parseFloat(e.target.value) || 0 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.daily_loss_cap} className="w-20 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                            ) : (
                              <input type="number" step="1" min="1" max="100" value={rulesConfig.daily_loss_percent} onChange={e => setRulesConfig((p: any) => ({ ...p, daily_loss_percent: parseFloat(e.target.value) || 0 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.daily_loss_cap} className="w-20 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                            )}
                          </div>
                        </RuleRow>

                        {/* Max Hold Hours */}
                        <RuleRow label="Max Hold Hours" tooltip="Maximum time a trade can be held open" enabled={rulesConfig.rules_enabled.max_hold_hours} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, max_hold_hours: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.max_hold_hours} onChange={e => setRulesConfig((p: any) => ({ ...p, max_hold_hours: parseInt(e.target.value) || 1 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.max_hold_hours} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                        </RuleRow>

                        {/* Min Trade Duration */}
                        <RuleRow label="Min Trade Duration (min)" tooltip="Trades held shorter than this many minutes are flagged" enabled={rulesConfig.rules_enabled.min_trade_duration} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, min_trade_duration: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.min_trade_duration_minutes ?? ""} onChange={e => setRulesConfig((p: any) => ({ ...p, min_trade_duration_minutes: e.target.value ? parseInt(e.target.value) : null }))} disabled={rulesLocked || !rulesConfig.rules_enabled.min_trade_duration} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" placeholder="—" />
                        </RuleRow>

                        {/* Weekend Trading */}
                        <RuleRow label="Weekend Trading" tooltip="Whether trades opened/held over weekends are allowed" enabled={rulesConfig.rules_enabled.weekend_trading} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, weekend_trading: v } }))} locked={rulesLocked}>
                          <button onClick={() => setRulesConfig((p: any) => ({ ...p, weekend_trading: !p.weekend_trading }))} disabled={rulesLocked || !rulesConfig.rules_enabled.weekend_trading} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${rulesConfig.weekend_trading ? 'bg-profit/20 text-profit border-profit/30' : 'bg-loss/20 text-loss border-loss/30'} disabled:opacity-40`}>{rulesConfig.weekend_trading ? "Allowed" : "Blocked"}</button>
                        </RuleRow>

                        {/* Min Active Days */}
                        <RuleRow label="Min Active Days" tooltip="Minimum number of unique trading days required to qualify" enabled={rulesConfig.rules_enabled.min_active_days} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, min_active_days: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.min_active_days} onChange={e => setRulesConfig((p: any) => ({ ...p, min_active_days: parseInt(e.target.value) || 1 }))} disabled={rulesLocked || !rulesConfig.rules_enabled.min_active_days} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" />
                        </RuleRow>

                        {/* Min Total Trades */}
                        <RuleRow label="Min Total Trades" tooltip="Minimum number of trades needed to qualify" enabled={rulesConfig.rules_enabled.min_total_trades} onToggle={(v) => setRulesConfig((p: any) => ({ ...p, rules_enabled: { ...p.rules_enabled, min_total_trades: v } }))} locked={rulesLocked}>
                          <input type="number" min="1" value={rulesConfig.min_total_trades ?? ""} onChange={e => setRulesConfig((p: any) => ({ ...p, min_total_trades: e.target.value ? parseInt(e.target.value) : null }))} disabled={rulesLocked || !rulesConfig.rules_enabled.min_total_trades} className="w-24 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm outline-none disabled:opacity-40" placeholder="—" />
                        </RuleRow>

                        {/* Only Cent Account */}
                        <div className="flex items-center justify-between py-3 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-300">Only Cent Account</span>
                            <span className="relative group"><Info size={12} className="text-gray-600 cursor-help" /><span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-black/90 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">Only accounts with cent balance are accepted</span></span>
                          </div>
                          <button onClick={() => setRulesConfig((p: any) => ({ ...p, only_cent_account: !p.only_cent_account }))} disabled={rulesLocked} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${rulesConfig.only_cent_account ? 'bg-profit/20 text-profit border-profit/30' : 'bg-white/5 text-gray-500 border-white/10'} disabled:opacity-40`}>{rulesConfig.only_cent_account ? "Yes" : "No"}</button>
                        </div>

                        {/* Save button */}
                        {!rulesLocked && (
                          <div className="pt-4 flex items-center gap-3">
                            <button
                              onClick={async () => {
                                setRulesSaving(true);
                                try {
                                  const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, {
                                    method: "PUT",
                                    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
                                    body: JSON.stringify(rulesConfig),
                                  });
                                  if (res.ok) setRulesSaved(true);
                                } catch {}
                                setRulesSaving(false);
                                setTimeout(() => setRulesSaved(false), 3000);
                              }}
                              disabled={rulesSaving}
                              className="px-6 py-2.5 rounded-xl bg-royal text-white text-sm font-semibold hover:bg-royal/80 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                              {rulesSaving ? <Loader2 size={14} className="animate-spin" /> : null} Save Rules
                            </button>
                            {rulesSaved && <span className="text-sm text-profit font-medium">✓ Saved</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      )}

      {/* Create Challenge Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-[#0a0e1a]/95 z-50 flex items-center justify-center p-4" onClick={() => !createLoading && setShowCreateModal(false)}>
          <div className="bg-[#1a2235] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-white/15 shadow-2xl shadow-black/80" onClick={e => e.stopPropagation()}>
            {/* Header + Progress */}
            <div className="sticky top-0 bg-[#1a2235] px-6 pt-5 pb-4 border-b border-white/10 z-10 rounded-t-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Create Challenge</h3>
                <button onClick={() => !createLoading && setShowCreateModal(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all"><X size={16} className="text-gray-500" /></button>
              </div>
              <div className="flex items-center gap-2">
                {[1,2,3].map(s => (
                  <div key={s} className="flex-1 flex items-center gap-2">
                    <div className={`flex-1 h-1.5 rounded-full transition-all ${s <= createStep ? "bg-royal" : "bg-white/10"}`} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2">
                <span className={`text-[10px] font-medium ${createStep >= 1 ? 'text-royal' : 'text-gray-600'}`}>Details</span>
                <span className={`text-[10px] font-medium ${createStep >= 2 ? 'text-royal' : 'text-gray-600'}`}>Rules</span>
                <span className={`text-[10px] font-medium ${createStep >= 3 ? 'text-royal' : 'text-gray-600'}`}>Review</span>
              </div>
            </div>

            <div className="px-6 py-5">
              {createResult?.success ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 rounded-full bg-profit/20 border border-profit/30 flex items-center justify-center mx-auto mb-4">
                    <Trophy size={24} className="text-profit" />
                  </div>
                  <p className="text-profit font-bold text-lg mb-2">Submitted for Approval</p>
                  <p className="text-gray-400 text-sm">Admin will review and approve your challenge. You will see it in your dashboard once approved.</p>
                  <button onClick={() => { setShowCreateModal(false); setCreateStep(1); window.location.reload(); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal/20 text-royal font-semibold text-sm border border-royal/30">Done</button>
                </div>
              ) : (<>
                {/* Step 1: Details */}
                {createStep === 1 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-4">Challenge Details</h3>
                    <div className="space-y-4">
                      <div><label className="text-xs text-gray-400 font-medium mb-1 block">Title *</label><input value={createForm.title} onChange={e => setCreateForm({...createForm, title: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-royal/50 outline-none" placeholder="Challenge 1 - Hybrid" /></div>
                      <div><label className="text-xs text-gray-400 font-medium mb-1 block">Type *</label>
                        <select value={createForm.type} onChange={e => setCreateForm({...createForm, type: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:border-royal/50 outline-none">
                          <option value="hybrid" className="bg-[#0f1629]">Hybrid (Demo + Real)</option>
                          <option value="demo" className="bg-[#0f1629]">Demo Only</option>
                          <option value="real" className="bg-[#0f1629]">Real Only</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="text-xs text-gray-400 font-medium mb-1 block">Start Date &amp; Time (EAT) *</label><input type="datetime-local" value={createForm.start_date} onChange={e => setCreateForm({...createForm, start_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                        <div><label className="text-xs text-gray-400 font-medium mb-1 block">End Date &amp; Time (EAT) *</label><input type="datetime-local" value={createForm.end_date} onChange={e => setCreateForm({...createForm, end_date: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                      </div>
                      <p className="text-[10px] text-gray-500 -mt-2">Registration closes automatically when challenge starts</p>
                      {/* Deposit Mode */}
                      <div>
                        <label className="text-xs text-gray-400 font-medium mb-1 block">Deposit Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'fixed'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'fixed' ? 'border-royal bg-royal/10 text-royal' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Fixed Deposit</button>
                          <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'max_limit'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'max_limit' ? 'border-gold bg-gold/10 text-gold' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Max Limit</button>
                          <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'min_limit'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'min_limit' ? 'border-profit bg-profit/10 text-profit' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Min Limit</button>
                        </div>
                        <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
                          {createForm.deposit_mode === 'fixed' && <p className="text-[11px] text-gray-400"><span className="text-royal font-semibold">Fixed Deposit:</span> All participants start with the same balance. Target is a fixed dollar amount. Leaderboard ranked by balance. <span className="text-gray-500 italic">Best for equal-start competitions.</span></p>}
                          {createForm.deposit_mode === 'max_limit' && <p className="text-[11px] text-gray-400"><span className="text-gold font-semibold">Max Limit:</span> Participants can deposit any amount up to a maximum cap. Target is in growth %. SL and drawdown rules must be in %. Leaderboard ranked by account growth %. <span className="text-gray-500 italic">Best for flexible-entry challenges.</span></p>}
                          {createForm.deposit_mode === 'min_limit' && <p className="text-[11px] text-gray-400"><span className="text-profit font-semibold">Min Limit:</span> Participants must deposit at least a minimum amount — no upper limit. Target is in growth %. SL and drawdown rules must be in %. Leaderboard ranked by account growth %. <span className="text-gray-500 italic">Best for serious traders.</span></p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-xs text-gray-400 font-medium mb-1 block">{createForm.deposit_mode === 'fixed' ? 'Starting Balance ($) *' : createForm.deposit_mode === 'max_limit' ? 'Maximum Deposit ($) *' : 'Minimum Deposit ($) *'}</label><input value={createForm.starting_balance} onChange={e => setCreateForm({...createForm, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                        {createForm.deposit_mode === 'fixed' ? (
                          <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Balance ($)</label><input value={createForm.target_balance} onChange={e => setCreateForm({...createForm, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                        ) : (
                          <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Growth (%)</label><input value={createForm.target_percent} onChange={e => setCreateForm({...createForm, target_percent: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="e.g., 100" /></div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {createForm.type !== "demo" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Real Winners #</label><input value={createForm.real_winners_count} onChange={e => setCreateForm({...createForm, real_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>}
                        {createForm.type !== "real" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Demo Winners #</label><input value={createForm.demo_winners_count} onChange={e => setCreateForm({...createForm, demo_winners_count: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>}
                      </div>
                      {createForm.type !== "demo" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Real Prizes (comma-separated $)</label><input value={createForm.real_prizes} onChange={e => setCreateForm({...createForm, real_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="500,300,200" /></div>}
                      {createForm.type !== "real" && <div><label className="text-xs text-gray-400 font-medium mb-1 block">Demo Prizes (comma-separated $)</label><input value={createForm.demo_prizes} onChange={e => setCreateForm({...createForm, demo_prizes: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="300,200,100" /></div>}

                      {/* Registration Mode */}
                      <div>
                        <label className="text-xs text-gray-400 font-medium mb-1 block">Registration Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setCreateForm({...createForm, registration_mode: 'winnerpip'})} disabled={!hostInfo?.hasBrokerIntegration} className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.registration_mode === 'winnerpip' ? 'border-royal bg-royal/10 text-royal' : 'border-white/20 text-gray-400 hover:border-white/30'} ${!hostInfo?.hasBrokerIntegration ? 'opacity-40 cursor-not-allowed' : ''}`}>
                            Online Registration
                          </button>
                          <button type="button" onClick={() => setCreateForm({...createForm, registration_mode: 'manual'})} className={`p-3 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.registration_mode === 'manual' ? 'border-gold bg-gold/10 text-gold' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>
                            Manual (CSV Upload)
                          </button>
                        </div>
                        {!hostInfo?.hasBrokerIntegration && (
                          <div className="mt-2 p-2.5 rounded-lg bg-gold/5 border border-gold/10">
                            <p className="text-[11px] text-gray-400">Online registration requires broker integration. <button onClick={() => { setShowCreateModal(false); setShowAccountSettings(true); }} className="text-gold font-semibold hover:underline">Set up broker integration</button> to let participants register through WinnerPip.</p>
                          </div>
                        )}
                        {hostInfo?.hasBrokerIntegration && createForm.registration_mode === 'winnerpip' && (
                          <p className="text-[10px] text-gray-500 mt-2">Participants will register via the WinnerPip website. Accounts are verified automatically.</p>
                        )}
                        {createForm.registration_mode === 'manual' && (
                          <p className="text-[10px] text-gray-500 mt-2">You will upload participant accounts as a CSV after the challenge is created.</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setCreateStep(2)} disabled={!createForm.title || !createForm.start_date || !createForm.end_date} className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all disabled:opacity-50 mt-6">Next: Rules</button>
                  </div>
                )}

                {/* Step 2: Rules */}
                {createStep === 2 && (
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Challenge Rules</h3>
                    <p className="text-xs text-gray-500 mb-4">Toggle rules ON/OFF. Hover &#9432; for details. Disabled rules won&apos;t be enforced during evaluation.</p>
                    <div className="space-y-2">
                      <CreateRuleRow label="Max Lot Size" tooltip="Limits the maximum lot size per position. Trades exceeding this have profits removed." enabled={createRules.rules_enabled.max_lot_size} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, max_lot_size: !p.rules_enabled.max_lot_size}}))}>
                        <input type="number" step="0.01" value={createRules.max_lot_size} onChange={e => setCreateRules(p => ({...p, max_lot_size: parseFloat(e.target.value)||0}))} disabled={!createRules.rules_enabled.max_lot_size} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Max Open Trades" tooltip="Limits simultaneous open trades. All overlapping trades get flagged when exceeded." enabled={createRules.rules_enabled.max_open_trades} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, max_open_trades: !p.rules_enabled.max_open_trades}}))}>
                        <input type="number" value={createRules.max_open_trades} onChange={e => setCreateRules(p => ({...p, max_open_trades: parseInt(e.target.value)||1}))} disabled={!createRules.rules_enabled.max_open_trades} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Pair Limit" tooltip="Max trades on the same pair open at once. Prevents overexposure to a single instrument." enabled={createRules.rules_enabled.pair_limit} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, pair_limit: !p.rules_enabled.pair_limit}}))}>
                        <input type="number" value={createRules.pair_limit} onChange={e => setCreateRules(p => ({...p, pair_limit: parseInt(e.target.value)||1}))} disabled={!createRules.rules_enabled.pair_limit} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Max Risk" tooltip="Max risk per trade measured by SL distance. Fixed = same $ amount for all trades. Percentage = calculated from account balance at the time each trade is opened." enabled={createRules.rules_enabled.stop_loss_required} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, stop_loss_required: !p.rules_enabled.stop_loss_required}}))}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCreateRules(p => ({...p, max_risk_mode: 'fixed'}))} className={`px-2 py-1 text-[9px] font-bold rounded border ${createRules.max_risk_mode === 'fixed' ? 'bg-profit/20 text-profit border-profit/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>Fixed</button>
                          <button onClick={() => setCreateRules(p => ({...p, max_risk_mode: 'percentage'}))} className={`px-2 py-1 text-[9px] font-bold rounded border ${createRules.max_risk_mode === 'percentage' ? 'bg-profit/20 text-profit border-profit/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>%Balance</button>
                          <input type="number" step="0.5" value={createRules.max_risk_mode === 'percentage' ? createRules.max_risk_percent : createRules.max_risk_dollars} onChange={e => createRules.max_risk_mode === 'percentage' ? setCreateRules(p => ({...p, max_risk_percent: parseFloat(e.target.value)||0})) : setCreateRules(p => ({...p, max_risk_dollars: parseFloat(e.target.value)||0}))} disabled={!createRules.rules_enabled.stop_loss_required} className="w-14 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                        </div>
                      </CreateRuleRow>
                      <CreateRuleRow label="Daily Loss Cap" tooltip="Max drawdown from day's opening balance. Fixed = same $ cap every day. Percentage = calculated from each day's opening balance (scales with account growth)." enabled={createRules.rules_enabled.daily_loss_cap} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, daily_loss_cap: !p.rules_enabled.daily_loss_cap}}))}>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCreateRules(p => ({...p, daily_loss_mode: 'fixed'}))} className={`px-2 py-1 text-[9px] font-bold rounded border ${createRules.daily_loss_mode === 'fixed' ? 'bg-profit/20 text-profit border-profit/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>Fixed</button>
                          <button onClick={() => setCreateRules(p => ({...p, daily_loss_mode: 'percentage'}))} className={`px-2 py-1 text-[9px] font-bold rounded border ${createRules.daily_loss_mode === 'percentage' ? 'bg-profit/20 text-profit border-profit/30' : 'bg-white/5 text-gray-500 border-white/10'}`}>%Balance</button>
                          <input type="number" step="0.5" value={createRules.daily_loss_mode === 'percentage' ? createRules.daily_loss_percent : createRules.daily_loss_cap} onChange={e => createRules.daily_loss_mode === 'percentage' ? setCreateRules(p => ({...p, daily_loss_percent: parseFloat(e.target.value)||0})) : setCreateRules(p => ({...p, daily_loss_cap: parseFloat(e.target.value)||0}))} disabled={!createRules.rules_enabled.daily_loss_cap} className="w-14 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                        </div>
                      </CreateRuleRow>
                      <CreateRuleRow label="Max Hold Hours" tooltip="Max time a trade can be held. Exceeding this flags the trade. Encourages active intraday trading." enabled={createRules.rules_enabled.max_hold_hours} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, max_hold_hours: !p.rules_enabled.max_hold_hours}}))}>
                        <input type="number" value={createRules.max_hold_hours} onChange={e => setCreateRules(p => ({...p, max_hold_hours: parseInt(e.target.value)||1}))} disabled={!createRules.rules_enabled.max_hold_hours} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Min Trade Duration (min)" tooltip="Minimum time a trade must be held. Trades closed faster than this are flagged and profits removed. Prevents ultra-short scalping." enabled={createRules.rules_enabled.min_trade_duration} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, min_trade_duration: !p.rules_enabled.min_trade_duration}}))}>
                        <input type="number" value={createRules.min_trade_duration_minutes ?? ""} onChange={e => setCreateRules(p => ({...p, min_trade_duration_minutes: e.target.value ? parseInt(e.target.value) : null}))} disabled={!createRules.rules_enabled.min_trade_duration} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" placeholder="—" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Min Active Days" tooltip="Minimum distinct trading days to qualify for prizes. Users who can't reach this are DQ'd at challenge end." enabled={createRules.rules_enabled.min_active_days} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, min_active_days: !p.rules_enabled.min_active_days}}))}>
                        <input type="number" value={createRules.min_active_days} onChange={e => setCreateRules(p => ({...p, min_active_days: parseInt(e.target.value)||1}))} disabled={!createRules.rules_enabled.min_active_days} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" />
                      </CreateRuleRow>
                      <CreateRuleRow label="Min Total Trades" tooltip="Minimum total number of trades to qualify. Users see a blue flag until met. At challenge end, users who haven't met this are disqualified." enabled={createRules.rules_enabled.min_total_trades} onToggle={() => setCreateRules(p => ({...p, rules_enabled: {...p.rules_enabled, min_total_trades: !p.rules_enabled.min_total_trades}}))}>
                        <input type="number" value={createRules.min_total_trades ?? ""} onChange={e => setCreateRules(p => ({...p, min_total_trades: e.target.value ? parseInt(e.target.value) : null}))} disabled={!createRules.rules_enabled.min_total_trades} className="w-20 p-2 rounded-lg bg-white/10 border border-white/10 text-white text-sm text-center outline-none disabled:opacity-40" placeholder="—" />
                      </CreateRuleRow>
                      {/* Boolean toggle rules */}
                      <CreateRuleToggle label="Weekend Trading" tooltip="Controls crypto trades on weekends. When OFF, weekend crypto trades are flagged. Forex markets are closed anyway." value={createRules.weekend_trading} onChange={v => setCreateRules(p => ({...p, weekend_trading: v}))} />
                      <CreateRuleToggle label="Only Cent Account (Real)" tooltip="Only cent-denominated accounts are accepted for real account registration." value={createRules.only_cent_account} onChange={v => setCreateRules(p => ({...p, only_cent_account: v, ...(v ? {allow_professional: false} : {})}))} />
                      {!createRules.only_cent_account && <CreateRuleToggle label="Allow Professional Accounts (Pro/Zero/Raw)" tooltip="When enabled, professional account types like Pro, Zero Spread, and Raw Spread are accepted. When off, only Standard/Standard Cent accounts can register." value={(createRules as any).allow_professional || false} onChange={v => setCreateRules(p => ({...p, allow_professional: v}))} />}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button onClick={() => setCreateStep(1)} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-400 font-semibold hover:bg-white/10 transition-all">Back</button>
                      <button onClick={() => setCreateStep(3)} className="flex-1 py-3 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all">Review</button>
                    </div>
                  </div>
                )}

                {/* Step 3: Review & Submit */}
                {createStep === 3 && (
                  <div>
                    <div className="space-y-2 mb-5">
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Title</span><span className="text-xs text-white font-medium">{createForm.title}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Type</span><span className="text-xs text-white font-medium capitalize">{createForm.type}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Deposit Mode</span><span className="text-xs text-white font-medium capitalize">{createForm.deposit_mode.replace('_', ' ')}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Period</span><span className="text-xs text-white font-medium">{createForm.start_date ? new Date(createForm.start_date).toLocaleDateString() : '—'} → {createForm.end_date ? new Date(createForm.end_date).toLocaleDateString() : '—'}</span></div>
                      {createForm.real_prizes && <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Real Prizes</span><span className="text-xs text-white font-medium">${createForm.real_prizes}</span></div>}
                      {createForm.demo_prizes && <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Demo Prizes</span><span className="text-xs text-white font-medium">${createForm.demo_prizes}</span></div>}
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">{createForm.deposit_mode === 'fixed' ? 'Balance' : 'Deposit Limit'}</span><span className="text-xs text-white font-medium">${createForm.starting_balance}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Target</span><span className="text-xs text-white font-medium">{createForm.deposit_mode !== 'fixed' ? `${createForm.target_percent}%` : `$${createForm.target_balance}`}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Max Lot</span><span className="text-xs text-white font-medium">{createRules.rules_enabled.max_lot_size ? createRules.max_lot_size : 'OFF'}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Max Risk</span><span className="text-xs text-white font-medium">{createRules.rules_enabled.stop_loss_required ? (createRules.max_risk_mode === 'percentage' ? `${createRules.max_risk_percent}%` : `$${createRules.max_risk_dollars}`) : 'OFF'}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Daily Loss Cap</span><span className="text-xs text-white font-medium">{createRules.rules_enabled.daily_loss_cap ? (createRules.daily_loss_mode === 'percentage' ? `${createRules.daily_loss_percent}%` : `$${createRules.daily_loss_cap}`) : 'OFF'}</span></div>
                      <div className="flex justify-between py-2 border-b border-white/5"><span className="text-xs text-gray-500">Min Active Days</span><span className="text-xs text-white font-medium">{createRules.rules_enabled.min_active_days ? createRules.min_active_days : 'OFF'}</span></div>
                      <div className="flex justify-between py-2"><span className="text-xs text-gray-500">Registration</span><span className="text-xs text-white font-medium">{createForm.registration_mode === 'winnerpip' ? 'Online (WinnerPip)' : 'Manual (CSV)'}</span></div>
                    </div>
                    {createResult?.error && <div className="p-3 rounded-xl bg-loss/10 border border-loss/20 mb-4"><p className="text-xs text-loss">{createResult.error}</p></div>}
                    <div className="flex gap-3">
                      <button onClick={() => setCreateStep(2)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/10 transition-all">Back</button>
                      <button onClick={async () => {
                        setCreateLoading(true); setCreateResult(null);
                        try {
                          const res = await fetch(`${API_URL}/api/host/challenges`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              ...createForm,
                              starting_balance: parseFloat(createForm.starting_balance),
                              target_balance: parseFloat(createForm.target_balance),
                              target_percent: createForm.deposit_mode !== 'fixed' ? parseFloat(createForm.target_percent) : null,
                              real_winners_count: parseInt(createForm.real_winners_count) || 0,
                              demo_winners_count: parseInt(createForm.demo_winners_count) || 0,
                              real_prizes: createForm.real_prizes ? createForm.real_prizes.split(',').map(p => p.trim()).filter(Boolean) : [],
                              demo_prizes: createForm.demo_prizes ? createForm.demo_prizes.split(',').map(p => p.trim()).filter(Boolean) : [],
                              rules: createRules,
                            }),
                          });
                          const data = await res.json();
                          if (res.ok && data.success) { setCreateResult({ success: true }); }
                          else { setCreateResult({ error: data.error || 'Failed to submit' }); }
                        } catch { setCreateResult({ error: 'Could not connect to server' }); }
                        setCreateLoading(false);
                      }} disabled={createLoading} className="flex-1 py-2.5 rounded-xl bg-profit/20 border border-profit/30 text-profit text-sm font-bold hover:bg-profit/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {createLoading ? <Loader2 size={14} className="animate-spin" /> : null} Submit for Approval
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-600 text-center mt-3">Your challenge will be reviewed by admin before going live.</p>
                  </div>
                )}
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function RuleRow({ label, tooltip, enabled, onToggle, locked, children }: { label: string; tooltip: string; enabled: boolean; onToggle: (v: boolean) => void; locked: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div className="flex items-center gap-2">
        <button onClick={() => !locked && onToggle(!enabled)} disabled={locked} className={`w-8 h-4 rounded-full relative transition-all ${enabled ? 'bg-royal' : 'bg-gray-700'} disabled:opacity-50`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${enabled ? 'left-4' : 'left-0.5'}`} />
        </button>
        <span className={`text-sm ${enabled ? 'text-gray-300' : 'text-gray-600'}`}>{label}</span>
        <span className="relative group"><Info size={12} className="text-gray-600 cursor-help" /><span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-black/90 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">{tooltip}</span></span>
      </div>
      <div className={`${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        {children}
      </div>
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
    fetch(`${apiUrl}/api/host/broker-status`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => { setHasBroker(data.hasBrokerIntegration || false); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.brokerEmail || !form.brokerPassword) {
      setError("Email and password are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiUrl}/api/host/broker-credentials`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        setHasBroker(true);
        setShowForm(false);
        setForm({ brokerEmail: "", brokerPassword: "" });
      } else {
        const data = await res.json();
        setError(data.error || "Save failed");
      }
    } catch { setError("Network error"); }
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleRemove = async () => {
    if (!confirm("Remove broker credentials? Partner allocation checks will be disabled.")) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/host/broker-credentials`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) { setHasBroker(false); setSaved(true); }
    } catch {}
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return <div className="glass rounded-2xl border border-white/10 p-5 mt-4 flex justify-center py-8"><Loader2 className="animate-spin text-royal" size={20} /></div>;

  return (
    <div className="glass rounded-2xl border border-white/10 p-5 mt-4">
      <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
        <Shield size={16} className="text-gold" /> Broker Integration
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Connect your broker credentials to enable automatic partner allocation verification for participants.
      </p>

      {saved && <div className="p-2 mb-3 rounded-lg bg-profit/10 border border-profit/30 text-profit text-xs font-medium">✓ Credentials updated</div>}

      {hasBroker && !showForm ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-profit/5 border border-profit/20">
            <div className="w-2.5 h-2.5 rounded-full bg-profit" />
            <p className="text-sm text-profit font-medium">Broker integration active</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 border border-white/10 transition-all">Update Credentials</button>
            <button onClick={handleRemove} disabled={saving} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20 transition-all disabled:opacity-50">Remove</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!hasBroker && !showForm && (
            <button onClick={() => setShowForm(true)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-gold/10 text-gold border border-gold/20 hover:bg-gold/20 transition-all">Setup Broker Credentials</button>
          )}
          {showForm && (
            <>
              {error && <p className="text-xs text-loss">{error}</p>}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Broker Email</label>
                <input type="email" value={form.brokerEmail} onChange={e => setForm(p => ({ ...p, brokerEmail: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-gold/50" placeholder="your@broker.com" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Broker Password</label>
                <input type="password" value={form.brokerPassword} onChange={e => setForm(p => ({ ...p, brokerPassword: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-gold/50" placeholder="••••••••" />
              </div>
              <p className="text-[10px] text-gray-600">Credentials are encrypted with AES-256 and never stored in plain text.</p>
              <div className="flex gap-2 pt-1">
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl bg-gold text-black text-sm font-semibold hover:bg-gold/80 disabled:opacity-50 transition-all flex items-center gap-2">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null} Save Credentials
                </button>
                <button onClick={() => { setShowForm(false); setError(""); }} className="px-4 py-2 rounded-xl bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-all">Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ScreeningTab({ challengeId, getToken }: { challengeId: number; getToken: () => string }) {
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<{ total: number; allocated: number; notAllocated: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hasRun, setHasRun] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

  const runScreening = async () => {
    setLoading(true);
    setError("");
    setResults([]);
    setStats(null);
    try {
      const res = await fetch(`${apiUrl}/api/host/challenge/${challengeId}/screening`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        setStats({ total: data.total, allocated: data.allocated, notAllocated: data.notAllocated, failed: data.failed });
        setHasRun(true);
      } else {
        setError(data.error || "Screening failed");
      }
    } catch { setError("Network error"); }
    setLoading(false);
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Target size={16} className="text-gold" /> Partner Allocation Screening</h3>
      <p className="text-xs text-gray-500 mb-4">Check if participants are properly allocated under your broker partnership.</p>

      {error && <div className="p-3 mb-4 rounded-lg bg-loss/10 border border-loss/30 text-loss text-sm">{error}</div>}

      <button onClick={runScreening} disabled={loading} className="px-5 py-2.5 rounded-xl bg-gold/10 text-gold text-sm font-semibold border border-gold/20 hover:bg-gold/20 transition-all disabled:opacity-50 flex items-center gap-2 mb-5">
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
        {loading ? "Checking allocations..." : hasRun ? "Re-run Screening" : "Run Screening"}
      </button>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">Total</p><p className="text-lg font-bold text-white">{stats.total}</p></div>
          <div className="bg-profit/5 rounded-xl p-3 text-center border border-profit/10"><p className="text-[10px] text-gray-500 uppercase">Allocated</p><p className="text-lg font-bold text-profit">{stats.allocated}</p></div>
          <div className="bg-loss/5 rounded-xl p-3 text-center border border-loss/10"><p className="text-[10px] text-gray-500 uppercase">Not Allocated</p><p className="text-lg font-bold text-loss">{stats.notAllocated}</p></div>
          <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 uppercase">No Data</p><p className="text-lg font-bold text-gray-400">{stats.failed}</p></div>
        </div>
      )}

      {/* Results list */}
      {results.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Nickname</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Email</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Account</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Type</th>
                <th className="text-center py-2 px-3 text-gray-500 font-medium">Allocation</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r: any) => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-3 text-white font-medium">{r.nickname}</td>
                  <td className="py-2.5 px-3 text-gray-400 text-xs">{r.email || "—"}</td>
                  <td className="py-2.5 px-3 text-gray-300">{r.accountNumber}</td>
                  <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.accountType === 'real' ? 'bg-gold/20 text-gold' : 'bg-royal/20 text-royal'}`}>{r.accountType}</span></td>
                  <td className="py-2.5 px-3 text-center">
                    {r.status === 'allocated' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-profit/20 text-profit">✓ Allocated</span>}
                    {r.status === 'not_allocated' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-loss/20 text-loss">✗ Not Allocated</span>}
                    {r.status === 'no_email' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-500">No Email</span>}
                    {r.status === 'check_failed' && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-gray-500">Error</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateRuleRow({ label, tooltip, enabled, onToggle, children }: { label: string; tooltip: string; enabled: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 ${!enabled ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className={`w-9 h-5 rounded-full transition-all flex-shrink-0 ${enabled ? "bg-royal" : "bg-white/20"}`}>
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`}></div>
        </button>
        <p className="text-sm text-white font-medium">{label}</p>
        <div className="relative group">
          <Info size={12} className="text-gray-500 cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-[10px] text-white bg-black/95 rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-tight">{tooltip}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function CreateRuleToggle({ label, tooltip, value, onChange }: { label: string; tooltip: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center gap-2">
        <p className="text-sm text-white font-medium">{label}</p>
        <div className="relative group">
          <Info size={12} className="text-gray-500 cursor-help" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-[10px] text-white bg-black/95 rounded-lg w-48 text-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-tight">{tooltip}</div>
        </div>
      </div>
      <button onClick={() => onChange(!value)} className={`w-12 h-6 rounded-full transition-all ${value ? "bg-profit" : "bg-white/20"}`}>
        <div className={`w-5 h-5 bg-white rounded-full transition-transform ${value ? "translate-x-6" : "translate-x-0.5"}`}></div>
      </button>
    </div>
  );
}
