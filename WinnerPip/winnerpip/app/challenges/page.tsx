"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
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
  startDate: string;
  endDate: string;
  startingBalance: number;
  targetBalance: number;
  prizePoolText: string | null;
  realPrizes: number[];
  demoPrizes: number[];
  participants: { total: number; demo: number; real: number };
}

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch challenges from API, fallback to placeholders
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
      } catch {
        console.log("API unavailable, using placeholders");
      }

      // Fallback placeholder data
      setChallenges([
        { id: 15, title: "Challenge 15 — Hybrid (Demo & Real)", type: "hybrid", status: "active", startDate: "2026-05-05T06:00:00.000Z", endDate: "2026-05-16T20:59:00.000Z", startingBalance: 30, targetBalance: 60, prizePoolText: "🥇 $400 | 🥈 $350 | 🥉 $300", realPrizes: [400, 350, 300], demoPrizes: [200, 150, 100], participants: { total: 2847, demo: 1923, real: 924 } },
        { id: 16, title: "Challenge 16 — Demo Sprint", type: "demo", status: "registration_open", startDate: "2026-05-26T06:00:00.000Z", endDate: "2026-06-06T20:59:00.000Z", startingBalance: 50, targetBalance: 100, prizePoolText: "🥇 $300 | 🥈 $200 | 🥉 $100", realPrizes: [], demoPrizes: [300, 200, 100], participants: { total: 1205, demo: 1205, real: 0 } },
        { id: 17, title: "Challenge 17 — Real Account Pro", type: "real", status: "registration_open", startDate: "2026-06-02T06:00:00.000Z", endDate: "2026-06-13T20:59:00.000Z", startingBalance: 100, targetBalance: 200, prizePoolText: "🥇 iPhone 16 Pro | 🥈 $500 | 🥉 $300", realPrizes: [], demoPrizes: [], participants: { total: 412, demo: 0, real: 412 } },
        { id: 14, title: "Challenge 14 — Hybrid Classic", type: "hybrid", status: "completed", startDate: "2026-04-14T06:00:00.000Z", endDate: "2026-04-25T20:59:00.000Z", startingBalance: 30, targetBalance: 60, prizePoolText: "🥇 $400 | 🥈 $300 | 🥉 $200", realPrizes: [400, 300, 200], demoPrizes: [200, 150, 100], participants: { total: 3102, demo: 2100, real: 1002 } },
      ]);
      setLoading(false);
    };
    fetchChallenges();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registration_open":
        return { label: "Registration Open", color: "bg-profit/20 text-profit border-profit/30" };
      case "active":
        return { label: "Live", color: "bg-gold/20 text-gold border-gold/30" };
      case "submission_open":
        return { label: "Submissions Open", color: "bg-royal/20 text-royal border-royal/30" };
      case "reviewing":
        return { label: "Under Review", color: "bg-white/10 text-gray-300 border-white/20" };
      case "completed":
        return { label: "Completed", color: "bg-white/5 text-gray-500 border-white/10" };
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
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-gray-400 hover:text-white hover:bg-white/5">
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button className="bg-gradient-brand hover:opacity-90 text-white px-5 py-2 rounded-xl text-sm font-semibold">
                  Register
                </Button>
              </Link>
            </div>
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
              const badge = getStatusBadge(challenge.status);

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

                      {challenge.prizePoolText && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                          <Trophy size={16} className="text-gold flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">Prize Pool</p>
                            <p className="text-sm font-bold gradient-text line-clamp-2">{challenge.prizePoolText}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CTA hint */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-royal/10 border border-royal/20 group-hover:bg-royal/20 transition-all">
                      <span className="text-sm text-royal font-semibold">
                        {challenge.status === "registration_open" ? "Join Challenge" : challenge.status === "active" ? "View Dashboard" : "View Results"}
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
