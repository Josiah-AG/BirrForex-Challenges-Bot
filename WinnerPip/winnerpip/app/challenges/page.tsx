"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Trophy,
  Calendar,
  Users,
  Target,
  Sparkles,
  Loader2,
  ArrowRight,
  CheckCircle,
  X,
} from "lucide-react";

interface Challenge {
  id: number;
  title: string;
  type: string;
  status: string;
  displayStatus?: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  targetBalance: number;
  prizePoolText: string | null;
  realPrizes: number[];
  demoPrizes: number[];
  participants: { total: number; demo: number; real: number };
  teamOnly?: boolean;
  source?: string;
  registrationDeadline?: string;
  hostId?: number | null;
  hostDisplayName?: string | null;
  hostMainLink?: string | null;
  registrationMode?: string | null;
}

interface Winner {
  rank: number;
  nickname: string;
  trades: number;
  flagged: number;
  prize: string;
}

interface WinnersData {
  hasWinners: boolean;
  real: Winner[];
  demo: Winner[];
  teamOnly?: boolean;
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"current" | "past">("current");
  const [selectedPastChallenge, setSelectedPastChallenge] = useState<Challenge | null>(null);
  const [winnersData, setWinnersData] = useState<WinnersData | null>(null);
  const [winnersLoading, setWinnersLoading] = useState(false);

  // Registration modal state
  const [registerChallenge, setRegisterChallenge] = useState<Challenge | null>(null);
  const [regForm, setRegForm] = useState({ email: "", nickname: "", accountNumber: "", mt5Server: "", investorPassword: "", accountType: "demo" });
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const res = await fetch(`${apiUrl}/api/challenges?include_past=true`);
        if (res.ok) {
          const data = await res.json();
          if (data.challenges && data.challenges.length > 0) {
            setChallenges(data.challenges);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.log("API unavailable:", err);
      }
      setChallenges([]);
      setLoading(false);
    };
    fetchChallenges();
  }, []);

  const currentChallenges = challenges.filter(c => {
    const ds = c.displayStatus || c.status;
    return ds !== "ended" && ds !== "completed";
  });

  const pastChallenges = challenges.filter(c => {
    const ds = c.displayStatus || c.status;
    return ds === "ended" || c.status === "completed";
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getStatusBadge = (challenge: Challenge) => {
    const status = challenge.displayStatus || challenge.status;
    switch (status) {
      case "coming_soon":
        return { label: "Coming Soon", color: "bg-white/10 text-gray-300 border-white/20" };
      case "registration_open":
        return { label: "Registration Open", color: "bg-profit/20 text-profit border-profit/30" };
      case "ongoing":
      case "active":
        return { label: "Ongoing (Live)", color: "bg-gold/20 text-gold border-gold/30" };
      case "evaluation":
        return { label: "Final Review", color: "bg-royal/20 text-royal border-royal/30" };
      case "ended":
      case "completed":
        return { label: "Completed", color: "bg-profit/20 text-profit border-profit/30" };
      case "submission_open":
        return { label: "Submissions Open", color: "bg-royal/20 text-royal border-royal/30" };
      case "reviewing":
        return { label: "Final Review", color: "bg-royal/20 text-royal border-royal/30" };
      default:
        return { label: status, color: "bg-white/10 text-gray-400 border-white/20" };
    }
  };

  const handleChallengeClick = (challenge: Challenge) => {
    window.location.href = `/login?challenge=${challenge.id}`;
  };

  const handlePastChallengeClick = async (challenge: Challenge) => {
    setSelectedPastChallenge(challenge);
    setWinnersData(null);
    setWinnersLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/challenges/${challenge.id}/winners`);
      if (res.ok) {
        const data = await res.json();
        setWinnersData(data);
      } else {
        setWinnersData({ hasWinners: false, real: [], demo: [] });
      }
    } catch {
      setWinnersData({ hasWinners: false, real: [], demo: [] });
    }
    setWinnersLoading(false);
  };

  const medalEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}.`;
  };

  const renderChallengeCard = (challenge: Challenge, isPast: boolean) => {
    const badge = getStatusBadge(challenge);

    return (
      <button
        key={challenge.id}
        onClick={() => {
          if (isPast) return handlePastChallengeClick(challenge);
          if (challenge.hostId && challenge.registrationMode === 'winnerpip' && (challenge.displayStatus === 'registration_open' || challenge.status === 'registration_open')) {
            setRegisterChallenge(challenge);
            setRegForm({ email: "", nickname: "", accountNumber: "", mt5Server: "", investorPassword: "", accountType: challenge.type === 'real' ? 'real' : 'demo' });
            setRegError(""); setRegSuccess(false);
            return;
          }
          handleChallengeClick(challenge);
        }}
        className="text-left w-full glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-royal/10 to-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>

        <div className="p-6 relative">
          {/* Title + Badge */}
          <div className="mb-5">
            <h3 className="text-xl font-bold text-white mb-3 group-hover:gradient-text transition-all line-clamp-2">
              {challenge.title}
            </h3>
            <div className="flex flex-wrap gap-2">
              {isPast ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-profit/20 text-profit border border-profit/30 text-xs font-semibold">
                  <CheckCircle size={12} /> Completed
                </span>
              ) : (
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                  {badge.label}
                </span>
              )}
              <span className="px-3 py-1.5 rounded-full bg-white/10 text-gray-300 border border-white/20 text-xs font-medium capitalize">
                {challenge.type}
              </span>
              {challenge.teamOnly && (
                <span className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold">
                  Team Only
                </span>
              )}
              {challenge.hostId && challenge.hostDisplayName && (
                challenge.hostMainLink ? (
                  <a href={challenge.hostMainLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-royal/20 text-royal border border-royal/30 text-xs font-semibold hover:bg-royal/30 transition-all">
                    Hosted by {challenge.hostDisplayName}
                  </a>
                ) : (
                  <span className="px-3 py-1.5 rounded-full bg-royal/20 text-royal border border-royal/30 text-xs font-semibold">
                    Hosted by {challenge.hostDisplayName}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-5">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <Calendar size={16} className="text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">Period</p>
                <p className="text-sm text-white font-medium truncate">
                  {formatDate(challenge.startDate)} — {formatDate(challenge.endDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <Target size={16} className="text-gold flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Target</p>
                <p className="text-sm font-medium">
                  <span className={`text-white ${challenge.teamOnly ? 'blur-[5px] select-none' : ''}`}>${challenge.startingBalance}</span>
                  <span className="text-gray-500 mx-1">&rarr;</span>
                  <span className={`text-gold ${challenge.teamOnly ? 'blur-[5px] select-none' : ''}`}>${challenge.targetBalance}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
              <Users size={16} className="text-royal flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Participants</p>
                <p className={`text-sm text-white font-medium ${challenge.teamOnly ? 'blur-[5px] select-none' : ''}`}>{challenge.participants.total}</p>
              </div>
            </div>

            {(challenge.realPrizes?.length > 0 || challenge.demoPrizes?.length > 0) && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={14} className="text-gold flex-shrink-0" />
                  <p className="text-xs text-gray-500">Prize Pool</p>
                </div>
                {challenge.realPrizes?.length > 0 && (
                  <div className="mb-1.5">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{challenge.type === "hybrid" ? "Real Account" : "Prizes"}</p>
                    <div className={`flex flex-wrap gap-1.5 ${challenge.teamOnly ? 'blur-[5px] select-none' : ''}`}>
                      {challenge.realPrizes.map((p: number, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-gold/20 rounded text-xs font-bold text-gold">
                          {["🥇","🥈","🥉"][i] || `${i+1}.`} {typeof p === "number" ? `$${p}` : (isNaN(Number(p)) ? p : `$${p}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {challenge.demoPrizes?.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{challenge.type === "hybrid" ? "Demo Account" : "Prizes"}</p>
                    <div className={`flex flex-wrap gap-1.5 ${challenge.teamOnly ? 'blur-[5px] select-none' : ''}`}>
                      {challenge.demoPrizes.map((p: number, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-royal/20 rounded text-xs font-bold text-royal">
                          {["🥇","🥈","🥉"][i] || `${i+1}.`} {typeof p === "number" ? `$${p}` : (isNaN(Number(p)) ? p : `$${p}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CTA */}
          <div className={`flex items-center justify-between p-3 rounded-xl ${isPast ? 'bg-profit/10 border border-profit/20 group-hover:bg-profit/20' : 'bg-royal/10 border border-royal/20 group-hover:bg-royal/20'} transition-all`}>
            <span className={`text-sm font-semibold ${isPast ? 'text-profit' : 'text-royal'}`}>
              {isPast ? "View Winners" : (() => {
                const ds = challenge.displayStatus || challenge.status;
                if (ds === "registration_open" && challenge.hostId && challenge.registrationMode === 'winnerpip') return "Register Now";
                if (ds === "registration_open" && challenge.hostId && challenge.registrationMode === 'manual') return "View Challenge";
                if (ds === "registration_open") return "Join Challenge";
                if (ds === "ongoing" || ds === "active") return "View Dashboard";
                if (ds === "coming_soon") return "Coming Soon";
                return "View Details";
              })()}
            </span>
            <ArrowRight size={16} className={`${isPast ? 'text-profit' : 'text-royal'} group-hover:translate-x-1 transition-transform`} />
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={44} height={44} className="rounded-xl relative" />
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:inline">WinnerPip</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-10 md:py-16 max-w-6xl relative">
        {/* Page Title */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="text-gold w-6 h-6" />
            <span className="text-sm text-gray-400 uppercase tracking-wider font-semibold">Trading Competitions</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Challenges</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Join a challenge, trade with discipline, and climb the leaderboard
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <button
            onClick={() => setActiveTab("current")}
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === "current" ? "bg-royal/20 text-royal border border-royal/30" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"}`}
          >
            Current Challenges
            {currentChallenges.length > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-royal/30 text-royal text-xs">{currentChallenges.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === "past" ? "bg-profit/20 text-profit border border-profit/30" : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"}`}
          >
            Past Challenges
            {pastChallenges.length > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-profit/30 text-profit text-xs">{pastChallenges.length}</span>}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-royal animate-spin" />
          </div>
        )}

        {/* Current Challenges */}
        {!loading && activeTab === "current" && (
          <>
            {currentChallenges.length === 0 ? (
              <div className="text-center py-20">
                <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">No active challenges right now</p>
                <p className="text-gray-500 text-sm mt-2">Check back soon or follow <a href="https://linktr.ee/birrforex" target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-royal transition-colors">BirrForex</a> for announcements</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentChallenges.map(c => renderChallengeCard(c, false))}
              </div>
            )}
          </>
        )}

        {/* Past Challenges */}
        {!loading && activeTab === "past" && (
          <>
            {pastChallenges.length === 0 ? (
              <div className="text-center py-20">
                <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-lg">No past challenges yet</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastChallenges.map(c => renderChallengeCard(c, true))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Winners Modal */}
      {selectedPastChallenge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedPastChallenge(null)}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <Trophy size={20} className="text-gold" />
                <h3 className="text-lg font-bold text-white">{selectedPastChallenge.title}</h3>
              </div>
              <button onClick={() => setSelectedPastChallenge(null)} className="p-2 hover:bg-white/10 rounded-lg">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5">
              {winnersLoading && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 text-royal animate-spin" />
                </div>
              )}

              {!winnersLoading && winnersData && !winnersData.hasWinners && (
                <div className="text-center py-10">
                  <Target className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 font-semibold">No participant hit the target</p>
                  <p className="text-gray-500 text-sm mt-1">Better luck next time!</p>
                </div>
              )}

              {!winnersLoading && winnersData && winnersData.hasWinners && (
                <div className="space-y-6">
                  {/* Real Winners */}
                  {winnersData.real.length > 0 && (
                    <div>
                      {selectedPastChallenge.type === "hybrid" && (
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Real Account</p>
                      )}
                      <div className="space-y-2">
                        {winnersData.real.map(w => (
                          <div key={w.rank} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{medalEmoji(w.rank)}</span>
                              <div>
                                <p className="text-sm font-bold text-white">{w.nickname}</p>
                                <p className="text-[10px] text-gray-500">{w.trades} trades • {w.flagged} flagged</p>
                              </div>
                            </div>
                            <p className={`text-sm font-bold ${winnersData.teamOnly ? 'blur-[6px] select-none' : ''} text-gold`}>{w.prize}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Demo Winners */}
                  {winnersData.demo.length > 0 && (
                    <div>
                      {selectedPastChallenge.type === "hybrid" && (
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Demo Account</p>
                      )}
                      <div className="space-y-2">
                        {winnersData.demo.map(w => (
                          <div key={w.rank} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{medalEmoji(w.rank)}</span>
                              <div>
                                <p className="text-sm font-bold text-white">{w.nickname}</p>
                                <p className="text-[10px] text-gray-500">{w.trades} trades • {w.flagged} flagged</p>
                              </div>
                            </div>
                            <p className={`text-sm font-bold ${winnersData.teamOnly ? 'blur-[6px] select-none' : ''} text-gold`}>{w.prize}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Registration Modal */}
      {registerChallenge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !regLoading && setRegisterChallenge(null)}>
          <div className="glass rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-white/10" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-white">Register</h3>
                <p className="text-xs text-gray-500">{registerChallenge.title}</p>
              </div>
              <button onClick={() => !regLoading && setRegisterChallenge(null)} className="p-2 hover:bg-white/10 rounded-lg">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-5">
              {regSuccess ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-14 h-14 text-profit mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">Registration Successful!</h3>
                  <p className="text-gray-400 text-sm">Your account has been verified and connected. You&apos;ll receive a confirmation email shortly.</p>
                  <button onClick={() => setRegisterChallenge(null)} className="mt-6 px-6 py-2.5 rounded-xl bg-royal/20 text-royal font-semibold text-sm border border-royal/30">Done</button>
                </div>
              ) : (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setRegError(""); setRegLoading(true);
                  try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
                    const res = await fetch(`${apiUrl}/api/challenges/${registerChallenge.id}/register`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(regForm),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setRegSuccess(true);
                    } else {
                      setRegError(data.error || "Registration failed");
                    }
                  } catch { setRegError("Could not connect to server"); }
                  setRegLoading(false);
                }} className="space-y-4">
                  {regError && <div className="p-3 rounded-xl bg-loss/10 border border-loss/30"><p className="text-sm text-loss">{regError}</p></div>}

                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1">Exness Email *</label>
                    <input type="email" required value={regForm.email} onChange={e => setRegForm({...regForm, email: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="your@email.com" />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1">Nickname *</label>
                    <input type="text" required minLength={2} maxLength={30} value={regForm.nickname} onChange={e => setRegForm({...regForm, nickname: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="Your display name" />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1">Account Number *</label>
                    <input type="text" required value={regForm.accountNumber} onChange={e => setRegForm({...regForm, accountNumber: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="MT5 account number" />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1">MT5 Server *</label>
                    <input type="text" required value={regForm.mt5Server} onChange={e => setRegForm({...regForm, mt5Server: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="e.g., Exness-MT5Trial9" />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 font-medium mb-1">Investor Password *</label>
                    <input type="password" required value={regForm.investorPassword} onChange={e => setRegForm({...regForm, investorPassword: e.target.value})} className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50" placeholder="Read-only investor password" />
                    <p className="text-[10px] text-gray-500 mt-1.5 flex items-start gap-1"><span className="text-profit">&#128274;</span> This is your MT5 read-only password — it only allows viewing trades. It cannot be used to trade, withdraw, or access your funds in any way.</p>
                  </div>

                  {registerChallenge.type === 'hybrid' && (
                    <div>
                      <label className="block text-xs text-gray-400 font-medium mb-1">Account Type *</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setRegForm({...regForm, accountType: 'demo'})} className={`p-2.5 rounded-xl border text-sm font-semibold transition-all ${regForm.accountType === 'demo' ? 'border-royal bg-royal/10 text-royal' : 'border-white/20 text-gray-400'}`}>Demo</button>
                        <button type="button" onClick={() => setRegForm({...regForm, accountType: 'real'})} className={`p-2.5 rounded-xl border text-sm font-semibold transition-all ${regForm.accountType === 'real' ? 'border-gold bg-gold/10 text-gold' : 'border-white/20 text-gray-400'}`}>Real</button>
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={regLoading} className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                    {regLoading ? <><Loader2 size={16} className="animate-spin" /> Verifying...</> : "Register"}
                  </button>

                  <p className="text-[10px] text-gray-500 text-center">We use read-only investor passwords only — your account funds and trading ability are never at risk.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
