"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Trophy,
  Calendar,
  Users,
  Target,
  Sparkles,
  ArrowRight,
} from "lucide-react";

interface DemoChallenge {
  id: number;
  title: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  startingBalance: number;
  targetBalance: number;
  participants: number;
  prizes: { place: string; amount: number }[];
}

const demoChallenges: DemoChallenge[] = [
  {
    id: 15,
    title: "Challenge 15 — Hybrid (Demo & Real)",
    type: "hybrid",
    status: "ongoing",
    startDate: "2025-05-05",
    endDate: "2025-05-19",
    startingBalance: 30,
    targetBalance: 60,
    participants: 2847,
    prizes: [
      { place: "🥇", amount: 50 },
      { place: "🥈", amount: 30 },
      { place: "🥉", amount: 20 },
    ],
  },
  {
    id: 16,
    title: "Challenge 16 — Real Account Only",
    type: "real",
    status: "registration_open",
    startDate: "2025-05-20",
    endDate: "2025-06-03",
    startingBalance: 200,
    targetBalance: 400,
    participants: 156,
    prizes: [
      { place: "🥇", amount: 100 },
      { place: "🥈", amount: 50 },
    ],
  },
  {
    id: 14,
    title: "Challenge 14 — Demo Sprint",
    type: "demo",
    status: "ended",
    startDate: "2025-04-21",
    endDate: "2025-05-04",
    startingBalance: 10,
    targetBalance: 20,
    participants: 1203,
    prizes: [
      { place: "🥇", amount: 30 },
      { place: "🥈", amount: 20 },
      { place: "🥉", amount: 10 },
    ],
  },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "registration_open":
      return { label: "Registration Open", color: "bg-profit/20 text-profit border-profit/30" };
    case "ongoing":
      return { label: "Ongoing (Live)", color: "bg-gold/20 text-gold border-gold/30" };
    case "ended":
      return { label: "Ended", color: "bg-white/5 text-gray-500 border-white/10" };
    default:
      return { label: status, color: "bg-white/10 text-gray-400 border-white/20" };
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getCtaLabel(status: string) {
  if (status === "registration_open") return "Join Challenge";
  if (status === "ongoing") return "View Dashboard";
  if (status === "ended") return "View Results";
  return "View Details";
}

export default function DemoChallengesPage() {
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
            <Link href="/PCD/C" className="flex items-center gap-3 group">
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

        {/* Challenge Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {demoChallenges.map((challenge) => {
            const badge = getStatusBadge(challenge.status);

            return (
              <Link
                key={challenge.id}
                href="/PCD/C/login"
                className="text-left w-full glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden block"
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
                        <p className="text-sm text-white font-medium">{challenge.participants.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Prizes */}
                    <div className="p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Trophy size={14} className="text-gold flex-shrink-0" />
                        <p className="text-xs text-gray-500">Prize Pool</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {challenge.prizes.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gold/20 rounded text-xs font-bold text-gold">
                            {p.place} ${p.amount}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CTA hint */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-royal/10 border border-royal/20 group-hover:bg-royal/20 transition-all">
                    <span className="text-sm text-royal font-semibold">
                      {getCtaLabel(challenge.status)}
                    </span>
                    <ArrowRight size={16} className="text-royal group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
