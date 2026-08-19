"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, Users, Trophy, FileText, Settings, RefreshCw,
  LogOut, Loader2, ChevronDown, Calendar, Target, Activity,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";

export default function HostDashboardPage() {
  const [isAuth, setIsAuth] = useState(false);
  const [hostInfo, setHostInfo] = useState<any>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "participants" | "leaderboard" | "updates">("overview");
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
        <Loader2 className="w-8 h-8 text-royal animate-spin" />
      </div>
    );
  }

  const selectedChallenge = challenges.find(c => c.id === selectedChallengeId);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Header */}
      <header className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={36} height={36} className="rounded-lg" />
            <div>
              <p className="text-sm font-bold text-white">{hostInfo?.displayName || "Host"}</p>
              <p className="text-[10px] text-gray-500">HOST DASHBOARD</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-sm">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Challenge Selector */}
        {challenges.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <div className="relative">
              <select
                value={selectedChallengeId || ""}
                onChange={(e) => setSelectedChallengeId(parseInt(e.target.value))}
                className="appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-white text-sm font-medium outline-none focus:border-royal/50 cursor-pointer"
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
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${selectedChallenge.status === 'active' ? 'bg-profit/20 text-profit border border-profit/30' : selectedChallenge.status === 'registration_open' ? 'bg-gold/20 text-gold border border-gold/30' : 'bg-white/10 text-gray-400 border border-white/20'}`}>
                {selectedChallenge.status === 'active' ? 'Active' : selectedChallenge.status === 'registration_open' ? 'Registration Open' : selectedChallenge.status}
              </span>
            )}
          </div>
        )}

        {/* No challenges */}
        {challenges.length === 0 && (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg font-semibold">No challenges yet</p>
            <p className="text-gray-500 text-sm mt-2">Your challenges will appear here once created and approved.</p>
          </div>
        )}

        {/* Tab Navigation */}
        {selectedChallengeId && (
          <>
            <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6 overflow-x-auto">
              {[
                { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
                { key: "participants", label: "Participants", icon: <Users size={14} /> },
                { key: "leaderboard", label: "Leaderboard", icon: <Trophy size={14} /> },
                { key: "updates", label: "Updates", icon: <RefreshCw size={14} /> },
              ].map((tab: any) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? "bg-royal/20 text-royal" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {tabLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-royal animate-spin" />
              </div>
            ) : (
              <>
                {/* OVERVIEW TAB */}
                {activeTab === "overview" && overview && (
                  <div className="space-y-6">
                    {/* Challenge Info */}
                    <div className="glass rounded-2xl border border-white/10 p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><LayoutDashboard size={16} className="text-royal" /> Challenge Overview</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                          <p className="text-[10px] text-gray-500 uppercase mb-1">Participants</p>
                          <p className="text-2xl font-bold text-white">{overview.participants.total}</p>
                          <p className="text-[10px] text-gray-500 mt-1">Real: {overview.participants.real} | Demo: {overview.participants.demo}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                          <p className="text-[10px] text-gray-500 uppercase mb-1">Qualified</p>
                          <p className="text-2xl font-bold text-profit">{overview.leaderboard.qualified}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                          <p className="text-[10px] text-gray-500 uppercase mb-1">Disqualified</p>
                          <p className="text-2xl font-bold text-loss">{overview.participants.disqualified}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 text-center">
                          <p className="text-[10px] text-gray-500 uppercase mb-1">Last Update</p>
                          <p className="text-sm font-semibold text-white">{overview.lastUpdateAt ? new Date(new Date(overview.lastUpdateAt).getTime() + 3*60*60*1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " EAT" : "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Challenge Details */}
                    <div className="glass rounded-2xl border border-white/10 p-5">
                      <h3 className="text-sm font-semibold text-white mb-3">Challenge Details</h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-500" /><span className="text-gray-400">Period:</span><span className="text-white">{new Date(overview.challenge.startDate).toLocaleDateString()} — {new Date(overview.challenge.endDate).toLocaleDateString()}</span></div>
                        <div className="flex items-center gap-2"><Target size={14} className="text-gray-500" /><span className="text-gray-400">Target:</span><span className="text-white">{overview.challenge.depositMode !== 'fixed' ? `${overview.challenge.targetPercent}% growth` : `$${overview.challenge.targetBalance}`}</span></div>
                        <div className="flex items-center gap-2"><Activity size={14} className="text-gray-500" /><span className="text-gray-400">Type:</span><span className="text-white capitalize">{overview.challenge.type}</span></div>
                        <div className="flex items-center gap-2"><FileText size={14} className="text-gray-500" /><span className="text-gray-400">Status:</span><span className="text-white capitalize">{overview.challenge.status}</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* PARTICIPANTS TAB */}
                {activeTab === "participants" && (<>
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users size={16} className="text-royal" /> Participants ({participantsPagination?.total || participants.length})</h3>
                    {participants.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-10">No participants registered yet</p>
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
                  <div className="glass rounded-2xl border border-white/10 p-5 mt-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Upload Participants (CSV)</h3>
                    <p className="text-xs text-gray-500 mb-4">Upload a CSV file with columns: nickname, accountType (demo/real), accountNumber, server, investorPassword</p>

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
                      <p className="text-gray-500 text-sm text-center py-10">Leaderboard will appear after the first data update</p>
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

                {/* UPDATES TAB */}
                {activeTab === "updates" && (
                  <div className="glass rounded-2xl border border-white/10 p-5">
                    <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><RefreshCw size={16} className="text-royal" /> Data Updates</h3>
                    {updates.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-10">No updates yet. Data updates run automatically 6 times per day.</p>
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
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
