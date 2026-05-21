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
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const res = await fetch(`${apiUrl}/api/challenges`);
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

      // No placeholder data — show empty state
      setChallenges([]);
      setLoading(false);
    };
    fetchChallenges();
  }, []);

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
        return { label: "Ended", color: "bg-white/5 text-gray-500 border-white/10" };
      case "submission_open":
        return { label: "Submissions Open", color: "bg-royal/20 text-royal border-royal/30" };
      case "reviewing":
        return { label: "Final Review", color: "bg-royal/20 text-royal border-royal/30" };
      default:
        return { label: status, color: "bg-white/10 text-gray-400 border-white/20" };
    }
  };

  const handleChallengeClick = (challenge: Challenge) => {
    // Navigate to login page for that challenge
    window.location.href = `/login?challenge=${challenge.id}`;
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
        <div className="text-center mb-12">
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

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-royal animate-spin" />
          </div>
        )}

        {/* No challenges */}
        {!loading && challenges.length === 0 && (
          <div className="text-center py-20">
            <Trophy className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">No challenges available yet</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon or follow @BirrForex for announcements</p>
          </div>
        )}

        {/* Challenge Cards */}
        {!loading && challenges.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {challenges.map((challenge) => {
              const badge = getStatusBadge(challenge);

              // Team-only challenge — same card layout but with blurred details and team tag
              if (challenge.teamOnly) {
                return (
                  <button
                    key={challenge.id}
                    onClick={() => handleChallengeClick(challenge)}
                    className="text-left w-full glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-royal/10 to-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>

                    <div className="p-6 relative">
                      {/* Title + Badges */}
                      <div className="mb-5">
                        <h3 className="text-xl font-bold text-white mb-3 group-hover:gradient-text transition-all line-clamp-2">
                          {challenge.title}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold">
                            BirrForex Team Only
                          </span>
                        </div>
                      </div>

                      {/* Details — blurred values */}
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
                              <span className="text-white blur-[5px] select-none">${challenge.startingBalance}</span>
                              <span className="text-gray-500 mx-1">→</span>
                              <span className="text-gold blur-[5px] select-none">${challenge.targetBalance}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                          <Users size={16} className="text-royal flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Participants</p>
                            <p className="text-sm text-white font-medium blur-[5px] select-none">{challenge.participants.total}</p>
                          </div>
                        </div>

                        {challenge.prizePoolText && (
                          <div className="p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                            <div className="flex items-center gap-2">
                              <Trophy size={14} className="text-gold flex-shrink-0" />
                              <p className="text-xs text-gray-500">Prize Pool</p>
                            </div>
                            <p className="text-sm text-gold font-medium mt-1 blur-[5px] select-none">{challenge.prizePoolText}</p>
                          </div>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-royal/10 border border-royal/20 group-hover:bg-royal/20 transition-all">
                        <span className="text-sm text-royal font-semibold">View Challenge</span>
                        <ArrowRight size={16} className="text-royal group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={challenge.id}
                  onClick={() => handleChallengeClick(challenge)}
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
                        <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${badge.color}`}>
                          {badge.label}
                        </span>
                        <span className="px-3 py-1.5 rounded-full bg-white/10 text-gray-300 border border-white/20 text-xs font-medium capitalize">
                          {challenge.type}
                        </span>
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
                            <span className="text-white">${challenge.startingBalance}</span>
                            <span className="text-gray-500 mx-1">→</span>
                            <span className="text-gold">${challenge.targetBalance}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                        <Users size={16} className="text-royal flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500">Participants</p>
                          <p className="text-sm text-white font-medium">{challenge.participants.total}</p>
                        </div>
                      </div>

                      {(challenge.realPrizes.length > 0 || challenge.demoPrizes.length > 0) && (
                        <div className="p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Trophy size={14} className="text-gold flex-shrink-0" />
                            <p className="text-xs text-gray-500">Prize Pool</p>
                          </div>
                          {challenge.realPrizes.length > 0 && (
                            <div className="mb-1.5">
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{challenge.type === "hybrid" ? "Real Account" : "Prizes"}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {challenge.realPrizes.map((p: number, i: number) => (
                                  <span key={i} className="px-2 py-0.5 bg-gold/20 rounded text-xs font-bold text-gold">
                                    {["🥇","🥈","🥉"][i] || `${i+1}.`} {typeof p === "number" ? `$${p}` : (isNaN(Number(p)) ? p : `$${p}`)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {challenge.demoPrizes.length > 0 && (
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{challenge.type === "hybrid" ? "Demo Account" : "Prizes"}</p>
                              <div className="flex flex-wrap gap-1.5">
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

                    {/* CTA hint */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-royal/10 border border-royal/20 group-hover:bg-royal/20 transition-all">
                      <span className="text-sm text-royal font-semibold">
                        {(() => {
                          const ds = challenge.displayStatus || challenge.status;
                          if (ds === "registration_open") return "Join Challenge";
                          if (ds === "ongoing" || ds === "active") return "View Dashboard";
                          if (ds === "ended" || ds === "completed") return "View Results";
                          if (ds === "evaluation" || ds === "reviewing" || ds === "submission_open") return "View Dashboard";
                          if (ds === "coming_soon") return "Coming Soon";
                          return "View Details";
                        })()}
                      </span>
                      <ArrowRight size={16} className="text-royal group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
