"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Users, Trophy, FileText, Settings, RefreshCw,
  LogOut, Loader2, ChevronDown, Target, Activity, Shield, X,
  AlertTriangle, Zap, Clock, TrendingUp, Key, UserMinus, Ban,
} from "lucide-react";
import BalanceChart from "@/components/BalanceChart";

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
  const [selectedParticipantBalanceOps, setSelectedParticipantBalanceOps] = useState<any[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<any>(null);
  const [verifyPopup, setVerifyPopup] = useState<any>(null);

  // Rules state
  const [rulesConfig, setRulesConfig] = useState<any>(null);
  const [savedRulesSnapshot, setSavedRulesSnapshot] = useState<any>(null);
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
    daily_loss_percent: 20, max_hold_hours: 24, min_trade_duration_minutes: 2,
    weekend_trading: false, min_active_days: 7, min_total_trades: 10,
    only_cent_account: false, allow_professional: false,
    rules_enabled: { max_lot_size: true, max_open_trades: true, pair_limit: true, stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true, min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true },
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState("");
  const [pullProgress, setPullProgress] = useState<{ isRunning: boolean; currentStep?: number; totalSteps?: number; percent?: number; elapsed?: number; totalAccounts?: number; successful?: number; failed?: number } | null>(null);
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);
  const [leaderboardCategory, setLeaderboardCategory] = useState<"all" | "real" | "demo">("all");
  const [participantFilter, setParticipantFilter] = useState("all");
  const [participantsPage, setParticipantsPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [foundUser, setFoundUser] = useState<any>(null);
  const [actionModal, setActionModal] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState("");

  // CSV Upload
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [csvStatus, setCsvStatus] = useState<any>(null);
  const [csvProgress, setCsvProgress] = useState<any>(null);

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
        if (res.ok) {
          const data = await res.json();
          // Normalize to ensure all expected fields exist
          setOverview({
            challenge: data.challenge || selectedChallenge,
            totalParticipants: data.totalParticipants || 0,
            demoParticipants: data.demoParticipants || 0,
            realParticipants: data.realParticipants || 0,
            disqualified: data.disqualified || 0,
            totalTrades: data.totalTrades || 0,
            demoTrades: data.demoTrades || 0,
            realTrades: data.realTrades || 0,
            totalVolume: data.totalVolume || '0',
            demoVolume: data.demoVolume || '0',
            realVolume: data.realVolume || '0',
            totalViolations: data.totalViolations || 0,
            violationRate: data.violationRate || '0',
            aboveTarget: data.aboveTarget || 0,
            passwordChanged: data.passwordChanged || 0,
            pullsToday: data.pullsToday || 0,
            pullsSuccess: data.pullsSuccess || 0,
            pullsFailed: data.pullsFailed || 0,
            lastPullTime: data.lastPull?.started_at ? fmtTime(data.lastPull.started_at) : "—",
            topViolations: data.topViolations || [],
            realBalance: data.realBalance || 0,
            demoBalance: data.demoBalance || 0,
            totalBalance: data.totalBalance || (Number(data.realBalance || 0) + Number(data.demoBalance || 0)),
            onlyCentAccount: data.onlyCentAccount || false,
            metrics: data.metrics || null,
          });
        } else {
          // Even if API fails, show an empty overview so page isn't blank
          setOverview({
            challenge: selectedChallenge,
            totalParticipants: 0, demoParticipants: 0, realParticipants: 0,
            disqualified: 0, totalTrades: 0, totalViolations: 0,
            violationRate: '0', aboveTarget: 0, passwordChanged: 0,
            pullsToday: 0, pullsSuccess: 0, pullsFailed: 0,
            lastPullTime: "—", topViolations: [],
          });
        }
      } else if (activeTab === "participants") {
        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants`, { headers: h });
        if (res.ok) { const d = await res.json(); setParticipants(d.participants || []); setParticipantsPagination(d.pagination); }
        // Also fetch CSV upload status
        try {
          const csvRes = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/csv-status`, { headers: h });
          if (csvRes.ok) setCsvStatus(await csvRes.json());
        } catch {}
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
        if (res.ok) {
          const d = await res.json();
          const defaultRules = {
            max_lot_size: 0.02, max_open_trades: 3, pair_limit: 2,
            stop_loss_required: true, max_risk_dollars: 5, max_risk_mode: 'fixed',
            max_risk_percent: 10, daily_loss_cap: 10, daily_loss_mode: 'fixed',
            daily_loss_percent: 20, max_hold_hours: 24, min_trade_duration_minutes: 2,
            weekend_trading: false, min_active_days: 7, min_total_trades: 10,
            only_cent_account: false, allow_professional: false,
            rules_enabled: { max_lot_size: true, max_open_trades: true, pair_limit: true, stop_loss_required: true, daily_loss_cap: true, max_hold_hours: true, min_trade_duration: true, weekend_trading: true, min_active_days: true, min_total_trades: true },
          };
          setRulesConfig(d.rules || defaultRules);
          setSavedRulesSnapshot(JSON.parse(JSON.stringify(d.rules || defaultRules)));
          setRulesLocked(d.locked || false);
        }
        setRulesLoading(false);
      } else if (activeTab === "settings") {
        const ch = selectedChallenge;
        if (ch) setSettingsForm({
          title: ch.title || "",
          type: ch.type || "hybrid",
          start_date: ch.start_date ? new Date(ch.start_date).toISOString().slice(0, 16) : "",
          end_date: ch.end_date ? new Date(ch.end_date).toISOString().slice(0, 16) : "",
          starting_balance: ch.starting_balance ?? "30",
          target_balance: ch.target_balance ?? "60",
          prize_pool_text: ch.prize_pool_text || "",
        });
        setSettingsSaved(false);
      }
    } catch {}
    setTabLoading(false);
  }, [selectedChallengeId, activeTab, isAuth]);

  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  // Lock scroll on modal
  useEffect(() => {
    if (selectedParticipant) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedParticipant]);

  // Fetch participant trades
  useEffect(() => {
    if (!selectedParticipant || !selectedChallengeId) { setSelectedParticipantTrades([]); setSelectedParticipantBalanceOps([]); return; }
    fetch(`${API_URL}/api/challenges/${selectedChallengeId}/user-trades?nickname=${encodeURIComponent(selectedParticipant.nickname)}`)
      .then(r => r.ok ? r.json() : { trades: [], balanceOps: [] })
      .then(d => { setSelectedParticipantTrades(d.trades || []); setSelectedParticipantBalanceOps(d.balanceOps || []); })
      .catch(() => { setSelectedParticipantTrades([]); setSelectedParticipantBalanceOps([]); });
  }, [selectedParticipant, selectedChallengeId]);

  // Fetch recent trades when foundUser is set (from clicking participant row)
  useEffect(() => {
    if (!foundUser || !selectedChallengeId || foundUser.recentTrades) return;
    fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants?search=${encodeURIComponent(foundUser.nickname || foundUser.accountNumber || '')}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.participants?.[0]?.recentTrades) setFoundUser((prev: any) => ({ ...prev, recentTrades: d.participants[0].recentTrades })); })
      .catch(() => {});
  }, [foundUser, selectedChallengeId]);

  const handleLogout = () => { localStorage.removeItem("host_token"); localStorage.removeItem("host_info"); window.location.href = "/host/login"; };

  // Action handlers
  const doAction = async (url: string, method = 'POST', body?: any) => {
    setActionLoading(true);
    try {
      const res = await fetch(url, { method, headers: headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await res.json();
      if (data.success) {
        setActionResult("Started");
        // Start polling progress
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/pull-status`, { headers: headers() });
            const progress = await pRes.json();
            setPullProgress(progress);
            if (!progress.isRunning) { clearInterval(poll); setPullProgress(null); setActionResult("✅ Complete"); fetchTabData(); setTimeout(() => setActionResult(""), 3000); }
          } catch { clearInterval(poll); setPullProgress(null); }
        }, 2000);
        // Also poll immediately
        setTimeout(async () => {
          try {
            const pRes = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/pull-status`, { headers: headers() });
            setPullProgress(await pRes.json());
          } catch {}
        }, 500);
      } else { setActionResult(data.error || "Failed"); setTimeout(() => setActionResult(""), 3000); }
    } catch { setActionResult("Network error"); setTimeout(() => setActionResult(""), 3000); }
    setActionLoading(false);
  };

  const fmtTime = (d: string) => d ? new Date(d).toLocaleString("en-US", { timeZone: challengeTz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) : "—";

  // Currency helper — shows ¢ for cent accounts, $ otherwise (matching admin)
  const isCentChallenge = (rulesConfig?.only_cent_account || overview?.onlyCentAccount) && selectedChallenge?.type !== 'demo';
  const cur = (amount: number | string | null | undefined, userIsCent?: boolean) => {
    if (amount == null) return "—";
    const num = Number(amount);
    if (isNaN(num)) return "—";
    const showCent = userIsCent !== undefined ? userIsCent : isCentChallenge;
    return showCent ? `${num.toFixed(2)}¢` : `$${num.toFixed(2)}`;
  };

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
          <ChangePasswordSection getToken={getToken} />
          <div className="mt-4" />
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
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); setCreateForm(f => ({...f, registration_mode: hostInfo?.hasBrokerIntegration ? 'winnerpip' : 'manual'})); }} className="px-4 py-2 rounded-xl bg-royal/20 text-royal text-sm font-semibold border border-royal/30">+ New Challenge</button>
          </div>
        )}

        {challenges.length === 0 && (
          <div className="text-center py-24">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-300 text-lg font-semibold">No challenges yet</p>
            <button onClick={() => { setShowCreateModal(true); setCreateResult(null); setCreateStep(1); setCreateForm(f => ({...f, registration_mode: hostInfo?.hasBrokerIntegration ? 'winnerpip' : 'manual'})); }} className="mt-6 px-6 py-2.5 rounded-xl bg-royal text-white font-semibold text-sm">Create Challenge</button>
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
              <StatCard icon={<Target size={16} />} label="Total Balance" value={`$${Number(overview.realBalance || 0).toFixed(2)}`} sub={`Real: $${Number(overview.realBalance || 0).toFixed(2)} | Demo: $${Number(overview.demoBalance || 0).toFixed(2)}`} color="text-profit" />
              <StatCard icon={<Zap size={16} />} label="Updates Today" value={String(overview.pullsToday || 0)} sub={`Next: ${(() => { const now = new Date(Date.now() + 3*60*60*1000); const h = now.getUTCHours(); const schedule = [0,4,8,12,16,20]; const next = schedule.find(s => s > h); return next !== undefined ? `${String(next).padStart(2,"0")}:00 EAT` : "00:00 EAT"; })()}`} color="text-royal" />
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
                      const label = cat === 'real' ? '💰 Real Account' : '🏦 Demo Account';
                      return (
                        <div key={cat} className="space-y-3">
                          <p className="text-xs font-bold text-gray-300 uppercase">{label}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {m.maxProfitTrade && <MetricCard title="Best Trade" value={cur(m.maxProfitTrade.profit, m.maxProfitTrade.isCent)} sub={m.maxProfitTrade.symbol} user={m.maxProfitTrade.nickname} color="text-profit" />}
                            {m.maxLossTrade && <MetricCard title="Worst Trade" value={cur(m.maxLossTrade.profit, m.maxLossTrade.isCent)} sub={m.maxLossTrade.symbol} user={m.maxLossTrade.nickname} color="text-loss" />}
                            {m.bestQualifiedWinRate && <MetricCard title="Best Win Rate (Qual)" value={`${m.bestQualifiedWinRate.winRate}%`} sub={`${m.bestQualifiedWinRate.trades} trades`} user={m.bestQualifiedWinRate.nickname} color="text-royal" />}
                            {m.bestOverallWinRate && <MetricCard title="Best Win Rate (All)" value={`${m.bestOverallWinRate.winRate}%`} sub={`${m.bestOverallWinRate.trades} trades`} user={m.bestOverallWinRate.nickname} color="text-royal" />}
                            {m.mostTradedPair && <MetricCard title="Most Traded" value={m.mostTradedPair.symbol} sub={`${m.mostTradedPair.tradeCount} trades · ${m.mostTradedPair.totalLots.toFixed(2)} lots`} color="text-gold" />}
                            {m.leastTradedPair && m.leastTradedPair.symbol !== m.mostTradedPair?.symbol && <MetricCard title="Least Traded" value={m.leastTradedPair.symbol} sub={`${m.leastTradedPair.tradeCount} trades`} color="text-gray-300" />}
                            <MetricCard title="Blown" value={String(m.blownAccounts)} sub="equity = 0" color="text-loss" />
                            <MetricCard title="Disqualified" value={String(m.disqualifiedAccounts || 0)} sub="rule violations" color="text-loss" />
                            <MetricCard title="Avg Trades/User" value={String(m.avgTradesPerUser)} sub="active traders" color="text-white" />
                            {m.mostActiveDay && <MetricCard title="Most Active Day" value={new Date(m.mostActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.mostActiveDay.tradeCount} trades`} color="text-white" />}
                            {m.leastActiveDay && <MetricCard title="Least Active Day" value={new Date(m.leastActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.leastActiveDay.tradeCount} trades`} color="text-gray-400" />}
                            {m.bestRuleKeeping && <MetricCard title="Best Rule Keeping" value={`${m.bestRuleKeeping.rkr}%`} sub={m.bestRuleKeeping.tiedCount > 1 ? `+ ${m.bestRuleKeeping.tiedCount - 1} more` : ""} user={m.bestRuleKeeping.nickname} color="text-profit" />}
                            {m.worstRuleKeeping && <MetricCard title="Worst Rule Keeping" value={`${m.worstRuleKeeping.rkr}%`} sub={m.worstRuleKeeping.tiedCount > 1 ? `+ ${m.worstRuleKeeping.tiedCount - 1} more` : ""} user={m.worstRuleKeeping.nickname} color="text-loss" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  (() => {
                    const m = overview.metrics.combined;
                    if (!m) return null;
                    return (
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {m.maxProfitTrade && <MetricCard title="Best Trade" value={cur(m.maxProfitTrade.profit, m.maxProfitTrade.isCent)} sub={m.maxProfitTrade.symbol} user={m.maxProfitTrade.nickname} color="text-profit" />}
                        {m.maxLossTrade && <MetricCard title="Worst Trade" value={cur(m.maxLossTrade.profit, m.maxLossTrade.isCent)} sub={m.maxLossTrade.symbol} user={m.maxLossTrade.nickname} color="text-loss" />}
                        {m.bestQualifiedWinRate && <MetricCard title="Best Win Rate (Qualified)" value={`${m.bestQualifiedWinRate.winRate}%`} sub={`${m.bestQualifiedWinRate.trades} trades`} user={m.bestQualifiedWinRate.nickname} color="text-royal" />}
                        {m.bestOverallWinRate && <MetricCard title="Best Win Rate (Overall)" value={`${m.bestOverallWinRate.winRate}%`} sub={`${m.bestOverallWinRate.trades} trades`} user={m.bestOverallWinRate.nickname} color="text-royal" />}
                        {m.mostTradedPair && <MetricCard title="Most Traded Pair" value={m.mostTradedPair.symbol} sub={`${m.mostTradedPair.tradeCount} trades · ${m.mostTradedPair.totalLots.toFixed(2)} lots`} color="text-gold" />}
                        {m.leastTradedPair && m.leastTradedPair.symbol !== m.mostTradedPair?.symbol && <MetricCard title="Least Traded Pair" value={m.leastTradedPair.symbol} sub={`${m.leastTradedPair.tradeCount} trades`} color="text-gray-300" />}
                        <MetricCard title="Blown Accounts" value={String(m.blownAccounts)} sub="equity hit zero" color="text-loss" />
                        <MetricCard title="Disqualified" value={String(m.disqualifiedAccounts || 0)} sub="rule violations" color="text-loss" />
                        {m.mostActiveDay && <MetricCard title="Most Active Day" value={new Date(m.mostActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.mostActiveDay.tradeCount} trades`} color="text-white" />}
                        {m.leastActiveDay && <MetricCard title="Least Active Day" value={new Date(m.leastActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} sub={`${m.leastActiveDay.tradeCount} trades`} color="text-gray-400" />}
                        <MetricCard title="Avg Trades/User" value={String(m.avgTradesPerUser)} sub="among active traders" color="text-white" />
                        {m.bestRuleKeeping && <MetricCard title="Best Rule Keeping" value={`${m.bestRuleKeeping.rkr}%`} sub={m.bestRuleKeeping.tiedCount > 1 ? `+ ${m.bestRuleKeeping.tiedCount - 1} more` : ""} user={m.bestRuleKeeping.nickname} color="text-profit" />}
                        {m.worstRuleKeeping && <MetricCard title="Worst Rule Keeping" value={`${m.worstRuleKeeping.rkr}%`} sub={m.worstRuleKeeping.tiedCount > 1 ? `+ ${m.worstRuleKeeping.tiedCount - 1} more` : ""} user={m.worstRuleKeeping.nickname} color="text-loss" />}
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
              {/* CSV Upload Section — only for manual registration mode */}
              {selectedChallenge?.registration_mode !== 'winnerpip' && (
              <div className="glass rounded-2xl border border-white/10 p-5">
                <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><FileText size={16} className="text-gold" /> Upload Participants (CSV)</h3>
                <p className="text-[10px] text-gray-500 mb-3">Upload a CSV file with columns: nickname, email, account_type (demo/real), account_number, server, investor_password</p>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setCsvUploading(true); setCsvResult(null);
                      try {
                        const text = await file.text();
                        const lines = text.trim().split('\n');
                        const header = lines[0].toLowerCase();
                        const hasHeader = header.includes('nickname') || header.includes('account');
                        const dataLines = hasHeader ? lines.slice(1) : lines;
                        const participants = dataLines.filter(l => l.trim()).map(line => {
                          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
                          return { nickname: cols[0], email: cols[1], accountType: (cols[2] || '').toLowerCase(), accountNumber: cols[3], server: cols[4], investorPassword: cols[5] };
                        }).filter(p => p.nickname && p.accountNumber && p.server && p.investorPassword);
                        if (participants.length === 0) { setCsvResult({ error: 'No valid rows found. Expected: nickname, email, account_type, account_number, server, investor_password' }); setCsvUploading(false); return; }
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/upload-csv`, { method: 'POST', headers: headers(), body: JSON.stringify({ participants }) });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          setCsvResult({ success: true, count: data.totalRows, skipped: data.skipped || 0, skippedDetails: data.skippedDetails || [] });
                          // Start polling for verification progress
                          setCsvProgress({ status: 'processing', total: data.totalRows, processed: 0, verified: 0, failed: 0 });
                          const pollId = data.uploadId;
                          const poll = setInterval(async () => {
                            try {
                              const pr = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/csv-progress/${pollId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                              if (pr.ok) {
                                const pg = await pr.json();
                                setCsvProgress(pg);
                                if (pg.status === 'processed' || pg.status === 'failed') { clearInterval(poll); fetchTabData(); }
                              }
                            } catch {}
                          }, 2000);
                        } else { setCsvResult({ error: data.error || 'Upload failed', details: data.details || [] }); }
                      } catch { setCsvResult({ error: 'Failed to read file' }); }
                      setCsvUploading(false);
                      e.target.value = '';
                    }} />
                    <div className="p-3 rounded-xl bg-gold/10 border border-gold/20 text-center hover:bg-gold/20 transition-all">
                      <p className="text-sm font-semibold text-gold">{csvUploading ? "Uploading..." : "Choose CSV File"}</p>
                    </div>
                  </label>
                </div>
                {csvResult?.success && <div className="mt-3">
                  {csvProgress && csvProgress.status === 'processing' && (
                    <div className="p-3 rounded-lg bg-royal/5 border border-royal/20">
                      <div className="flex items-center justify-between mb-2"><p className="text-xs text-royal font-semibold">Verifying accounts...</p><span className="text-[10px] text-gray-400">{csvProgress.processed}/{csvProgress.total}</span></div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-royal rounded-full transition-all" style={{ width: `${csvProgress.total > 0 ? (csvProgress.processed / csvProgress.total) * 100 : 0}%` }} /></div>
                    </div>
                  )}
                  {csvProgress && (csvProgress.status === 'processed' || csvProgress.status === 'failed') && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-profit/5 border border-profit/20">
                        <p className="text-xs text-profit font-semibold">Verification Complete</p>
                        <div className="flex gap-4 mt-2">
                          <span className="text-xs text-profit">&#10003; {csvProgress.verified} verified</span>
                          {csvProgress.failed > 0 && <span className="text-xs text-loss">&#10005; {csvProgress.failed} failed</span>}
                        </div>
                      </div>
                      {csvProgress.rowDetails?.length > 0 && (
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10 max-h-64 overflow-y-auto">
                          <p className="text-[10px] text-gray-400 font-semibold uppercase mb-2">Per-Account Results</p>
                          <div className="space-y-1.5">
                            {csvProgress.rowDetails.map((r: any, i: number) => (
                              <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-[11px] ${r.status === 'verified' ? 'bg-profit/5' : 'bg-loss/5'}`}>
                                <div><span className="text-white font-medium">{r.nickname}</span><span className="text-gray-500 ml-2">{r.account_number} ({r.account_type})</span></div>
                                <span className={r.status === 'verified' ? 'text-profit font-semibold' : 'text-loss'}>{r.status === 'verified' ? 'Verified' : r.error_message}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!csvProgress && <p className="text-xs text-profit font-semibold">&#10003; Uploaded {csvResult.count} participants. Verifying...</p>}
                  {csvResult.skipped > 0 && <div className="mt-3 p-3 rounded-lg bg-gold/5 border border-gold/20"><p className="text-[10px] text-gold font-semibold mb-2">{csvResult.skipped} row(s) skipped before upload:</p><div className="space-y-1.5">{csvResult.skippedDetails.map((d: string, i: number) => <div key={i} className="flex items-start gap-2 text-[10px]"><span className="text-gold/60 mt-0.5">&#9888;</span><span className="text-gray-300">{d}</span></div>)}</div></div>}
                </div>}
                {csvResult?.error && <div className="mt-3 p-3 rounded-lg bg-loss/5 border border-loss/20"><p className="text-xs text-loss font-semibold mb-1">{csvResult.error}</p>{csvResult.details?.length > 0 && <div className="space-y-1.5 mt-2">{csvResult.details.map((d: string, i: number) => <div key={i} className="flex items-start gap-2 text-[10px]"><span className="text-loss/60 mt-0.5">&#10005;</span><span className="text-gray-300">{d}</span></div>)}</div>}</div>}

                {/* Upload History & Status — collapsible */}
                {csvStatus?.uploads?.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-[10px] text-gray-400 font-semibold uppercase cursor-pointer hover:text-gray-300">Upload History ({csvStatus.uploads.length})</summary>
                    <div className="mt-2 space-y-2">
                    {csvStatus.uploads.map((u: any) => (
                      <div key={u.id} className={`p-3 rounded-lg border ${u.status === 'processed' ? 'bg-profit/5 border-profit/20' : u.status === 'pending' ? 'bg-gold/5 border-gold/20' : 'bg-white/5 border-white/10'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`text-xs font-semibold ${u.status === 'processed' ? 'text-profit' : u.status === 'pending' ? 'text-gold' : u.status === 'rejected' || u.status === 'cancelled' ? 'text-loss' : 'text-gray-300'}`}>{u.status === 'processed' ? 'Processed' : u.status === 'pending' ? 'Pending Approval' : u.status === 'cancelled' ? 'Cancelled' : u.status === 'rejected' ? 'Rejected' : u.status}</span>
                            <p className="text-[10px] text-gray-500 mt-0.5">{u.total_rows} rows &bull; {u.uploaded_at ? fmtTime(u.uploaded_at) : ''}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {u.status === 'processed' && <span className="text-[10px] text-gray-400">{u.verified_count} verified &bull; {u.failed_count} failed</span>}
                            {u.status === 'pending' && <button onClick={async () => { if (!confirm('Cancel this pending upload?')) return; try { await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/csv-upload/${u.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } }); fetchTabData(); } catch {} }} className="text-[10px] text-loss font-semibold px-2 py-1 rounded bg-loss/10 border border-loss/20 hover:bg-loss/20 transition-all">Cancel</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Show row details for latest processed upload */}
                    {csvStatus.rowDetails?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-[10px] text-royal cursor-pointer hover:underline">View row details ({csvStatus.rowDetails.length} rows)</summary>
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                          {csvStatus.rowDetails.map((r: any, i: number) => (
                            <div key={i} className={`flex items-center justify-between p-2 rounded-lg text-xs ${r.status === 'verified' ? 'bg-profit/5' : 'bg-loss/5'}`}>
                              <span className="text-white font-medium">{r.nickname} ({r.account_number})</span>
                              <span className={r.status === 'verified' ? 'text-profit' : 'text-loss'}>{r.status === 'verified' ? 'Verified' : r.error_message || 'Failed'}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  </details>
                )}
              </div>
              )}

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
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Balance</p><p className="text-lg font-bold text-white">{cur(foundUser.balance || foundUser.lastKnownBalance || 0, foundUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Qualified Profit</p><p className="text-lg font-bold text-profit">{cur(foundUser.qualifiedProfit || 0, foundUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Profit Removed</p><p className="text-lg font-bold text-loss">{cur(foundUser.profitRemoved || 0, foundUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Win Rate</p><p className="text-lg font-bold text-white">{foundUser.winRate || "N/A"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{foundUser.totalTrades || 0}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Avg RR</p><p className="text-lg font-bold text-royal">{foundUser.avgRR ? Number(foundUser.avgRR).toFixed(1) + "R" : "N/A"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${(foundUser.flaggedTrades || 0) > 0 ? "text-loss" : "text-profit"}`}>{foundUser.flaggedTrades || 0}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Active Days</p><p className="text-lg font-bold text-white">{foundUser.activeDays || 0}</p></div>
                  </div>
                  <div className="px-5 pb-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Account #</p><p className="text-sm font-semibold text-white">{foundUser.accountNumber}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Server</p><p className="text-sm font-semibold text-white">{foundUser.server || "—"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Registered</p><p className="text-sm font-semibold text-white">{foundUser.registeredAt ? (() => { const d = new Date(new Date(foundUser.registeredAt).getTime() + 3*60*60*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : "—"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Last Pull</p><p className="text-sm font-semibold text-white">{foundUser.lastPull ? (() => { const d = new Date(new Date(foundUser.lastPull).getTime() + 3*60*60*1000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")} EAT`; })() : "—"}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500">Partner</p><p className="text-sm font-semibold text-profit">{foundUser.partnerStatus || "OK"}</p></div>
                  </div>
                  <div className="px-5 pb-3"><p className="text-xs font-semibold text-gray-300 mb-2">Recent Trades</p>{foundUser.recentTrades && foundUser.recentTrades.length > 0 ? <div className="space-y-2">{foundUser.recentTrades.map((t: any, i: number) => (<div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10"><div className="flex items-center gap-3"><span className={`px-2 py-1 rounded text-[10px] font-bold ${(t.type || t.trade_type || '').toLowerCase() === "buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type || t.trade_type}</span><div><p className="text-sm text-white font-semibold">{t.symbol}</p><p className="text-[10px] text-gray-500">{t.volume} lots</p></div></div><div className="text-right"><p className={`text-sm font-bold ${Number(t.profit) >= 0 ? "text-profit" : "text-loss"}`}>{cur(Number(t.profit), foundUser.isCent)}</p></div></div>))}</div> : <p className="text-sm text-gray-500">No trades yet</p>}</div>
                  <div className="p-5 border-t border-white/10 space-y-2">
                    <button onClick={() => { setActiveTab("leaderboard"); setLeaderboardCategory(foundUser.accountType === 'demo' ? 'demo' : 'real'); setTimeout(() => { const entry = leaderboard.find((e: any) => e.nickname === foundUser.nickname || e.accountNumber === foundUser.accountNumber); if (entry) setSelectedParticipant(entry); }, 500); }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-gold/20 border border-gold/30 hover:bg-gold/30 text-gold font-semibold transition-all text-sm"><Trophy size={16} />View on Leaderboard #{foundUser.rank || '—'}</button>
                    <button onClick={async () => { if (!foundUser.id) return; try { const regId = foundUser.id; const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/export-user-trades?registration_id=${regId}`, { headers: { Authorization: `Bearer ${getToken()}` } }); if (!res.ok) { alert("Export failed"); return; } const data = await res.json(); const html = generateTradesHTML(data); const blob = new Blob([html], {type:"text/html"}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${data.user?.nickname || foundUser.nickname}_MT5_history.html`; a.click(); URL.revokeObjectURL(url); } catch { alert("Export failed"); } }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-semibold transition-all text-sm"><FileText size={16} />Export MT5 Trade History</button>
                  </div>
                  <div className="p-5 border-t border-white/10 space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Actions</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={async () => { if (!foundUser.id) return; const btn = document.activeElement as HTMLButtonElement; btn.textContent = '⏳'; try { const r = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/check-balance`, { method: "POST", headers: headers(), body: JSON.stringify({ registrationId: foundUser.id }) }); const d = await r.json(); if (d.verified) { btn.textContent = `✅ ${cur(Number(d.balance), foundUser.isCent)}`; } else { btn.textContent = `❌ ${d.credential_fail ? 'PW changed' : 'Failed'}`; } } catch { btn.textContent = '❌ Error'; } setTimeout(() => { btn.textContent = '🛡️ Check Balance'; }, 5000); }} className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all">🛡️ Check Balance</button>
                      <button onClick={async () => { if (!foundUser.id) return; try { const r = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, { method: "POST", headers: headers(), body: JSON.stringify({ registrationId: foundUser.id }) }); const d = await r.json(); alert(d.success ? "Re-evaluation complete" : (d.error || "Failed")); } catch { alert("Error"); } }} className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-all">🔄 Re-evaluate</button>
                      {!foundUser.disqualified && <button onClick={() => setActionModal({ type: 'disqualify', participant: foundUser })} className="px-3 py-2 rounded-lg bg-loss/10 border border-loss/30 text-loss text-xs font-semibold hover:bg-loss/20 transition-all">🚫 Disqualify</button>}
                      <button onClick={() => setActionModal({ type: 'unverify', participant: foundUser })} className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/30 text-gray-400 text-xs font-semibold hover:bg-gray-500/20 transition-all">🗑️ Unregister</button>
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
                          <tr key={p.id} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${p.disqualified ? "opacity-50 bg-loss/5" : ""}`} onClick={() => { setFoundUser(p); setSearchPerformed(true); }}>
                            <td className="py-2 px-3 text-xs text-gray-500">{p.rank || "—"}</td>
                            <td className="py-2 px-3 text-sm text-white font-medium">{p.nickname || "—"}</td>
                            <td className="py-2 px-3 text-xs text-gray-400 max-w-[120px] truncate">{p.email || "—"}</td>
                            <td className="py-2 px-3 text-xs text-gray-300">{p.accountNumber}</td>
                            <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${p.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{p.accountType}</span></td>
                            <td className="py-2 px-3 text-right"><span className="text-sm text-white font-medium">{p.lastKnownBalance ? cur(p.lastKnownBalance, p.isCent) : "—"}</span>{p.lastPullAt && <p className="text-[9px] text-gray-500">{(() => { const d = new Date(p.lastPullAt); return d.toLocaleTimeString("en-US", { timeZone: challengeTz, hour: "2-digit", minute: "2-digit", hour12: false }) + " " + (challengeTz.includes("Nairobi") ? "EAT" : ""); })()}</p>}</td>
                            <td className={`py-2 px-3 text-right text-sm font-medium ${(p.qualifiedProfit ?? 0) >= 0 ? "text-profit" : "text-loss"}`}>{p.qualifiedProfit != null ? cur(p.qualifiedProfit, p.isCent) : "—"}</td>
                            <td className="py-2 px-3 text-center text-xs text-gray-400">{p.totalTrades || 0}</td>
                            <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={async (ev) => { ev.stopPropagation(); const btn = ev.currentTarget; btn.textContent = '⏳'; try { const r = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/check-balance`, { method: "POST", headers: headers(), body: JSON.stringify({ registrationId: p.id }) }); const d = await r.json(); setVerifyPopup(d); btn.textContent = d.verified ? '✅' : '❌'; if (d.verified && d.balance != null) { setParticipants(prev => prev.map(pt => pt.id === p.id ? { ...pt, lastKnownBalance: d.balance } : pt)); } } catch { btn.textContent = '❌'; } setTimeout(() => { btn.textContent = '🛡️'; }, 4000); }} title="Verify Connection" className="p-1.5 rounded-lg hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 transition-all text-xs">🛡️</button>
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
                        const body: any = { registrationId: actionModal.participant.id, reason: actionMessage };
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
                    const eWinnersCount = e.accountType === 'demo' ? parseInt(selectedChallenge?.demo_winners_count || 3) : parseInt(selectedChallenge?.real_winners_count || 3);
                    const eEffectiveTarget = e.isCent ? Number(selectedChallenge?.target_balance || 0) * 100 : Number(selectedChallenge?.target_balance || 0);
                    const eIsWinner = !e.isDisqualified && !e.isWithdrawn && !e.isBlown && e.rank && e.rank <= eWinnersCount && Number(e.adjustedBalance) >= eEffectiveTarget;
                    const eIsAboveTarget = !e.isDisqualified && !e.isWithdrawn && !e.isBlown && Number(e.adjustedBalance) >= eEffectiveTarget;
                    return (
                    <tr key={e.rank || e.nickname} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${e.isDisqualified ? "opacity-50 bg-loss/10" : (e.isWithdrawn || e.isBlown) ? "opacity-40 bg-loss/5" : eIsWinner ? "bg-profit/15" : eIsAboveTarget ? "bg-profit/5" : ""}`} onClick={() => setSelectedParticipant(e)}>
                      <td className="py-3 px-4"><span className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : eIsWinner ? "text-profit" : eIsAboveTarget ? "text-profit/70" : e.rank && e.rank <= 3 ? "text-gold" : "text-gray-400"}`}>{e.isDisqualified ? <span className="text-[10px]">DQ</span> : eIsWinner ? "\u{1F3C6}" : (e.rank || "—")}</span></td>
                      <td className="py-3 px-2 text-center w-10">{e.rankChange > 0 ? <span className="text-[10px] text-profit font-semibold px-1.5 py-0.5 rounded bg-profit/10">&blacktriangle;{e.rankChange}</span> : e.rankChange < 0 ? <span className="text-[10px] text-loss font-semibold px-1.5 py-0.5 rounded bg-loss/10">&blacktriangledown;{Math.abs(e.rankChange)}</span> : e.rankChange === 0 ? <span className="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-white/5">&mdash;</span> : <span className="text-[10px] text-gray-600 px-1.5 py-0.5 rounded bg-white/5">&middot;</span>}</td>
                      <td className="py-3 px-4"><p className={`text-sm font-semibold ${eIsWinner ? "text-profit font-bold" : eIsAboveTarget ? "text-profit/80" : "text-white"}`}>{e.nickname}{e.isDisqualified ? <span className="ml-2 text-[10px] text-loss">DQ</span> : e.isWithdrawn ? <span className="ml-2 text-[10px] text-gray-400" title="User withdrew all funds">🚪 Exited</span> : e.isBlown ? <span className="ml-2 text-[10px] text-amber-400" title="Account blown">💀 Blown</span> : ""}</p><p className="text-[10px] text-gray-500 mt-0.5">{e.email || ""}</p>{!e.isDisqualified && rulesConfig?.min_total_trades > 0 && rulesConfig?.rules_enabled?.min_total_trades !== false && (e.totalTrades || 0) < rulesConfig.min_total_trades && <p className="text-[9px] text-royal mt-0.5 font-semibold">📊 {e.totalTrades || 0}/{rulesConfig.min_total_trades} trades</p>}</td>
                      <td className="py-3 px-4"><p className="text-xs text-gray-300 font-mono">{e.accountNumber || "—"}</p></td>
                      <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-[10px] font-semibold ${e.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{e.accountType}</span></td>
                      <td className="py-3 px-4 text-right">
                        <p className={`text-sm font-bold ${e.isDisqualified ? "text-loss" : e.isWithdrawn ? "text-gray-500" : eIsWinner ? "text-profit" : eIsAboveTarget ? "text-profit/80" : "text-white"}`}>{e.isDisqualified ? "DQ" : e.isWithdrawn ? "Exited" : e.isCent ? `${(Number(e.adjustedBalance) - (e.totalWithdrawn || 0)).toFixed(2)}¢` : `$${(Number(e.adjustedBalance) - (e.totalWithdrawn || 0)).toFixed(2)}`}</p>
                        {!e.isDisqualified && !e.isWithdrawn && <p className="text-[10px] text-gray-500 mt-0.5">{e.isCent ? `${Number(e.currentBalance || e.adjustedBalance).toFixed(2)}¢` : `$${Number(e.currentBalance || e.adjustedBalance).toFixed(2)}`}</p>}
                        {e.isWithdrawn && e.totalWithdrawn > 0 && <p className="text-[10px] text-gray-600 mt-0.5">withdrew {e.isCent ? `${Number(e.totalWithdrawn).toFixed(2)}¢` : `$${Number(e.totalWithdrawn).toFixed(2)}`}</p>}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-gray-400">{e.totalTrades || 0}</td>
                      <td className="py-3 px-4 text-center text-sm text-gray-400">{(e.totalTrades || 0) > 0 ? `${Math.round(((e.qualifiedTrades || 0) / e.totalTrades) * 100)}%` : "—"}</td>
                      <td className="py-3 px-4 text-center text-sm text-royal">{(e.totalTrades || 0) > 0 ? (e.isCent ? `${Number(e.qualifiedProfit).toFixed(2)}¢` : `$${Number(e.qualifiedProfit).toFixed(2)}`) : "—"}</td>
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
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update`)} disabled={actionLoading || !!pullProgress?.isRunning} className="px-4 py-2.5 rounded-lg bg-royal/20 text-royal text-xs font-semibold border border-royal/30 hover:bg-royal/30 disabled:opacity-50 transition-all">Update (Incremental)</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update-rank`)} disabled={actionLoading || !!pullProgress?.isRunning} className="px-4 py-2.5 rounded-lg bg-profit/20 text-profit text-xs font-semibold border border-profit/30 hover:bg-profit/30 disabled:opacity-50 transition-all">Full Update + Evaluate + Rank</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/force-update-all`)} disabled={actionLoading || !!pullProgress?.isRunning} className="px-4 py-2.5 rounded-lg bg-gold/20 text-gold text-xs font-semibold border border-gold/30 hover:bg-gold/30 disabled:opacity-50 transition-all">Full Update (All incl. DQ)</button>
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/re-evaluate-user`, 'POST', {})} disabled={actionLoading || !!pullProgress?.isRunning} className="px-4 py-2.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-semibold border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50 transition-all">Evaluate Only</button>
                  <IndividualPullBtn challengeId={selectedChallengeId!} getToken={getToken} />
                  <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`)} disabled={actionLoading || !!pullProgress?.isRunning} className="px-4 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50 transition-all">Retry All Failed</button>
                </div>
                <p className="text-[10px] text-gray-500 mt-3">Updates run automatically 6x/day. Use these for manual triggers between scheduled runs.</p>
                {actionResult && <p className={`text-xs mt-2 font-semibold ${actionResult.startsWith("✅") ? "text-profit" : actionResult === "Started" ? "text-gold" : "text-loss"}`}>{actionResult}</p>}
                {/* Progress bar */}
                {pullProgress?.isRunning && (
                  <div className="mt-4 p-3 rounded-xl bg-royal/5 border border-royal/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-royal font-semibold flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Step {pullProgress.currentStep} of {pullProgress.totalSteps}</span>
                      <span className="text-[10px] text-gray-500">{pullProgress.elapsed}s · {pullProgress.successful || 0} ok · {pullProgress.failed || 0} failed</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-royal to-profit transition-all duration-1000" style={{ width: `${Math.max(pullProgress.percent || 0, ((pullProgress.currentStep || 1) - 1) / (pullProgress.totalSteps || 4) * 100 + (pullProgress.percent || 50) / (pullProgress.totalSteps || 4))}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      {[1,2,3,4].map(s => (
                        <span key={s} className={`text-[9px] font-bold ${s < (pullProgress.currentStep || 1) ? 'text-profit' : s === pullProgress.currentStep ? 'text-royal' : 'text-gray-600'}`}>
                          {s < (pullProgress.currentStep || 1) ? '✓' : ''} Step {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Credential Failures — collapsed by default */}
              <CredentialFailuresPanel failedAccounts={failedAccounts} doAction={doAction} selectedChallengeId={selectedChallengeId!} />

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
                      <div><p className="text-sm text-white font-medium">Prohibit Weekend Trading</p><p className="text-[10px] text-gray-500">When ON, crypto trades on weekends are flagged</p></div>
                      <button onClick={() => !rulesLocked && setRulesConfig({...rulesConfig, rules_enabled: {...rulesConfig.rules_enabled, weekend_trading: !rulesConfig.rules_enabled?.weekend_trading}})} className={`w-12 h-6 rounded-full transition-all ${rulesConfig.rules_enabled?.weekend_trading ? "bg-profit" : "bg-white/20"}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${rulesConfig.rules_enabled?.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
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
                (() => {
                  const rulesChanged = savedRulesSnapshot !== null && JSON.stringify(rulesConfig) !== JSON.stringify(savedRulesSnapshot);
                  return (
                <div className="mt-6 flex justify-end">
                  <button onClick={async () => {
                    if (!rulesChanged) return;
                    setRulesSaving(true);
                    try {
                      const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/rules`, { method: "PUT", headers: headers(), body: JSON.stringify(rulesConfig) });
                      if (res.ok) { setRulesSaved(true); setSavedRulesSnapshot(JSON.parse(JSON.stringify(rulesConfig))); setTimeout(() => setRulesSaved(false), 3000); }
                      else { const d = await res.json(); alert(d.error || "Failed to save rules"); }
                    } catch { alert("Connection error"); }
                    setRulesSaving(false);
                  }} disabled={rulesSaving || !rulesChanged} className={`px-8 py-3 rounded-xl font-semibold text-sm transition-all ${rulesSaved ? "bg-profit/20 text-profit border border-profit/30 cursor-not-allowed" : rulesChanged ? "bg-gradient-to-r from-royal to-purple-600 hover:opacity-90 text-white shadow-lg shadow-royal/20" : "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed opacity-50"}`}>{rulesSaving ? "Saving..." : rulesSaved ? "\u2713 Rules Saved" : rulesChanged ? "Save Rules" : "No Changes"}</button>
                </div>
                  );
                })()
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
                  <div><label className="text-xs text-gray-400 font-medium mb-1 block">Type</label>
                    <select value={settingsForm.type || selectedChallenge?.type || "hybrid"} onChange={e => setSettingsForm((p: any) => ({...p, type: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none">
                      <option value="hybrid" className="bg-[#0f1629]">Hybrid</option>
                      <option value="demo" className="bg-[#0f1629]">Demo</option>
                      <option value="real" className="bg-[#0f1629]">Real</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Start (EAT)</label><input type="datetime-local" value={settingsForm.start_date || ""} onChange={e => setSettingsForm((p: any) => ({...p, start_date: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">End (EAT)</label><input type="datetime-local" value={settingsForm.end_date || ""} onChange={e => setSettingsForm((p: any) => ({...p, end_date: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Starting Balance ($)</label><input value={settingsForm.starting_balance || ""} onChange={e => setSettingsForm((p: any) => ({...p, starting_balance: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                    <div><label className="text-xs text-gray-400 font-medium mb-1 block">Target Balance ($)</label><input value={settingsForm.target_balance || ""} onChange={e => setSettingsForm((p: any) => ({...p, target_balance: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  </div>
                  <button onClick={async () => {
                    setSettingsSaving(true);
                    const payload: any = {};
                    if (settingsForm.title) payload.title = settingsForm.title;
                    if (settingsForm.type) payload.type = settingsForm.type;
                    if (settingsForm.end_date) payload.end_date = settingsForm.end_date;
                    if (settingsForm.start_date) payload.start_date = settingsForm.start_date;
                    if (settingsForm.starting_balance) payload.starting_balance = parseFloat(settingsForm.starting_balance);
                    if (settingsForm.target_balance) payload.target_balance = parseFloat(settingsForm.target_balance);
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
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-participants`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const rows = (data.participants || []).map((p: any) => `${p.rank||''},${p.nickname},${p.email||''},${p.accountNumber},${p.accountType},${p.lastKnownBalance||''},${p.qualifiedProfit||''},${p.totalTrades||0},${p.disqualified?'DQ':'Active'}`);
                        const csv = "rank,nickname,email,account,type,balance,profit,trades,status\n" + rows.join("\n");
                        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(settingsForm.title || 'challenge').replace(/\s+/g, '_')}_evaluation.csv`; a.click();
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-all">&#128203; Evaluation CSV</button>
                    <button onClick={async () => {
                      try {
                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
                        const res = await fetch(`${apiUrl}/api/challenges/${selectedChallengeId}/rules`);
                        const data = await res.json();
                        hostDownloadRulesHTML({ ...selectedChallenge, ...settingsForm }, data.rules || [], data.isCent || false);
                      } catch { hostDownloadRulesHTML({ ...selectedChallenge, ...settingsForm }, [], false); }
                    }} className="p-2.5 rounded-lg bg-royal/10 border border-royal/30 text-royal text-xs font-semibold hover:bg-royal/20 transition-all">&#128203; Rules Image</button>
                  </div>
                </div>

                {/* Stat Exports */}
                <div className="border-t border-white/10 pt-5">
                  <p className="text-xs text-gray-400 font-semibold mb-3 uppercase tracking-wider">Stat Exports</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(settingsForm.type || selectedChallenge?.type) === 'hybrid' ? (<>
                      <button onClick={async () => {
                        try {
                          const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
                          const data = await res.json();
                          const lb = (data.leaderboard || []).filter((e: any) => e.accountType === 'real').sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999));
                          hostDownloadLeaderboardHTML({ ...selectedChallenge, ...settingsForm }, lb, 'Real');
                        } catch { alert("Export failed"); }
                      }} className="p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/20 transition-all">&#127942; Real Leaderboard</button>
                      <button onClick={async () => {
                        try {
                          const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
                          const data = await res.json();
                          const lb = (data.leaderboard || []).filter((e: any) => e.accountType === 'demo').sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999));
                          hostDownloadLeaderboardHTML({ ...selectedChallenge, ...settingsForm }, lb, 'Demo');
                        } catch { alert("Export failed"); }
                      }} className="p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/20 transition-all">&#127942; Demo Leaderboard</button>
                    </>) : (
                      <button onClick={async () => {
                        try {
                          const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/leaderboard`, { headers: { Authorization: `Bearer ${getToken()}` } });
                          const data = await res.json();
                          const lb = (data.leaderboard || []).sort((a: any, b: any) => (a.rank || 999) - (b.rank || 999));
                          hostDownloadLeaderboardHTML({ ...selectedChallenge, ...settingsForm }, lb);
                        } catch { alert("Export failed"); }
                      }} className="p-2.5 rounded-lg bg-gold/10 border border-gold/30 text-gold text-xs font-semibold hover:bg-gold/20 transition-all">&#127942; Leaderboard Image</button>
                    )}
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/full-overview`, { headers: { Authorization: `Bearer ${getToken()}` } });
                        const data = await res.json();
                        const m = data.metrics?.real || {};
                        const md = data.metrics?.demo || {};
                        const lb = leaderboard;
                        const realTop = lb.filter((e: any) => e.accountType === 'real' && !e.isDisqualified).sort((a: any, b: any) => (b.adjustedBalance || 0) - (a.adjustedBalance || 0))[0];
                        const demoTop = lb.filter((e: any) => e.accountType === 'demo' && !e.isDisqualified).sort((a: any, b: any) => (b.adjustedBalance || 0) - (a.adjustedBalance || 0))[0];
                        hostDownloadStatsHTML({ ...selectedChallenge, ...settingsForm }, {
                          totalParticipants: data.totalParticipants || 0,
                          totalTrades: data.totalTrades || 0,
                          realParticipants: data.realParticipants || 0,
                          demoParticipants: data.demoParticipants || 0,
                          realAboveTarget: data.aboveTarget || 0,
                          demoAboveTarget: 0,
                          blownReal: m.blownAccounts || 0,
                          blownDemo: md.blownAccounts || 0,
                          dqReal: m.disqualifiedAccounts || 0,
                          dqDemo: md.disqualifiedAccounts || 0,
                          challengeType: selectedChallenge?.type || 'hybrid',
                          realTopBalance: realTop ? { nickname: realTop.nickname, balance: realTop.isCent ? `${realTop.adjustedBalance?.toFixed(0)}¢` : `$${realTop.adjustedBalance?.toFixed(2)}` } : null,
                          demoTopBalance: demoTop ? { nickname: demoTop.nickname, balance: `$${demoTop.adjustedBalance?.toFixed(2)}` } : null,
                          realHighestProfit: m.maxProfitTrade ? { nickname: m.maxProfitTrade.nickname, profit: m.maxProfitTrade.isCent ? `${Number(m.maxProfitTrade.profit).toFixed(2)}¢` : `$${Number(m.maxProfitTrade.profit).toFixed(2)}` } : null,
                          demoHighestProfit: md.maxProfitTrade ? { nickname: md.maxProfitTrade.nickname, profit: `$${Number(md.maxProfitTrade.profit).toFixed(2)}` } : null,
                          realBestWinRate: m.bestOverallWinRate ? { nickname: m.bestOverallWinRate.nickname, rate: `${Math.min(100, m.bestOverallWinRate.winRate)}%` } : null,
                          demoBestWinRate: md.bestOverallWinRate ? { nickname: md.bestOverallWinRate.nickname, rate: `${Math.min(100, md.bestOverallWinRate.winRate)}%` } : null,
                          realBestRKR: m.bestRuleKeeping || null, realWorstRKR: m.worstRuleKeeping || null,
                          demoBestRKR: md.bestRuleKeeping || null, demoWorstRKR: md.worstRuleKeeping || null,
                          instrumentsCount: data.instrumentsCount || 0,
                          topInstruments: m.topInstruments || md.topInstruments || [],
                          mostBrokenRule: data.topViolations?.[0] || null,
                          mostActiveDay: m.mostActiveDay || md.mostActiveDay || null,
                        });
                      } catch { alert("Export failed"); }
                    }} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-all">&#128202; Challenge Stats</button>
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

      {/* Participant Detail Modal — exact admin copy */}
      {selectedParticipant && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setSelectedParticipant(null)}>
          <div className="glass rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <h3 className="text-lg font-bold text-white">{selectedParticipant.nickname}</h3>
              <button onClick={() => setSelectedParticipant(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              {selectedParticipant.isWithdrawn && (
                <div className="p-4 rounded-xl bg-gray-500/10 border border-gray-500/20">
                  <p className="text-xs text-gray-400 mb-1">🚪 Account Exited</p>
                  <p className="text-sm text-white">User withdrew all funds and is out of the challenge.</p>
                  {selectedParticipant.totalWithdrawn > 0 && <p className="text-xs text-gray-500 mt-1">Total withdrawn: {cur(selectedParticipant.totalWithdrawn, selectedParticipant.isCent)}</p>}
                </div>
              )}
              {selectedParticipant.isBlown && !selectedParticipant.isWithdrawn && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-gray-400 mb-1">💀 Account Blown</p>
                  <p className="text-sm text-white">Balance hit zero from trading losses.</p>
                </div>
              )}
              {(selectedParticipant.isDisqualified || selectedParticipant.disqualified) ? (
                <div className="p-4 rounded-xl bg-loss/10 border border-loss/20">
                  <p className="text-xs text-gray-400 mb-1">Disqualified</p>
                  <p className="text-sm text-white">{selectedParticipant.disqualifyReason || selectedParticipant.disqualified_reason || "No reason provided"}</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Rank</p><p className="text-2xl font-bold gradient-text">#{selectedParticipant.rank || "—"}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Balance</p><p className="text-2xl font-bold text-white">{cur(selectedParticipant.adjustedBalance, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Profit</p><p className={`text-lg font-bold ${(selectedParticipant.qualifiedProfit || 0) >= 0 ? "text-profit" : "text-loss"}`}>{cur(selectedParticipant.qualifiedProfit, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Gross</p><p className="text-lg font-bold text-white">{cur(selectedParticipant.grossProfit, selectedParticipant.isCent)}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Trades</p><p className="text-lg font-bold text-white">{selectedParticipant.totalTrades || 0}</p></div>
                  <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500">Flagged</p><p className={`text-lg font-bold ${(selectedParticipant.flaggedTrades || 0) > 0 ? "text-loss" : "text-profit"}`}>{selectedParticipant.flaggedTrades || 0}</p><p className="text-[10px] text-gray-500 mt-0.5">RKR: <span className="text-white font-semibold">{(selectedParticipant.totalTrades || 0) > 0 ? `${Math.round(((selectedParticipant.qualifiedTrades || 0) / selectedParticipant.totalTrades) * 100)}%` : "—"}</span></p></div>
                </div>
              )}
              {/* ACCOUNT GROWTH CHART */}
              {(selectedParticipant.totalTrades || 0) > 0 && (selectedParticipant.registrationId || selectedParticipant.id) && (
                <BalanceChart
                  registrationId={selectedParticipant.registrationId || selectedParticipant.id}
                  challengeId={selectedChallengeId!}
                  adminSecretPath={process.env.NEXT_PUBLIC_ADMIN_PATH || ""}
                  isCent={selectedParticipant.isCent || false}
                  height={160}
                />
              )}
              <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><span className={`px-3 py-1 rounded text-xs font-semibold ${selectedParticipant.accountType === "real" ? "bg-gold/10 text-gold" : "bg-royal/10 text-royal"}`}>{selectedParticipant.accountType}</span></div>
              {/* Win Rate & Avg RR */}
              {selectedParticipantTrades.length > 0 && (() => {
                const _wins = selectedParticipantTrades.filter((t: any) => (t.profit > 0 || Number(t.profit) > 0) && t.is_qualified !== false && t.isQualified !== false);
                const _losses = selectedParticipantTrades.filter((t: any) => (t.profit < 0 || Number(t.profit) < 0));
                const _decided = _wins.length + _losses.length;
                const _wr = _decided > 0 ? Math.round((_wins.length / _decided) * 100) : 0;
                const _aw = _wins.length > 0 ? _wins.reduce((s: number, t: any) => s + Number(t.profit), 0) / _wins.length : 0;
                const _al = _losses.length > 0 ? Math.abs(_losses.reduce((s: number, t: any) => s + Number(t.profit), 0) / _losses.length) : 0;
                const _rr = _al > 0 ? _aw / _al : 0;
                return (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate (Qualified)</p><p className={`text-lg font-bold ${_wr >= 50 ? "text-profit" : "text-loss"}`}>{_wr}%</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{_rr > 0 ? _rr.toFixed(2) : "—"}</p></div>
                  </div>
                );
              })()}
              {/* Trade History — grouped by positionId (admin style) */}
              {(selectedParticipantTrades.length > 0 || selectedParticipantBalanceOps.length > 0) && (() => {
                const fmtEAT = (d: string) => d ? new Date(new Date(d).getTime() + 3*60*60*1000).toISOString().substring(11,16) : '';
                const fmtDateEAT = (d: string) => { const dt = new Date(new Date(d).getTime() + 3*60*60*1000); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
                const c = (v: number) => cur(v, selectedParticipant?.isCent);
                const opMeta: Record<string, { icon: string; label: string; bg: string; border: string; textColor: string; sign: (a: number) => string }> = {
                  deposit:    { icon: '💰', label: 'Deposit',    bg: 'bg-profit/10', border: 'border-profit/20', textColor: 'text-profit',      sign: () => '+' },
                  withdrawal: { icon: '🚪', label: 'Withdrawal', bg: 'bg-loss/10',   border: 'border-loss/20',   textColor: 'text-loss',        sign: () => '-' },
                  swap:       { icon: '🔄', label: 'Swap',       bg: 'bg-amber-500/10', border: 'border-amber-500/20', textColor: 'text-amber-400', sign: (a) => a < 0 ? '-' : '+' },
                  dividend:   { icon: '📊', label: 'Dividend',   bg: 'bg-royal/10',  border: 'border-royal/20',  textColor: 'text-royal',       sign: () => '+' },
                };
                // Group trades by positionId
                const posMap = new Map<number, any[]>();
                for (const t of selectedParticipantTrades) {
                  const key = t.position_id || t.positionId || t.ticket;
                  if (!posMap.has(key)) posMap.set(key, []);
                  posMap.get(key)!.push(t);
                }
                Array.from(posMap.values()).forEach(g => g.sort((a: any, b: any) => new Date(a.close_time || a.closeTime || 0).getTime() - new Date(b.close_time || b.closeTime || 0).getTime()));
                type FeedItem = { sortTime: number } & ({ kind: 'trade'; group: any[] } | { kind: 'op'; op: any });
                const feed: FeedItem[] = [];
                posMap.forEach(group => {
                  feed.push({ kind: 'trade', group, sortTime: new Date(group[0].close_time || group[0].closeTime || 0).getTime() });
                });
                for (const op of selectedParticipantBalanceOps) {
                  feed.push({ kind: 'op', op, sortTime: new Date(op.time || op.closeTime || 0).getTime() });
                }
                feed.sort((a, b) => b.sortTime - a.sortTime);
                const tradeCount = posMap.size;
                return (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-gray-400 mb-2">Account History · {tradeCount} trade{tradeCount !== 1 ? 's' : ''}</p>
                    <div className="space-y-2 max-h-[360px] overflow-y-auto">
                      {feed.map((item, idx) => {
                        if (item.kind === 'op') {
                          const op = item.op;
                          const opType = op.type || op.opType || 'deposit';
                          const isPostStart = selectedChallenge?.start_date && new Date(op.time || op.closeTime) >= new Date(selectedChallenge.start_date);
                          const isDeposit = opType === 'deposit';
                          const meta = (isDeposit && isPostStart)
                            ? { icon: '⚠️', label: 'Deposit (Post-Start)', bg: 'bg-loss/10', border: 'border-loss/20', textColor: 'text-loss', sign: () => '+' }
                            : (opMeta[opType] || opMeta.deposit);
                          return (
                            <div key={`op-${op.ticket || idx}`} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${meta.bg} ${meta.border}`}>
                              <div>
                                <p className="text-xs text-white font-medium">{meta.icon} {meta.label}</p>
                                <p className="text-[10px] text-gray-500">{fmtDateEAT(op.time || op.closeTime)} {fmtEAT(op.time || op.closeTime)} EAT</p>
                              </div>
                              <p className={`text-xs font-bold ${meta.textColor}`}>{meta.sign(Number(op.amount))}{c(Math.abs(Number(op.amount)))}</p>
                            </div>
                          );
                        }
                        const group = item.group;
                        if (group.length === 1) {
                          const t = group[0];
                          const tradeType = t.trade_type || t.type || '';
                          const closeTime = t.close_time || t.closeTime || '';
                          const openTime = t.open_time || t.openTime || '';
                          const isQualified = t.is_qualified !== false && t.isQualified !== false;
                          const violations = t.violations ? (typeof t.violations === 'string' ? JSON.parse(t.violations) : t.violations) : [];
                          return (
                            <div key={`t-${t.ticket}-${idx}`} onClick={() => setSelectedTrade(t)} className={`py-2 px-3 rounded-lg cursor-pointer hover:brightness-125 transition-all ${!isQualified ? 'bg-loss/10 border border-loss/20' : 'bg-white/5'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${tradeType.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{tradeType}</span>
                                  <div>
                                    <p className="text-xs text-white font-medium">{t.symbol}</p>
                                    <p className="text-[10px] text-gray-500">{openTime ? fmtDateEAT(openTime) : ''} {openTime ? fmtEAT(openTime) : ''} → {closeTime ? fmtEAT(closeTime) : ''}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${Number(t.profit) >= 0 ? 'text-profit' : 'text-loss'}`}>{c(Number(t.profit))}</p>
                                  <p className="text-[10px] text-gray-500">{t.volume} lot {!isQualified ? <span className="text-loss">🚩</span> : null}</p>
                                </div>
                              </div>
                              {!isQualified && violations.length > 0 && <p className="text-[10px] text-loss mt-1 pl-7">⚠️ {violations[0]}</p>}
                            </div>
                          );
                        }
                        // Grouped partial closes
                        const totalProfit = group.reduce((s: number, t: any) => s + Number(t.profit), 0);
                        const totalVol = group.reduce((s: number, t: any) => s + Number(t.volume), 0);
                        const anyFlagged = group.some((t: any) => t.is_qualified === false || t.isQualified === false);
                        const first = group[0];
                        const firstType = first.trade_type || first.type || '';
                        const firstOpen = first.open_time || first.openTime || '';
                        return (
                          <div key={`g-${first.position_id || first.positionId || first.ticket}-${idx}`} className={`rounded-lg overflow-hidden ${anyFlagged ? 'border border-loss/20' : 'border border-white/10'}`}>
                            <div onClick={() => setSelectedTrade(first)} className={`py-2 px-3 cursor-pointer hover:brightness-125 transition-all ${anyFlagged ? 'bg-loss/10' : 'bg-white/5'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${firstType.toLowerCase() === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{firstType}</span>
                                  <div>
                                    <p className="text-xs text-white font-medium">{first.symbol} <span className="text-gray-500 font-normal">{group.length} closes</span></p>
                                    <p className="text-[10px] text-gray-500">{firstOpen ? fmtDateEAT(firstOpen) : ''} {firstOpen ? fmtEAT(firstOpen) : ''}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${totalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>{c(totalProfit)}</p>
                                  <p className="text-[10px] text-gray-500">{totalVol.toFixed(2)} lot {anyFlagged ? <span className="text-loss">🚩</span> : null}</p>
                                </div>
                              </div>
                            </div>
                            {group.map((t: any) => {
                              const tClose = t.close_time || t.closeTime || '';
                              const tIsQual = t.is_qualified !== false && t.isQualified !== false;
                              const tViolations = t.violations ? (typeof t.violations === 'string' ? JSON.parse(t.violations) : t.violations) : [];
                              return (
                                <div key={t.ticket} onClick={() => setSelectedTrade(t)} className={`py-1.5 px-3 pl-6 border-t border-white/5 cursor-pointer hover:brightness-125 transition-all ${!tIsQual ? 'bg-loss/5' : ''}`}>
                                  <div className="flex items-center justify-between">
                                    <p className="text-[10px] text-gray-500">└ → {fmtEAT(tClose)} · {t.volume} lot</p>
                                    <p className={`text-[10px] font-semibold ${Number(t.profit) >= 0 ? 'text-profit' : 'text-loss'}`}>{c(Number(t.profit))}</p>
                                  </div>
                                  {!tIsQual && tViolations.length > 0 && <p className="text-[10px] text-loss mt-1 pl-2">⚠️ {tViolations[0]}</p>}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* Export MT5 Trade History */}
              {(selectedParticipant.registrationId || selectedParticipant.id) && (
                <button
                  onClick={async () => {
                    try {
                      const regId = selectedParticipant.registrationId || selectedParticipant.id;
                      const res = await fetch(`${API_URL}/api/host/challenge/${selectedChallengeId}/export-user-trades?registration_id=${regId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
                      if (!res.ok) { alert("Export failed"); return; }
                      const data = await res.json();
                      const html = generateTradesHTML(data);
                      const blob = new Blob([html], { type: "text/html" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${data.user?.nickname || selectedParticipant.nickname || "trades"}_MT5_history.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch { alert("Export failed"); }
                  }}
                  className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 font-semibold transition-all text-sm"
                >
                  <FileText size={14} /> Export MT5 Trade History
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trade Detail Modal */}
      {selectedTrade && (() => {
        const t = selectedTrade;
        const fmtEAT = (s: string) => s ? new Date(new Date(s).getTime()+3*60*60*1000).toISOString().substring(0,16).replace("T"," ")+" EAT" : "—";
        const c = (v: number) => cur(v, selectedParticipant?.isCent);
        const violations: string[] = t.violations ? (typeof t.violations === 'string' ? JSON.parse(t.violations) : (Array.isArray(t.violations) ? t.violations : [])) : [];
        const isQualified = t.is_qualified !== false && t.isQualified !== false;
        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setSelectedTrade(null)}>
            <div className="bg-[#111827] rounded-2xl border border-white/10 p-5 max-w-sm w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Ticket #{t.ticket}</h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">{t.symbol} · {(t.trade_type || t.type || '').toUpperCase()} · {selectedParticipant?.nickname}</p>
                </div>
                <button onClick={() => setSelectedTrade(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={16} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Direction</p><span className={`px-2 py-0.5 rounded font-bold text-[10px] ${(t.trade_type || t.type || '').toLowerCase()==='buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>{(t.trade_type || t.type || '').toUpperCase()}</span></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Lots</p><p className="text-white font-semibold">{Number(t.volume).toFixed(2)}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Open</p><p className="text-white">{t.open_price || t.openPrice}</p><p className="text-[10px] text-gray-500">{fmtEAT(t.open_time || t.openTime)}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Close</p><p className="text-white">{t.close_price || t.closePrice}</p><p className="text-[10px] text-gray-500">{fmtEAT(t.close_time || t.closeTime)}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Stop Loss</p>{(t.stop_loss || t.stopLoss) ? <p className="text-white">{t.stop_loss || t.stopLoss}</p> : <p className="text-gray-500">—</p>}</div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Take Profit</p>{(t.take_profit || t.takeProfit) ? <p className="text-white">{t.take_profit || t.takeProfit}</p> : <p className="text-gray-500">—</p>}</div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Profit</p><p className={`font-bold ${Number(t.profit) >= 0 ? 'text-profit' : 'text-loss'}`}>{cur(Number(t.profit))}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Commission</p><p className="text-gray-300">{cur(Number(t.commission ?? 0))}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Status</p><p className={`font-semibold ${!isQualified ? 'text-loss' : 'text-profit'}`}>{!isQualified ? '🚩 Flagged' : '✓ Qualified'}</p></div>
                <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Swap</p><p className="text-gray-300">{cur(Number(t.swap ?? 0))}</p></div>
              </div>
              {violations.length > 0 && (
                <div className="bg-loss/10 border border-loss/20 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-loss font-semibold mb-1">Violations</p>
                  {violations.map((v: string, i: number) => <p key={i} className="text-[10px] text-loss/80">⚠️ {v}</p>)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Verify Popup Modal */}
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
                    <div className="flex justify-between p-3 bg-white/5 rounded-lg"><span className="text-xs text-gray-400">Balance</span><span className="text-sm text-white font-bold">${Number(verifyPopup.balance).toFixed(2)}</span></div>
                    {verifyPopup.equity != null && <div className="flex justify-between p-3 bg-white/5 rounded-lg"><span className="text-xs text-gray-400">Equity</span><span className="text-sm text-white font-bold">${Number(verifyPopup.equity).toFixed(2)}</span></div>}
                  </>
                ) : (
                  <div className="p-3 bg-white/5 rounded-lg text-center">
                    <p className="text-xs text-gray-400">✅ Credentials are valid — account is accessible</p>
                    <p className="text-[10px] text-gray-500 mt-1">Balance will show after the next update cycle</p>
                  </div>
                )}
              </div>
            )}
            {!verifyPopup.verified && (
              <div>
                <p className="text-sm text-loss mb-2">{verifyPopup.error || "Unknown error"}</p>
                {verifyPopup.credentialIssue && <p className="text-[10px] text-gold mt-1">⚠️ Credential issue — password may have changed</p>}
              </div>
            )}
            <button onClick={() => setVerifyPopup(null)} className="w-full mt-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-gray-300 text-sm font-semibold hover:bg-white/20 transition-all">Close</button>
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

function ChangePasswordSection({ getToken }: { getToken: () => string }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

  const handleChange = async () => {
    if (form.newPassword.length < 8) { setResult("❌ New password must be at least 8 characters"); return; }
    if (form.newPassword !== form.confirmPassword) { setResult("❌ Passwords don't match"); return; }
    setSaving(true); setResult("");
    try {
      const res = await fetch(`${apiUrl}/api/host/change-password`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
      const data = await res.json();
      if (res.ok && data.success) { setResult("✅ Password changed successfully"); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); }
      else setResult(`❌ ${data.error || "Failed to change password"}`);
    } catch { setResult("❌ Network error"); }
    setSaving(false);
    setTimeout(() => setResult(""), 5000);
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Key size={16} className="text-gold" /> Change Password</h3>
      {result && <p className={`text-xs mb-3 ${result.startsWith("✅") ? "text-profit" : "text-loss"}`}>{result}</p>}
      <div className="space-y-3">
        <div><label className="text-xs text-gray-400 mb-1 block">Current Password</label><input type="password" value={form.currentPassword} onChange={e => setForm(p => ({...p, currentPassword: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
        <div><label className="text-xs text-gray-400 mb-1 block">New Password</label><input type="password" value={form.newPassword} onChange={e => setForm(p => ({...p, newPassword: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
        <div><label className="text-xs text-gray-400 mb-1 block">Confirm New Password</label><input type="password" value={form.confirmPassword} onChange={e => setForm(p => ({...p, confirmPassword: e.target.value}))} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
        <button onClick={handleChange} disabled={saving || !form.currentPassword || !form.newPassword || !form.confirmPassword} className="px-5 py-2.5 rounded-xl bg-gold/10 text-gold text-sm font-semibold border border-gold/20 hover:bg-gold/20 disabled:opacity-40 transition-all">{saving ? "Saving..." : "Change Password"}</button>
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
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
  const getToken = () => localStorage.getItem("host_token") || "";

  useEffect(() => {
    fetch(`${apiUrl}/api/host/broker-status`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(data => { setHasBroker(data.hasBrokerIntegration || false); setMaskedEmail(data.maskedEmail || null); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.brokerEmail || !form.brokerPassword) { setError("Email and password required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`${apiUrl}/api/host/broker-credentials`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await res.json();
      if (res.ok && d.success) { setError(""); setSaved(true); setTimeout(() => { setHasBroker(true); setShowForm(false); setMaskedEmail(d.email ? d.email.substring(0, 2) + '***@' + d.email.split('@')[1] : null); setForm({ brokerEmail: "", brokerPassword: "" }); }, 1500); }
      else { setError(d.error || "Authentication failed"); }
    } catch { setError("Network error"); }
    setSaving(false); setTimeout(() => setSaved(false), 3000);
  };

  if (loading) return <div className="glass rounded-2xl border border-white/10 p-5"><Loader2 className="animate-spin text-royal mx-auto" size={20} /></div>;

  return (
    <div className="glass rounded-2xl border border-white/10 p-5">
      <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Shield size={16} className="text-gold" /> Broker Integration</h3>
      <p className="text-xs text-gray-500 mb-4">Connect your broker credentials to verify participant allocation automatically. All credentials are encrypted with AES-256-GCM and never stored in plain text.</p>
      {saved && <div className="p-2 mb-3 rounded-lg bg-profit/10 text-profit text-xs font-semibold">✅ Credentials verified & connected successfully</div>}
      {hasBroker && !showForm ? (
        <div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-profit/5 border border-profit/20 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-profit" />
            <div>
              <p className="text-sm text-profit font-medium">Broker Integrated</p>
              {maskedEmail && <p className="text-xs text-gray-400 mt-0.5">{maskedEmail}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 text-gray-300 border border-white/10">Update</button>
            <button onClick={async () => {
              // Pre-check what will be affected
              try {
                const checkRes = await fetch(`${apiUrl}/api/host/broker-removal-check`, { headers: { Authorization: `Bearer ${getToken()}` } });
                const checkData = await checkRes.json();
                let confirmMsg = "Are you sure you want to remove broker integration?";
                if (checkData.warnings && checkData.warnings.length > 0) {
                  confirmMsg = "⚠️ Warning:\n\n" + checkData.warnings.join("\n\n") + "\n\nAre you sure you want to continue?";
                }
                if (!confirm(confirmMsg)) return;
              } catch {
                if (!confirm("Remove broker integration? This may affect active challenges.")) return;
              }
              // Proceed with removal
              await fetch(`${apiUrl}/api/host/broker-credentials`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
              setHasBroker(false); setMaskedEmail(null);
            }} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-loss/10 text-loss border border-loss/20">Remove Integration</button>
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
                <div><label className="text-xs text-gray-400 mb-1 block">Timezone</label><select value={createForm.timezone} onChange={(e: any) => setCreateForm({...createForm, timezone: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none [&>option]:bg-[#0f1629] [&>option]:text-white"><option value="Africa/Nairobi">East Africa (Nairobi) UTC+3</option><option value="Africa/Lagos">West Africa (Lagos) UTC+1</option><option value="Africa/Cairo">Egypt (Cairo) UTC+2</option><option value="Africa/Johannesburg">South Africa (Johannesburg) UTC+2</option><option value="Asia/Dubai">UAE (Dubai) UTC+4</option><option value="Asia/Riyadh">Saudi Arabia (Riyadh) UTC+3</option><option value="Asia/Kolkata">India (Kolkata) UTC+5:30</option><option value="Asia/Shanghai">China (Shanghai) UTC+8</option><option value="Asia/Tokyo">Japan (Tokyo) UTC+9</option><option value="Asia/Singapore">Singapore UTC+8</option><option value="Europe/London">UK (London) UTC+0/+1</option><option value="Europe/Berlin">Germany (Berlin) UTC+1/+2</option><option value="Europe/Moscow">Russia (Moscow) UTC+3</option><option value="Europe/Istanbul">Turkey (Istanbul) UTC+3</option><option value="America/New_York">US Eastern (New York) UTC-5/-4</option><option value="America/Chicago">US Central (Chicago) UTC-6/-5</option><option value="America/Los_Angeles">US Pacific (LA) UTC-8/-7</option><option value="America/Sao_Paulo">Brazil (Sao Paulo) UTC-3</option><option value="Australia/Sydney">Australia (Sydney) UTC+10/+11</option><option value="Pacific/Auckland">New Zealand (Auckland) UTC+12/+13</option><option value="UTC">UTC</option></select></div>
                {/* Deposit Mode */}
                <div>
                  <label className="text-xs text-gray-400 mb-2 block">Deposit Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'fixed'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'fixed' ? 'border-royal bg-royal/10 text-royal' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Fixed Deposit</button>
                    <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'max_limit'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'max_limit' ? 'border-gold bg-gold/10 text-gold' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Max Limit</button>
                    <button type="button" onClick={() => setCreateForm({...createForm, deposit_mode: 'min_limit'})} className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all ${createForm.deposit_mode === 'min_limit' ? 'border-profit bg-profit/10 text-profit' : 'border-white/20 text-gray-400 hover:border-white/30'}`}>Min Limit</button>
                  </div>
                  <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-white/5">
                    {createForm.deposit_mode === 'fixed' && <p className="text-[11px] text-gray-400"><span className="text-royal font-semibold">Fixed Deposit:</span> All participants start with the same balance. Target is a fixed dollar amount. Leaderboard ranked by balance. Best for equal-start competitions.</p>}
                    {createForm.deposit_mode === 'max_limit' && <p className="text-[11px] text-gray-400"><span className="text-gold font-semibold">Max Limit:</span> Participants can deposit any amount up to a maximum cap. Target is in growth %. SL and drawdown rules must be in %. Leaderboard ranked by growth %. Best for flexible-entry challenges.</p>}
                    {createForm.deposit_mode === 'min_limit' && <p className="text-[11px] text-gray-400"><span className="text-profit font-semibold">Min Limit:</span> Participants must deposit at least a minimum amount. Target is in growth %. SL and drawdown rules must be in %. Leaderboard ranked by growth %. Best for serious traders.</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-400 mb-1 block">Starting Balance ($)</label><input value={createForm.starting_balance} onChange={(e: any) => setCreateForm({...createForm, starting_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  {createForm.deposit_mode === 'fixed' ? (
                    <div><label className="text-xs text-gray-400 mb-1 block">Target Balance ($)</label><input value={createForm.target_balance} onChange={(e: any) => setCreateForm({...createForm, target_balance: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" /></div>
                  ) : (
                    <div><label className="text-xs text-gray-400 mb-1 block">Target Growth (%)</label><input value={createForm.target_percent} onChange={(e: any) => setCreateForm({...createForm, target_percent: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none" placeholder="e.g., 100" /></div>
                  )}
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
                    <button type="button" onClick={() => hostInfo?.hasBrokerIntegration && setCreateForm({...createForm, registration_mode: 'winnerpip'})} className={`p-3 rounded-xl border text-center transition-all ${!hostInfo?.hasBrokerIntegration ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-gray-500' : createForm.registration_mode === 'winnerpip' ? 'bg-royal/20 border-royal/40 text-royal' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                      <p className="text-sm font-semibold">Online</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Users register on WinnerPip</p>
                    </button>
                    <button type="button" onClick={() => setCreateForm({...createForm, registration_mode: 'manual'})} className={`p-3 rounded-xl border text-center transition-all ${createForm.registration_mode === 'manual' ? 'bg-gold/20 border-gold/40 text-gold' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'}`}>
                      <p className="text-sm font-semibold">Manual (CSV)</p>
                      <p className="text-[10px] mt-0.5 opacity-70">Upload participant list</p>
                    </button>
                  </div>
                  {!hostInfo?.hasBrokerIntegration && (
                    <div className="mt-3 p-3 rounded-xl bg-royal/5 border border-royal/20">
                      <p className="text-[11px] text-gray-300 leading-relaxed">To make participant registration and automatic allocation verification easier, you can do it directly on WinnerPip. Your credentials are encrypted with AES-256 and never stored in plain text.</p>
                      <button type="button" onClick={() => { onClose(); setShowAccountSettings(true); }} className="mt-2 px-3 py-1.5 rounded-lg bg-royal/20 border border-royal/30 text-royal text-[11px] font-semibold hover:bg-royal/30 transition-all">Integrate Broker</button>
                    </div>
                  )}
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

                {/* Prohibit Weekend Trading */}
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white font-medium">Prohibit Weekend Trading</p>
                    <Tip text="When ON, crypto trades on weekends are flagged and profits removed. Forex markets are closed on weekends anyway." />
                  </div>
                  <button type="button" onClick={() => setCreateRules({...createRules, rules_enabled: {...createRules.rules_enabled, weekend_trading: !createRules.rules_enabled.weekend_trading}})} className={`w-12 h-6 rounded-full transition-all ${createRules.rules_enabled.weekend_trading ? "bg-profit" : "bg-white/20"}`}><div className={`w-5 h-5 bg-white rounded-full transition-transform ${createRules.rules_enabled.weekend_trading ? "translate-x-6" : "translate-x-0.5"}`}></div></button>
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
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Deposit Mode</span><span className="text-white">{createForm.deposit_mode === 'max_limit' ? 'Max Limit' : createForm.deposit_mode === 'min_limit' ? 'Min Limit' : 'Fixed'}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">{createForm.deposit_mode === 'fixed' ? 'Balance' : createForm.deposit_mode === 'max_limit' ? 'Max Deposit' : 'Min Deposit'}</span><span className="text-white">${createForm.starting_balance}</span></div>
                  <div className="flex justify-between py-2 border-b border-white/5"><span className="text-gray-500">Target</span><span className="text-white">{createForm.deposit_mode !== 'fixed' ? `${createForm.target_percent}% growth` : `$${createForm.target_balance}`}</span></div>
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
                  {createRules.rules_enabled.weekend_trading && <div className="flex justify-between py-1.5"><span className="text-gray-500">Weekend Trading</span><span className="text-white">Prohibited</span></div>}
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

// ===== STAT EXPORT FUNCTIONS (matching admin exactly) =====

function hostDownloadLeaderboardHTML(challenge: any, lb: any[], categoryLabel?: string) {
  const top10 = lb.slice(0, 10);
  const realWinners = parseInt(challenge.real_winners_count || challenge.realWinnersCount || 0);
  const demoWinners = parseInt(challenge.demo_winners_count || challenge.demoWinnersCount || 0);
  const targetBalance = parseFloat(challenge.target_balance || challenge.targetBalance || 0);
  const isWinnerEntry = (e: any) => { if (e.isDisqualified || e.isWithdrawn || e.isBlown) return false; const count = e.accountType === 'demo' ? demoWinners : realWinners; const bal = Number(e.adjustedBalance || 0) - Number(e.totalWithdrawn || 0); const effectiveTarget = e.isCent ? targetBalance * 100 : targetBalance; return count > 0 && e.rank <= count && bal >= effectiveTarget; };
  const isAboveTarget = (e: any) => { if (e.isDisqualified || e.isWithdrawn || e.isBlown) return false; const bal = Number(e.adjustedBalance || 0) - Number(e.totalWithdrawn || 0); const effectiveTarget = e.isCent ? targetBalance * 100 : targetBalance; return bal >= effectiveTarget && effectiveTarget > 0; };
  const formatBal = (e: any) => { if (e.isDisqualified) return 'DQ'; const val = Number(e.adjustedBalance || 0); return e.isCent ? `${val.toFixed(0)}¢` : `$${val.toFixed(2)}`; };
  const rowsHTML = top10.map((e) => { const winner = isWinnerEntry(e); const aboveTarget = !winner && isAboveTarget(e); const rowClass = winner ? 'winner' : aboveTarget ? 'above-target' : ''; const rankLabel = winner ? '🏆' : `${e.rank}`; return `<div class="lb-row ${rowClass}"><div class="lb-rank">${rankLabel}</div><div class="lb-name">${e.nickname || '—'}</div><div class="lb-type" style="background:${e.accountType === 'real' ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.15)'};color:${e.accountType === 'real' ? '#fb923c' : '#60a5fa'}">${e.accountType}</div><div class="lb-balance">${formatBal(e)}</div><div class="lb-trades">${e.totalTrades} trades</div></div>`; }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${challenge.title} - Leaderboard</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0a0e1a}.page{width:1080px;height:1920px;padding:80px;display:flex;flex-direction:column;background:linear-gradient(135deg,#0a0e1a 0%,#111827 50%,#0a0e1a 100%);position:relative;overflow:hidden;page-break-after:always}.page.landscape{width:1920px;height:1080px;padding:60px 100px}.glow{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(150px);opacity:0.15}.glow1{top:-200px;right:-100px;background:#F5B400}.glow2{bottom:-200px;left:-100px;background:#16C784}.header{text-align:center;margin-bottom:50px}.title{font-size:44px;font-weight:800;color:#fff;margin-bottom:8px}.subtitle{font-size:18px;color:#94a3b8}.lb-container{flex:1;display:flex;flex-direction:column;gap:12px;max-width:900px;margin:0 auto;width:100%}.page.landscape .lb-container{max-width:1400px}.lb-row{display:flex;align-items:center;gap:20px;padding:20px 28px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px}.lb-row.winner{background:rgba(22,199,132,0.08);border-color:rgba(22,199,132,0.35)}.lb-row.above-target{background:rgba(22,199,132,0.04);border-color:rgba(22,199,132,0.15)}.lb-row.above-target .lb-name{color:rgba(22,199,132,0.8)}.lb-row.above-target .lb-balance{color:rgba(22,199,132,0.8)}.lb-rank{font-size:28px;width:50px;text-align:center;font-weight:700;color:#64748b}.lb-row.winner .lb-rank{color:#16C784;font-size:32px}.lb-row.winner .lb-name{color:#16C784}.lb-row.winner .lb-balance{color:#16C784}.lb-name{flex:1;font-size:20px;font-weight:700;color:#fff}.lb-type{font-size:12px;padding:4px 12px;border-radius:8px;font-weight:600;text-transform:uppercase}.lb-balance{font-size:22px;font-weight:700;color:#16C784;min-width:120px;text-align:right}.lb-trades{font-size:13px;color:#64748b;min-width:80px;text-align:right}.footer{text-align:center;margin-top:auto;padding-top:30px}.brand{font-size:16px;font-weight:700;color:#475569}</style></head><body><div class="page"><div class="glow glow1"></div><div class="glow glow2"></div><div class="header"><div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px"><img src="https://winnerpip.com/winnerpip-icon.png" style="width:44px;height:44px;border-radius:10px" onerror="this.style.display='none'" /></div><div class="title">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Leaderboard — Top 10${categoryLabel ? ` (<span style="color:${categoryLabel === 'Real' ? '#fb923c' : '#60a5fa'}">${categoryLabel} Account</span>)` : ''}</div></div><div class="lb-container">${rowsHTML}</div><div class="footer"><div class="brand">WinnerPip</div></div></div><div class="page landscape"><div class="glow glow1"></div><div class="glow glow2"></div><div class="header" style="margin-bottom:30px"><div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px"><img src="https://winnerpip.com/winnerpip-icon.png" style="width:52px;height:52px;border-radius:10px" onerror="this.style.display='none'" /></div><div class="title" style="font-size:38px">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Leaderboard — Top 10${categoryLabel ? ` (<span style="color:${categoryLabel === 'Real' ? '#fb923c' : '#60a5fa'}">${categoryLabel} Account</span>)` : ''}</div></div><div class="lb-container">${rowsHTML}</div><div class="footer"><div class="brand">WinnerPip</div></div></div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(challenge.title || 'challenge').replace(/\s+/g, '_')}_leaderboard${categoryLabel ? '_' + categoryLabel.toLowerCase() : ''}.html`; a.click(); URL.revokeObjectURL(url);
}

function hostDownloadStatsHTML(challenge: any, stats: any) {
  const s = stats;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${challenge.title} - Stats</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0a0e1a}
.page{width:1080px;min-height:1920px;padding:80px 60px;display:flex;flex-direction:column;background:linear-gradient(160deg,#0a0e1a 0%,#0f172a 40%,#0a0e1a 100%);position:relative;overflow:hidden}
.glow{position:absolute;width:700px;height:700px;border-radius:50%;filter:blur(180px);opacity:0.12}
.glow1{top:-300px;right:-200px;background:#F5B400}
.glow2{bottom:-300px;left:-200px;background:#16C784}
.glow3{top:50%;left:50%;transform:translate(-50%,-50%);background:#1F6FEB;opacity:0.05;width:900px;height:900px}
.header{text-align:center;margin-bottom:50px}
.logo{font-size:52px;margin-bottom:12px}
.title{font-size:38px;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-0.5px}
.subtitle{font-size:15px;color:#64748b;font-weight:500;letter-spacing:1px;text-transform:uppercase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:920px;margin:0 auto;width:100%}
.card{padding:28px 30px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:20px;backdrop-filter:blur(10px)}
.card.full{grid-column:span 2}
.card.highlight{border-color:rgba(22,199,132,0.25);background:rgba(22,199,132,0.03)}
.card-label{font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px}
.card-value{font-size:32px;font-weight:800;color:#fff}
.card-value.green{color:#16C784}
.card-value.gold{color:#F5B400}
.card-value.small{font-size:20px;font-weight:700}
.dual{display:flex;gap:40px;align-items:center}
.dual-item{flex:1}
.tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-right:8px}
.tag.real{background:rgba(249,115,22,0.15);color:#fb923c}
.tag.demo{background:rgba(59,130,246,0.15);color:#60a5fa}
.pair-icon{font-size:18px;margin-right:6px}
.footer{text-align:center;margin-top:auto;padding-top:50px}
.brand{font-size:14px;font-weight:600;color:#334155;letter-spacing:2px;text-transform:uppercase}
</style></head><body>
<div class="page">
<div class="glow glow1"></div><div class="glow glow2"></div><div class="glow glow3"></div>
<div class="header">
  <div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-bottom:16px">
    <img src="https://winnerpip.com/birrforex-logo.png" style="width:52px;height:52px;border-radius:12px" onerror="this.style.display='none'" />
    <img src="https://winnerpip.com/winnerpip-icon.png" style="width:52px;height:52px;border-radius:12px" onerror="this.style.display='none'" />
  </div>
  <div class="title">${challenge.title || 'Trading Challenge'}</div>
  <div class="subtitle">Challenge Statistics</div>
</div>
<div class="grid">
  <div class="card highlight">
    <div class="card-label">Total Participants</div>
    <div class="card-value green">${s.totalParticipants || 0}</div>
  </div>
  <div class="card">
    <div class="card-label">Total Trades</div>
    <div class="card-value">${s.totalTrades || 0}</div>
  </div>
  ${s.challengeType === 'hybrid' ? `<div class="card">
    <div class="card-label">Participants</div>
    <div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small">${s.realParticipants || 0}</span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small">${s.demoParticipants || 0}</span></div>
    </div>
  </div>
  <div class="card highlight">
    <div class="card-label">Above Target 🎯</div>
    <div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small green">${s.realAboveTarget || 0}</span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small green">${s.demoAboveTarget || 0}</span></div>
    </div>
  </div>` : `<div class="card highlight">
    <div class="card-label">Above Target 🎯</div>
    <div class="card-value green">${s.realAboveTarget || s.demoAboveTarget || 0}</div>
  </div>
  <div class="card">
    <div class="card-label">💀 Blown / 🚫 Disqualified</div>
    <div class="dual">
      <div class="dual-item"><span class="card-value small" style="color:#f87171">${(s.blownReal || 0) + (s.blownDemo || 0)} 💀</span></div>
      <div class="dual-item"><span class="card-value small" style="color:#f87171">${(s.dqReal || 0) + (s.dqDemo || 0)} 🚫</span></div>
    </div>
  </div>`}
  ${s.challengeType === 'hybrid' ? `<div class="card full">
    <div class="card-label">💀 Blown / 🚫 Disqualified</div>
    <div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small" style="color:#f87171">${s.blownReal || 0} 💀 / ${s.dqReal || 0} 🚫</span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small" style="color:#f87171">${s.blownDemo || 0} 💀 / ${s.dqDemo || 0} 🚫</span></div>
    </div>
  </div>` : ''}
  <div class="card full">
    <div class="card-label">Top Qualified Balance 💰</div>
    ${s.challengeType === 'hybrid' ? `<div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small">${s.realTopBalance?.nickname || '—'} <span style="color:#16C784">(${s.realTopBalance?.balance || '—'})</span></span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small">${s.demoTopBalance?.nickname || '—'} <span style="color:#16C784">(${s.demoTopBalance?.balance || '—'})</span></span></div>
    </div>` : `<div class="card-value small">${(s.realTopBalance?.nickname || s.demoTopBalance?.nickname || '—')} <span style="color:#16C784">(${s.realTopBalance?.balance || s.demoTopBalance?.balance || '—'})</span></div>`}
  </div>
  <div class="card full">
    <div class="card-label">Highest Single Trade Profit 🔥</div>
    ${s.challengeType === 'hybrid' ? `<div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small">${s.realHighestProfit?.nickname || '—'} <span style="color:#16C784">(${s.realHighestProfit?.profit || '—'})</span></span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small">${s.demoHighestProfit?.nickname || '—'} <span style="color:#16C784">(${s.demoHighestProfit?.profit || '—'})</span></span></div>
    </div>` : `<div class="card-value small">${(s.realHighestProfit?.nickname || s.demoHighestProfit?.nickname || '—')} <span style="color:#16C784">(${s.realHighestProfit?.profit || s.demoHighestProfit?.profit || '—'})</span></div>`}
  </div>
  <div class="card full">
    <div class="card-label">Best Win Rate (Overall) 🏹</div>
    ${s.challengeType === 'hybrid' ? `<div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small">${s.realBestWinRate?.nickname || '—'} <span style="color:#F5B400">(${s.realBestWinRate?.rate || '—'})</span></span></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small">${s.demoBestWinRate?.nickname || '—'} <span style="color:#F5B400">(${s.demoBestWinRate?.rate || '—'})</span></span></div>
    </div>` : `<div class="card-value small">${(s.realBestWinRate?.nickname || s.demoBestWinRate?.nickname || '—')} <span style="color:#F5B400">(${s.realBestWinRate?.rate || s.demoBestWinRate?.rate || '—'})</span></div>`}
  </div>
  <div class="card">
    <div class="card-label">Best Rule Keeping 🛡️</div>
    ${s.challengeType === 'hybrid' ? `<div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small" style="color:#16C784">${s.realBestRKR?.rkr ?? '—'}%</span><div style="font-size:11px;color:#94a3b8;margin-top:4px">${s.realBestRKR?.nickname || '—'}${(s.realBestRKR?.tiedCount || 0) > 1 ? ` + ${s.realBestRKR.tiedCount - 1} more` : ''}</div></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small" style="color:#16C784">${s.demoBestRKR?.rkr ?? '—'}%</span><div style="font-size:11px;color:#94a3b8;margin-top:4px">${s.demoBestRKR?.nickname || '—'}${(s.demoBestRKR?.tiedCount || 0) > 1 ? ` + ${s.demoBestRKR.tiedCount - 1} more` : ''}</div></div>
    </div>` : `<div class="card-value small" style="color:#16C784">${s.bestRKR?.rkr ?? '—'}%</div><div style="font-size:11px;color:#94a3b8;margin-top:6px">${s.bestRKR?.nickname || '—'}${(s.bestRKR?.tiedCount || 0) > 1 ? ` + ${s.bestRKR.tiedCount - 1} more` : ''}</div>`}
  </div>
  <div class="card">
    <div class="card-label">Worst Rule Keeping ⚡</div>
    ${s.challengeType === 'hybrid' ? `<div class="dual">
      <div class="dual-item"><span class="tag real">Real</span><span class="card-value small" style="color:#f87171">${s.realWorstRKR?.rkr ?? '—'}%</span><div style="font-size:11px;color:#94a3b8;margin-top:4px">${s.realWorstRKR?.nickname || '—'}${(s.realWorstRKR?.tiedCount || 0) > 1 ? ` + ${s.realWorstRKR.tiedCount - 1} more` : ''}</div></div>
      <div class="dual-item"><span class="tag demo">Demo</span><span class="card-value small" style="color:#f87171">${s.demoWorstRKR?.rkr ?? '—'}%</span><div style="font-size:11px;color:#94a3b8;margin-top:4px">${s.demoWorstRKR?.nickname || '—'}${(s.demoWorstRKR?.tiedCount || 0) > 1 ? ` + ${s.demoWorstRKR.tiedCount - 1} more` : ''}</div></div>
    </div>` : `<div class="card-value small" style="color:#f87171">${s.worstRKR?.rkr ?? '—'}%</div><div style="font-size:11px;color:#94a3b8;margin-top:6px">${s.worstRKR?.nickname || '—'}${(s.worstRKR?.tiedCount || 0) > 1 ? ` + ${s.worstRKR.tiedCount - 1} more` : ''}</div>`}
  </div>
  <div class="card full">
    <div class="card-label">📊 Instruments Traded (${s.instrumentsCount || 0} total)</div>
    <div class="dual" style="gap:20px">
      ${(s.topInstruments || []).slice(0, 3).map((inst: any, i: number) => `<div class="dual-item"><span class="card-value small" style="color:${i === 0 ? '#F5B400' : i === 1 ? '#60a5fa' : '#a78bfa'}">${i + 1}. ${inst.symbol}</span><div style="font-size:11px;color:#64748b;margin-top:4px">${inst.tradeCount} trades · ${inst.totalLots.toFixed(2)} lots</div></div>`).join('')}
    </div>
  </div>
  <div class="card">
    <div class="card-label">Most Broken Rule ⚠️</div>
    <div class="card-value small" style="color:#f87171;font-size:16px">${s.mostBrokenRule?.rule || '—'} <span style="color:#64748b">(${s.mostBrokenRule?.count || 0}×)</span></div>
  </div>
  <div class="card">
    <div class="card-label">📅 Most Active Day</div>
    <div class="card-value small">${s.mostActiveDay?.day ? new Date(s.mostActiveDay.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</div>
    ${s.mostActiveDay ? `<div style="margin-top:8px;font-size:12px;color:#64748b">${s.mostActiveDay.tradeCount || s.mostActiveDay.trades || 0} trades</div>` : ''}
  </div>
</div>
<div class="footer"><div class="brand">BirrForex • WinnerPip</div></div>
</div>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${(challenge.title || 'challenge').replace(/\s+/g, '_')}_stats.html`; a.click();
  URL.revokeObjectURL(url);
}

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
    if (r === 'fake_sl')      return `<span style="color:#ef4444;font-weight:700">⚠ Max Risk Breached</span>`;
    if (r === 'no_candles')   return `<span style="color:#f59e0b;font-weight:700">? No Data</span>`;
    if (r === 'conflicting')  return `<span style="color:#f59e0b;font-weight:700">⚡ Conflicting Results — Rechecking</span>`;
    if (r === 'check_failed') return `<span style="color:#ef4444;font-weight:700">✗ Unresolvable — Penalty Applied</span>`;
    return `<span style="color:#6b7280">Skipped</span>`;
  };
  // Violation text often references other trades' tickets (e.g. "also open: #302576583
  // [XAUUSDc]") — turn those into in-page links that jump straight to that trade's row.
  const linkifyTickets = (text: string) =>
    text.replace(/#(\d+)/g, (m: string, tid: string) => `<a href="#trade-${tid}" style="color:#fbbf24;text-decoration:underline">#${tid}</a>`);
  // Group trades by positionId for partial close display
  const tradeList: any[] = trades || [];
  const posMap = new Map<number, any[]>();
  for (const t of tradeList) {
    const key = t.positionId ?? t.ticket;
    if (!posMap.has(key)) posMap.set(key, []);
    posMap.get(key)!.push(t);
  }
  Array.from(posMap.values()).forEach(g => g.sort((a: any, b: any) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()));
  const groups = Array.from(posMap.values()).sort((a, b) => new Date(b[b.length-1].closeTime).getTime() - new Date(a[a.length-1].closeTime).getTime());

  let rowNum = 0;
  const rows = groups.map((group: any[]) => {
    rowNum++;
    if (group.length === 1) {
      const t = group[0];
      const flagged = !t.isQualified;
      const bg = flagged ? "#2a0a0a" : (rowNum % 2 === 0 ? "#111827" : "#0f172a");
      const profitColor = t.profit >= 0 ? "#22c55e" : "#ef4444";
      const viols = linkifyTickets((t.violations || []).map((v: any) => typeof v === 'string' ? v : v?.detail || 'Rule violation').join('<br>'));
      return `<tr id="trade-${t.ticket}" class="trow" style="background:${bg};border-bottom:1px solid #1f2937">
        <td style="padding:8px 10px;color:#9ca3af;font-size:11px">${rowNum}</td>
        <td style="padding:8px 10px;color:#d1d5db;font-size:11px">${t.ticket}${t.positionId && t.positionId !== t.ticket ? `<br><span style="color:#4b5563;font-size:9px">pos:${t.positionId}</span>` : ''}</td>
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
    }
    // Partial close group
    const first = group[0];
    const totalProfit = group.reduce((s: number, t: any) => s + Number(t.profit), 0);
    const totalVol = group.reduce((s: number, t: any) => s + Number(t.volume), 0);
    const anyFlagged = group.some((t: any) => !t.isQualified);
    const parentBg = anyFlagged ? "#2a0a0a" : (rowNum % 2 === 0 ? "#111827" : "#0f172a");
    const totalProfitColor = totalProfit >= 0 ? "#22c55e" : "#ef4444";
    const allViols = linkifyTickets(group.flatMap((t: any) => (t.violations || []).map((v: any) => typeof v === 'string' ? v : v?.detail || 'Rule violation')).join('<br>'));
    const parentRow = `<tr class="trow" style="background:${parentBg};border-bottom:1px solid #374151">
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px">${rowNum}</td>
      <td style="padding:8px 10px;color:#6b7280;font-size:10px">${first.positionId ?? first.ticket}<br><span style="color:#4b5563">${group.length} closes</span></td>
      <td style="padding:8px 10px;color:#f9fafb;font-weight:600;font-size:12px">${first.symbol}</td>
      <td style="padding:8px 10px;font-weight:700;font-size:11px;color:${first.type?.toLowerCase() === 'buy' ? '#22c55e' : '#ef4444'}">${first.type?.toUpperCase()}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;white-space:nowrap">${fmtEAT(first.openTime)}</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;white-space:nowrap">— (${group.length} closes)</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:center">${duration(first.openTime, group[group.length-1].closeTime)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;text-align:right;font-weight:700">${totalVol.toFixed(2)}</td>
      <td style="padding:8px 10px;color:#d1d5db;font-size:11px;text-align:right">${Number(first.openPrice).toFixed(5)}</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:right">—</td>
      <td style="padding:8px 10px;color:#9ca3af;font-size:11px;text-align:right">${first.stopLoss ? Number(first.stopLoss).toFixed(5) : "—"}</td>
      <td colspan="3" style="padding:8px 10px;color:#6b7280;font-size:10px;text-align:center">see closes below</td>
      <td style="padding:8px 10px;font-weight:700;font-size:12px;text-align:right;color:${totalProfitColor}">${cur(totalProfit)}</td>
      <td style="padding:8px 10px;font-size:10px;text-align:right;color:#6b7280">${cur(group.reduce((s: number, t: any) => s + Number(t.commission||0), 0))} / ${cur(group.reduce((s: number, t: any) => s + Number(t.swap||0), 0))}</td>
      <td style="padding:8px 10px;font-size:11px;text-align:center">${anyFlagged ? `<span style="color:#ef4444;font-weight:700">🚩 Flagged</span>` : `<span style="color:#22c55e">✓</span>`}</td>
      <td style="padding:8px 10px;font-size:10px;color:#ef4444;max-width:220px">${allViols}</td>
    </tr>`;
    const subRows = group.map((t: any) => {
      const flagged = !t.isQualified;
      const profitColor = t.profit >= 0 ? "#22c55e" : "#ef4444";
      const tViols = linkifyTickets((t.violations || []).map((v: any) => typeof v === 'string' ? v : v?.detail || 'Rule violation').join('<br>'));
      return `<tr id="trade-${t.ticket}" class="trow" style="background:#0d1117;border-bottom:1px solid #1f2937">
        <td style="padding:5px 10px;color:#4b5563;font-size:10px">└</td>
        <td style="padding:5px 10px;color:#6b7280;font-size:10px">${t.ticket}</td>
        <td></td><td></td>
        <td></td>
        <td style="padding:5px 10px;color:#9ca3af;font-size:10px;white-space:nowrap">${fmtEAT(t.closeTime)}</td>
        <td style="padding:5px 10px;color:#9ca3af;font-size:10px;text-align:center">${duration(first.openTime, t.closeTime)}</td>
        <td style="padding:5px 10px;color:#d1d5db;font-size:10px;text-align:right">${Number(t.volume).toFixed(2)}</td>
        <td></td>
        <td style="padding:5px 10px;color:#d1d5db;font-size:10px;text-align:right">${Number(t.closePrice).toFixed(5)}</td>
        <td></td>
        <td style="padding:5px 10px;color:#9ca3af;font-size:10px;text-align:right">${t.slAllowedPrice ? Number(t.slAllowedPrice).toFixed(5) : "—"}</td>
        <td style="padding:5px 10px;font-size:10px;text-align:right;color:${t.type?.toLowerCase() === 'buy' ? '#ef4444' : '#22c55e'}">${t.slMaxAdversePrice ? Number(t.slMaxAdversePrice).toFixed(5) : "—"}</td>
        <td style="padding:5px 10px;font-size:10px;text-align:center">${slResultBadge(t.slCheckResult)}</td>
        <td style="padding:5px 10px;font-weight:600;font-size:11px;text-align:right;color:${profitColor}">${cur(t.profit)}</td>
        <td style="padding:5px 10px;font-size:10px;text-align:right;color:#6b7280">${cur(t.commission)} / ${cur(t.swap)}</td>
        <td style="padding:5px 10px;font-size:10px;text-align:center">${flagged ? `<span style="color:#ef4444">🚩</span>` : `<span style="color:#22c55e">✓</span>`}</td>
        <td style="padding:5px 10px;font-size:9px;color:#ef4444;max-width:220px">${tViols}</td>
      </tr>`;
    }).join("");
    return parentRow + subRows;
  }).join("");

  // ── Evaluation report stats ──────────────────────────────────────────────
  const totalPositions   = groups.length;
  const flaggedPositions = groups.filter(g => g.some((t: any) => !t.isQualified)).length;
  const qualifiedPositions = totalPositions - flaggedPositions;
  const totalDeals       = tradeList.length;
  const qualifiedDeals   = tradeList.filter((t: any) => t.isQualified).length;

  const grossProfit    = tradeList.reduce((s: number, t: any) => s + (Number(t.profit) > 0 ? Number(t.profit) : 0), 0);
  const grossLoss      = tradeList.reduce((s: number, t: any) => s + (Number(t.profit) < 0 ? Number(t.profit) : 0), 0);
  const netProfit      = tradeList.reduce((s: number, t: any) => s + Number(t.profit), 0);
  const qualifiedProfit = tradeList.filter((t: any) => t.isQualified).reduce((s: number, t: any) => s + Number(t.profit), 0);
  const removedProfit  = tradeList.filter((t: any) => !t.isQualified).reduce((s: number, t: any) => s + Number(t.profit), 0);

  // Active trading days (unique EAT calendar dates with at least one close)
  const tradingDays = new Set(tradeList.map((t: any) => {
    const d = new Date(new Date(t.closeTime).getTime() + 3 * 60 * 60 * 1000);
    return d.toISOString().substring(0, 10);
  })).size;

  // Gather all violation texts and group by type
  const allViolTexts: string[] = tradeList.flatMap((t: any) =>
    (t.violations || []).map((v: any) => (typeof v === 'string' ? v : v?.detail || ''))
  );
  const violsByType: Record<string, { count: number; tickets: number[] }> = {};
  for (const t of tradeList) {
    const viols = (t.violations || []).map((v: any) => (typeof v === 'string' ? v : v?.detail || ''));
    for (const vt of viols) {
      let key = 'Other';
      if (/maximum allowed risk|virtual SL|fake.sl/i.test(vt))  key = 'Max Risk (SL) Breached';
      else if (/simultaneous/i.test(vt))                         key = 'Simultaneous Trades';
      else if (/news|economic/i.test(vt))                        key = 'News Trading';
      else if (/hold.*(time|hours?)|duration/i.test(vt))         key = 'Max Hold Time';
      else if (/profit target|daily.*(loss|drawdown)/i.test(vt)) key = 'Daily Limit';
      else if (/lot.size|volume/i.test(vt))                      key = 'Lot Size';
      else if (/weekend/i.test(vt))                              key = 'Weekend Trade';
      else if (/could not be verified|check.failed/i.test(vt))   key = 'Unverified (Penalty Applied)';
      if (!violsByType[key]) violsByType[key] = { count: 0, tickets: [] };
      violsByType[key].count++;
      violsByType[key].tickets.push(t.ticket);
    }
  }

  const slPendingCount = tradeList.filter((t: any) => t.slCheckPending).length;

  const statCard = (label: string, value: string, sub: string, accent: string) =>
    `<div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:18px 20px;min-width:0">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">${label}</div>
      <div style="font-size:26px;font-weight:800;color:${accent};line-height:1">${value}</div>
      ${sub ? `<div style="font-size:11px;color:#6b7280;margin-top:5px">${sub}</div>` : ''}
    </div>`;

  const evalRows = groups.map((group: any[], gi: number) => {
    const first = group[0];
    const totalP = group.reduce((s: number, t: any) => s + Number(t.profit), 0);
    const anyF = group.some((t: any) => !t.isQualified);
    const slResult = group.every((t: any) => t.slCheckResult === 'passed') ? 'passed'
      : group.some((t: any) => t.slCheckResult === 'fake_sl') ? 'fake_sl'
      : group.some((t: any) => t.slCheckResult === 'check_failed') ? 'check_failed'
      : group.some((t: any) => t.slCheckPending) ? 'pending'
      : group[group.length - 1].slCheckResult;
    const slBadge = slResult === 'passed'       ? `<span style="color:#22c55e;font-weight:700">✓ Passed</span>`
      : slResult === 'fake_sl'      ? `<span style="color:#ef4444;font-weight:700">⚠ Breached</span>`
      : slResult === 'check_failed' ? `<span style="color:#ef4444;font-weight:700">✗ Penalty</span>`
      : slResult === 'pending'      ? `<span style="color:#f59e0b;font-weight:700">⏳ Pending</span>`
      :                               `<span style="color:#6b7280">—</span>`;
    const qualBadge = anyF
      ? `<span style="color:#ef4444;font-weight:700">🚩 Flagged</span>`
      : `<span style="color:#22c55e;font-weight:700">✓ Pass</span>`;
    const allV = group.flatMap((t: any) => (t.violations || []).map((v: any) => typeof v === 'string' ? v : v?.detail || ''));
    const firstV = allV[0] ? (allV[0].length > 90 ? allV[0].substring(0, 88) + '…' : allV[0]) : '';
    const row_bg = anyF ? '#1a0505' : (gi % 2 === 0 ? '#111827' : '#0f172a');
    const profColor = totalP >= 0 ? '#22c55e' : '#ef4444';
    const isPartial = group.length > 1;
    const ticketDisplay = isPartial
      ? `<a href="#trade-${first.ticket}" style="color:#60a5fa;text-decoration:none">${first.positionId ?? first.ticket}</a> <span style="color:#4b5563;font-size:9px">(${group.length} closes)</span>`
      : `<a href="#trade-${first.ticket}" style="color:#60a5fa;text-decoration:none">${first.ticket}</a>`;
    return `<tr style="background:${row_bg};border-bottom:1px solid #1f2937">
      <td style="padding:7px 10px;color:#6b7280;font-size:11px">${gi + 1}</td>
      <td style="padding:7px 10px;font-size:11px">${ticketDisplay}</td>
      <td style="padding:7px 10px;font-weight:700;font-size:12px;color:#f9fafb">${first.symbol}</td>
      <td style="padding:7px 10px;font-weight:700;font-size:11px;color:${first.type?.toLowerCase() === 'buy' ? '#22c55e' : '#ef4444'}">${first.type?.toUpperCase()}</td>
      <td style="padding:7px 10px;font-size:10px;color:#9ca3af;white-space:nowrap">${fmtEAT(first.openTime)}</td>
      <td style="padding:7px 10px;font-size:10px;color:#9ca3af;white-space:nowrap">${fmtEAT(group[group.length-1].closeTime)}</td>
      <td style="padding:7px 10px;color:#d1d5db;font-size:11px;text-align:right">${Number(group.reduce((s: number, t: any) => s + Number(t.volume), 0)).toFixed(2)}</td>
      <td style="padding:7px 10px;font-weight:700;font-size:12px;text-align:right;color:${profColor}">${cur(totalP)}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:center">${slBadge}</td>
      <td style="padding:7px 10px;font-size:11px;text-align:center">${qualBadge}</td>
      <td style="padding:7px 10px;font-size:10px;color:#ef4444;max-width:260px">${firstV}</td>
    </tr>`;
  }).join('');

  const violationRows = Object.entries(violsByType).map(([type, info]) =>
    `<tr style="border-bottom:1px solid #1f2937">
      <td style="padding:8px 14px;font-weight:700;color:#fbbf24;font-size:12px">${type}</td>
      <td style="padding:8px 14px;color:#ef4444;font-weight:700;font-size:14px;text-align:center">${info.count}</td>
      <td style="padding:8px 14px;color:#6b7280;font-size:10px">${Array.from(new Set(info.tickets)).slice(0, 8).map((tk: number) => `<a href="#trade-${tk}" style="color:#60a5fa;text-decoration:none">#${tk}</a>`).join(', ')}${info.tickets.length > 8 ? ` … +${info.tickets.length - 8} more` : ''}</td>
    </tr>`
  ).join('');

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
  .eval-section{page-break-before:always;margin-top:56px;padding-top:40px;border-top:2px solid #1f2937}
  .section-title{font-size:18px;font-weight:800;color:#f9fafb;margin:0 0 6px}
  .section-sub{font-size:12px;color:#6b7280;margin-bottom:24px}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:28px}
  .divider{border:none;border-top:1px solid #1f2937;margin:32px 0}
  .eval-table{width:100%;border-collapse:collapse;font-size:12px}
  .eval-table thead tr{background:#1f2937;border-bottom:2px solid #374151}
  .eval-table th{padding:9px 10px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
  .eval-table tbody tr:hover{background:#1e293b !important}
  .viols-table{width:100%;border-collapse:collapse}
  .viols-table thead tr{background:#1f2937}
  .viols-table th{padding:9px 14px;font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em}
  .viols-table tbody tr:hover{background:#1e293b !important}
  @media print{.eval-section{page-break-before:always}}
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

<!-- ══════════════════════ EVALUATION REPORT ══════════════════════ -->
<div class="eval-section">
  <div class="section-title">📋 Evaluation Report</div>
  <div class="section-sub">Challenge: ${challenge?.title || "—"} &nbsp;·&nbsp; ${user?.nickname || "—"} &nbsp;·&nbsp; Account ${user?.accountNumber}</div>

  <!-- Row 1: Trade counts -->
  <div class="stat-grid">
    ${statCard('Total Positions', String(totalPositions), `${totalDeals} closing deal${totalDeals !== 1 ? 's' : ''}`, '#f9fafb')}
    ${statCard('Qualified', String(qualifiedPositions), `${qualifiedDeals} of ${totalDeals} deals`, '#22c55e')}
    ${statCard('Flagged', String(flaggedPositions), flaggedPositions > 0 ? `${totalDeals - qualifiedDeals} flagged deal${(totalDeals - qualifiedDeals) !== 1 ? 's' : ''}` : 'No violations', flaggedPositions > 0 ? '#ef4444' : '#22c55e')}
    ${statCard('Trading Days', String(tradingDays), 'unique EAT calendar days', '#60a5fa')}
    ${statCard('SL Checks Pending', String(slPendingCount), slPendingCount > 0 ? 'awaiting candle data' : 'all resolved', slPendingCount > 0 ? '#f59e0b' : '#22c55e')}
  </div>

  <!-- Row 2: P&L summary -->
  <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Profit & Loss Summary</div>
  <div class="stat-grid">
    ${statCard('Gross Profit', cur(grossProfit), 'from winning positions', '#22c55e')}
    ${statCard('Gross Loss', cur(grossLoss), 'from losing positions', '#ef4444')}
    ${statCard('Net Total', cur(netProfit), 'all positions combined', netProfit >= 0 ? '#22c55e' : '#ef4444')}
    ${statCard('Qualified Profit', cur(qualifiedProfit), 'counts toward target', qualifiedProfit >= 0 ? '#22c55e' : '#ef4444')}
    ${statCard("Flagged P&L", cur(removedProfit), 'from disqualified positions', '#9ca3af')}
  </div>

  ${allViolTexts.length > 0 ? `
  <hr class="divider">
  <!-- Violations breakdown -->
  <div style="font-size:14px;font-weight:800;color:#f9fafb;margin-bottom:14px">⚠ Violation Breakdown</div>
  <table class="viols-table" style="margin-bottom:28px">
    <thead><tr><th>Violation Type</th><th style="text-align:center">Count</th><th>Affected Tickets</th></tr></thead>
    <tbody style="color:#d1d5db">${violationRows}</tbody>
  </table>` : `
  <hr class="divider">
  <div style="padding:20px;background:#111827;border:1px solid #1f2937;border-radius:10px;text-align:center;color:#22c55e;font-weight:700;margin-bottom:28px">
    ✓ No violations found — all positions qualified
  </div>`}

  <hr class="divider">
  <!-- Per-position evaluation summary -->
  <div style="font-size:14px;font-weight:800;color:#f9fafb;margin-bottom:14px">Position Evaluation Summary</div>
  <table class="eval-table">
    <thead><tr>
      <th>#</th><th>Ticket / Position</th><th>Symbol</th><th>Type</th>
      <th>Open (EAT)</th><th>Close (EAT)</th><th>Lots</th>
      <th style="text-align:right">Profit</th><th style="text-align:center">SL Check</th>
      <th style="text-align:center">Result</th><th>Violation (summary)</th>
    </tr></thead>
    <tbody>${evalRows}</tbody>
  </table>
</div>

</body></html>`;
}

function hostDownloadRulesHTML(challenge: any, rulesList: string[], isCent: boolean) {
  const unit = isCent ? '¢' : '$';
  const startDate = challenge.start_date ? new Date(challenge.start_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const endDate = challenge.end_date ? new Date(challenge.end_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${challenge.title} - Rules</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#0a0e1a}.page{width:1080px;height:1920px;padding:80px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#0a0e1a 0%,#111827 50%,#0a0e1a 100%);position:relative;overflow:hidden;page-break-after:always}.page.landscape{width:1920px;height:1080px;padding:60px 100px}.glow{position:absolute;width:600px;height:600px;border-radius:50%;filter:blur(150px);opacity:0.15}.glow1{top:-200px;right:-100px;background:#1F6FEB}.glow2{bottom:-200px;left:-100px;background:#F5B400}.header{text-align:center;margin-bottom:60px}.title{font-size:48px;font-weight:800;color:#fff;margin-bottom:12px}.subtitle{font-size:20px;color:#94a3b8;font-weight:500}.badge{display:inline-block;padding:8px 20px;border-radius:20px;background:rgba(31,111,235,0.2);border:1px solid rgba(31,111,235,0.4);color:#1F6FEB;font-size:14px;font-weight:700;margin-top:16px}.info-row{display:flex;justify-content:center;gap:40px;margin-bottom:50px}.info-item{text-align:center}.info-label{font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.info-value{font-size:28px;font-weight:700;color:#fff}.info-value.gold{color:#F5B400}.rules-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:800px;margin:0 auto}.page.landscape .rules-grid{grid-template-columns:1fr 1fr 1fr;max-width:1400px}.rule-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;display:flex;align-items:center;gap:16px}.rule-card.centered{grid-column:1/-1;max-width:400px;margin:0 auto}.page.landscape .rule-card.centered{max-width:450px}.rule-num{width:36px;height:36px;border-radius:10px;background:rgba(31,111,235,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#1F6FEB;flex-shrink:0}.rule-text{font-size:16px;color:#e2e8f0;font-weight:500}.footer{text-align:center;margin-top:auto;padding-top:40px}.footer-text{font-size:14px;color:#475569}.brand{font-size:16px;font-weight:700;color:#64748b;margin-top:8px}</style></head><body><div class="page"><div class="glow glow1"></div><div class="glow glow2"></div><div class="header"><div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px"><img src="https://winnerpip.com/winnerpip-icon.png" style="width:44px;height:44px;border-radius:10px" onerror="this.style.display='none'" /></div><div class="title">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Challenge Rules</div>${isCent ? '<div class="badge">CENT ACCOUNT ONLY</div>' : ''}</div><div class="info-row"><div class="info-item"><div class="info-label">Starting Balance</div><div class="info-value">${unit}${challenge.starting_balance || 0}</div></div><div class="info-item"><div class="info-label">Target</div><div class="info-value gold">${unit}${challenge.target_balance || 0}</div></div><div class="info-item"><div class="info-label">Period</div><div class="info-value" style="font-size:20px">${startDate} → ${endDate}</div></div></div><div class="rules-grid">${rulesList.map((r, i) => `<div class="rule-card${i === rulesList.length - 1 && rulesList.length % 2 !== 0 ? " centered" : ""}"><div class="rule-num">${i + 1}</div><div class="rule-text">${r}</div></div>`).join('')}</div><div class="footer"><div class="footer-text">Trades that break the rules will have profits removed. Losses still count.</div><div class="brand">WinnerPip</div></div></div><div class="page landscape"><div class="glow glow1"></div><div class="glow glow2"></div><div class="header"><div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:14px"><img src="https://winnerpip.com/winnerpip-icon.png" style="width:52px;height:52px;border-radius:10px" onerror="this.style.display='none'" /></div><div class="title" style="font-size:42px">${challenge.title || 'Trading Challenge'}</div><div class="subtitle">Challenge Rules</div>${isCent ? '<div class="badge">CENT ACCOUNT ONLY</div>' : ''}</div><div class="info-row"><div class="info-item"><div class="info-label">Starting Balance</div><div class="info-value">${unit}${challenge.starting_balance || 0}</div></div><div class="info-item"><div class="info-label">Target</div><div class="info-value gold">${unit}${challenge.target_balance || 0}</div></div><div class="info-item"><div class="info-label">Period</div><div class="info-value" style="font-size:20px">${startDate} → ${endDate}</div></div></div><div class="rules-grid">${rulesList.map((r, i) => `<div class="rule-card${i === rulesList.length - 1 && rulesList.length % 2 !== 0 ? " centered" : ""}"><div class="rule-num">${i + 1}</div><div class="rule-text">${r}</div></div>`).join('')}</div><div class="footer"><div class="footer-text">Trades that break the rules will have profits removed. Losses still count.</div><div class="brand">WinnerPip</div></div></div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${(challenge.title || 'challenge').replace(/\s+/g, '_')}_rules.html`; a.click(); URL.revokeObjectURL(url);
}

// ==================== CREDENTIAL FAILURES PANEL ====================
function CredentialFailuresPanel({ failedAccounts, doAction, selectedChallengeId }: { failedAccounts: any; doAction: any; selectedChallengeId: number }) {
  const [expanded, setExpanded] = useState(false);
  const count = failedAccounts?.credentialFailures?.length || 0;
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all">
        <span className="text-sm font-semibold text-white flex items-center gap-2"><Key size={16} className="text-loss" /> Credential Failures {count > 0 && <span className="px-2 py-0.5 rounded-full bg-loss/20 text-loss text-[10px] font-bold">{count}</span>}</span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-5 pb-5 border-t border-white/5">
          {count === 0 ? (
            <p className="text-xs text-gray-500 text-center py-3">No credential failures — all accounts connecting successfully.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mt-3 mb-3">
                <p className="text-[10px] text-gray-500">{count} account{count !== 1 ? 's' : ''} with credential issues</p>
                <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`)} className="text-[10px] text-gold font-bold px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/20 hover:bg-gold/20 transition-all">🔄 Retry All</button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
              {failedAccounts.credentialFailures.map((f: any) => (
                <div key={f.id} className="p-3 rounded-lg bg-loss/5 border border-loss/10">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">{f.nickname} <span className="text-gray-500 text-[10px]">#{f.account_number}</span></p>
                      <p className="text-[10px] text-gray-500">{f.email || '—'} · {f.mt5_server}</p>
                      {f.pull_error && <p className="text-[10px] text-loss mt-0.5 truncate max-w-[250px]">{f.pull_error}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/retry-credentials`, 'POST', { registrationId: f.id })} className="text-[10px] text-gold font-semibold px-2 py-1.5 rounded-lg bg-gold/10 border border-gold/20 hover:bg-gold/20 transition-all">🔄 Retry</button>
                      <button onClick={async () => { const pw = prompt("Enter new investor password:"); if (!pw) return; await doAction(`${API_URL}/api/host/challenge/${selectedChallengeId}/check-balance`, 'POST', { registrationId: f.id, newPassword: pw }); }} className="text-[10px] text-royal font-semibold px-2 py-1.5 rounded-lg bg-royal/10 border border-royal/20 hover:bg-royal/20 transition-all">🔑 Update PW</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== INDIVIDUAL PULL BUTTON + INLINE PANEL ====================
function IndividualPullBtn({ challengeId, getToken }: { challengeId: number; getToken: () => string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<any>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true); setUser(null); setNotFound(false); setPullResult(null);
    try {
      const res = await fetch(`${API_URL}/api/host/challenge/${challengeId}/finduser?q=${encodeURIComponent(search.trim())}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.found) { setUser(data.user); } else { setNotFound(true); }
    } catch { setNotFound(true); }
    setSearching(false);
  };

  const handlePull = async () => {
    if (!user) return;
    setPulling(true); setPullResult(null);
    try {
      await fetch(`${API_URL}/api/host/challenge/${challengeId}/pull-single-account`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: user.id }),
      });
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const res = await fetch(`${API_URL}/api/host/challenge/${challengeId}/pull-single-status?registrationId=${user.id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        const data = await res.json();
        if (data.done) { setPullResult(data); break; }
      }
    } catch { setPullResult({ done: true, success: false, errorMessage: 'Connection error' }); }
    setPulling(false);
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} className="px-4 py-2.5 rounded-lg bg-purple-500/20 text-purple-400 text-xs font-semibold border border-purple-500/30 hover:bg-purple-500/30 transition-all">Update Individual</button>;
  }

  return (
    <div className="w-full mt-3 p-4 rounded-xl bg-white/5 border border-royal/20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-royal">Update Individual Account</p>
        <button onClick={() => { setOpen(false); setUser(null); setPullResult(null); setSearch(""); setNotFound(false); }} className="text-[10px] text-gray-500 hover:text-white">Close</button>
      </div>
      <div className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="Email, account number, or nickname" className="flex-1 p-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-royal/50" />
        <button onClick={handleSearch} disabled={searching} className="px-3 py-2 rounded-lg bg-royal/20 text-royal text-xs font-semibold border border-royal/30 hover:bg-royal/30 disabled:opacity-50">{searching ? "..." : "Find"}</button>
      </div>
      {notFound && <p className="text-[10px] text-gray-500 text-center">No participant found.</p>}
      {user && !pullResult && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-white">{user.nickname}</p><p className="text-[10px] text-gray-500">{user.email} · #{user.accountNumber}</p></div>
            {user.disqualified && <span className="px-2 py-0.5 rounded-full bg-loss/20 text-loss text-[10px] font-bold">DQ</span>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/5 rounded p-1.5"><p className="text-[8px] text-gray-500">Rank</p><p className="text-xs font-bold text-white">{user.rank ? `#${user.rank}` : "—"}</p></div>
            <div className="bg-white/5 rounded p-1.5"><p className="text-[8px] text-gray-500">Trades</p><p className="text-xs font-bold text-white">{user.totalTrades}</p></div>
            <div className="bg-white/5 rounded p-1.5"><p className="text-[8px] text-gray-500">Balance</p><p className="text-xs font-bold text-profit">{user.isCent ? `${user.adjustedBalance?.toFixed(0)}¢` : `$${user.adjustedBalance?.toFixed(2)}`}</p></div>
          </div>
          {user.disqualifiedReason && <p className="text-[10px] text-loss">DQ: {user.disqualifiedReason}</p>}
          <button onClick={handlePull} disabled={pulling} className="w-full py-2 rounded-lg bg-gradient-to-r from-royal to-purple-600 text-white text-[10px] font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {pulling ? <><Loader2 size={10} className="animate-spin" /> Updating (30-60s)...</> : "⚡ Update This Account"}
          </button>
        </div>
      )}
      {pullResult && (
        <div className={`p-4 rounded-xl border space-y-3 ${pullResult.success ? 'bg-profit/5 border-profit/20' : 'bg-loss/5 border-loss/20'}`}>
          {pullResult.success ? (
            <>
              <p className="text-sm font-bold text-profit text-center">✅ Update Complete</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Trades in DB</p><p className="text-white font-bold">{pullResult.tradesFound}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">New Trades Added</p><p className="text-royal font-bold">{pullResult.tradesAdded}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Faults Found</p><p className="text-loss font-bold">{pullResult.faultsFound}</p></div>
                <div className="bg-white/5 rounded-lg p-2 text-center"><p className="text-gray-400">Rank</p><p className="text-white font-bold">{pullResult.prevRank ? `#${pullResult.prevRank}` : '—'} → {pullResult.newRank ? `#${pullResult.newRank}` : '—'}</p></div>
              </div>
              {/* Trade Data Changes */}
              {pullResult.tradeChanges && pullResult.tradeChanges.length > 0 && (
                <div className="bg-royal/5 border border-royal/20 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-royal font-semibold uppercase tracking-wider mb-2">Trade Data Changes ({pullResult.tradeChanges.length})</p>
                  {pullResult.tradeChanges.slice(0, 10).map((tc: any, i: number) => (
                    <div key={i} className="bg-white/5 rounded-lg p-2 text-[10px]">
                      <p className="text-gray-300 font-semibold mb-1">{tc.symbol} · #{tc.ticket}</p>
                      {tc.changes.open_price && <p className="text-gray-400">Open: <span className="text-gray-500">{tc.changes.open_price.before}</span> → <span className="text-white">{tc.changes.open_price.after}</span></p>}
                      {tc.changes.close_price && <p className="text-gray-400">Close: <span className="text-gray-500">{tc.changes.close_price.before}</span> → <span className="text-white">{tc.changes.close_price.after}</span></p>}
                      {tc.changes.is_qualified && <p className="text-gray-400">Status: <span className={tc.changes.is_qualified.before ? "text-profit" : "text-loss"}>{tc.changes.is_qualified.before ? "Qualified" : "Flagged"}</span> → <span className={tc.changes.is_qualified.after ? "text-profit" : "text-loss"}>{tc.changes.is_qualified.after ? "Qualified ✓" : "Flagged ✗"}</span></p>}
                      {tc.changes.stop_loss && <p className="text-gray-400">SL: {tc.changes.stop_loss.before} → {tc.changes.stop_loss.after}</p>}
                    </div>
                  ))}
                  {pullResult.tradeChanges.length > 10 && <p className="text-[9px] text-gray-500">+{pullResult.tradeChanges.length - 10} more...</p>}
                </div>
              )}
              {/* New Trades */}
              {pullResult.newTrades && pullResult.newTrades.length > 0 && (
                <div className="bg-profit/5 border border-profit/20 rounded-xl p-3">
                  <p className="text-[10px] text-profit font-semibold uppercase tracking-wider mb-2">New Trades ({pullResult.newTrades.length})</p>
                  {pullResult.newTrades.slice(0, 5).map((nt: any, i: number) => (
                    <p key={i} className="text-[10px] text-gray-300">#{nt.ticket} · {nt.symbol} · {nt.type} · <span className={nt.profit >= 0 ? "text-profit" : "text-loss"}>${nt.profit.toFixed(2)}</span></p>
                  ))}
                </div>
              )}
              {/* Eval Changes */}
              {pullResult.evalDiff && Object.keys(pullResult.evalDiff).length > 0 && (
                <div className="bg-gold/5 border border-gold/20 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-gold font-semibold uppercase tracking-wider mb-2">Evaluation Changes</p>
                  {pullResult.evalDiff.qualifiedProfit && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Qualified Profit</span><span><span className="text-gray-500">${pullResult.evalDiff.qualifiedProfit.before.toFixed(2)}</span> → <span className="text-white font-semibold">${pullResult.evalDiff.qualifiedProfit.after.toFixed(2)}</span></span></div>}
                  {pullResult.evalDiff.adjustedBalance && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Adjusted Balance</span><span><span className="text-gray-500">${pullResult.evalDiff.adjustedBalance.before.toFixed(2)}</span> → <span className="text-white font-semibold">${pullResult.evalDiff.adjustedBalance.after.toFixed(2)}</span></span></div>}
                  {pullResult.evalDiff.grossBalance && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Gross Balance</span><span><span className="text-gray-500">${pullResult.evalDiff.grossBalance.before.toFixed(2)}</span> → <span className="text-white font-semibold">${pullResult.evalDiff.grossBalance.after.toFixed(2)}</span></span></div>}
                  {pullResult.evalDiff.flaggedTrades && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Flagged</span><span><span className="text-gray-500">{pullResult.evalDiff.flaggedTrades.before}</span> → <span className={`font-semibold ${pullResult.evalDiff.flaggedTrades.after < pullResult.evalDiff.flaggedTrades.before ? "text-profit" : "text-loss"}`}>{pullResult.evalDiff.flaggedTrades.after}</span></span></div>}
                  {pullResult.evalDiff.qualifiedTrades && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Qualified</span><span><span className="text-gray-500">{pullResult.evalDiff.qualifiedTrades.before}</span> → <span className="text-white font-semibold">{pullResult.evalDiff.qualifiedTrades.after}</span></span></div>}
                  {pullResult.evalDiff.profitRemoved && <div className="flex justify-between text-[11px]"><span className="text-gray-400">Profit Removed</span><span><span className="text-gray-500">${pullResult.evalDiff.profitRemoved.before.toFixed(2)}</span> → <span className="text-loss font-semibold">${pullResult.evalDiff.profitRemoved.after.toFixed(2)}</span></span></div>}
                </div>
              )}
              {/* No changes */}
              {!pullResult.hasDiff && (
                <div className="bg-white/5 rounded-lg px-3 py-2 text-center space-y-1">
                  <p className="text-[10px] text-gray-500">No changes detected — data matches existing records.</p>
                  <div className="grid grid-cols-2 gap-2 text-[10px] mt-2">
                    <div className="bg-white/5 rounded p-1.5 text-center"><span className="text-gray-500">Adj: </span><span className="text-white font-semibold">${Number(pullResult.adjustedBalance || 0).toFixed(2)}</span></div>
                    <div className="bg-white/5 rounded p-1.5 text-center"><span className="text-gray-500">Gross: </span><span className="text-white font-semibold">${Number(pullResult.grossBalance || 0).toFixed(2)}</span></div>
                  </div>
                </div>
              )}
              {pullResult.isDisqualified && <p className="text-[10px] text-loss bg-loss/10 rounded-lg px-3 py-2 text-center">DQ: {pullResult.dqReason}</p>}
              <button onClick={() => { setPullResult(null); setUser(null); setSearch(""); }} className="w-full py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-[10px] hover:bg-white/10">Done</button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-loss text-center">❌ Update Failed</p>
              <p className="text-[11px] text-gray-400 text-center">{pullResult.errorMessage || 'Unknown error'}</p>
              <button onClick={handlePull} disabled={pulling} className="w-full py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-bold hover:bg-purple-500/30 disabled:opacity-50">Retry</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
