"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { mockChallenges, mockRegistrations } from "@/lib/mockData";
import {
  Trophy,
  Users,
  LogOut,
  Bell,
  Settings as SettingsIcon,
  Plus,
  DollarSign,
  Eye,
  AlertTriangle,
  Activity,
  Shield,
  Download,
  UserX,
  ChevronRight,
} from "lucide-react";

export default function HostDashboard() {
  const [notifications] = useState(2);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);

  const challenges = mockChallenges;
  const totalParticipants = challenges.reduce((sum, c) => sum + c.participantCount, 0);
  const totalPrize = challenges.reduce((sum, c) => sum + [...c.realPrizes, ...c.demoPrizes].reduce((s, p) => s + p, 0), 0);

  const selectedChallenge = selectedChallengeId ? challenges.find(c => c.id === selectedChallengeId) : null;
  const challengeRegistrations = mockRegistrations.filter(r => r.challengeId === (selectedChallengeId || "1"));

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
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
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={44} height={44} className="rounded-xl relative shadow-2xl" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl font-bold gradient-text">WinnerPip</span>
                <p className="text-xs text-gray-500">Host Dashboard</p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <button className="relative p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <Bell size={20} />
                {notifications > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-loss rounded-full animate-glow"></span>}
              </button>
              <Link href="/settings"><button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><SettingsIcon size={20} /></button></Link>
              <Button variant="ghost" size="sm" className="hover:bg-white/5 text-gray-400 hover:text-white" onClick={() => window.location.href = "/login"}><LogOut size={18} /></Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl relative">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12 gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-2">Host <span className="gradient-text">Dashboard</span></h1>
            <p className="text-gray-400 text-lg">Manage your trading challenges</p>
          </div>
          <Link href="/host-dashboard/create">
            <Button className="bg-gradient-brand hover:opacity-90 text-white px-8 py-4 text-lg rounded-2xl shadow-lg shadow-royal/20">
              <Plus className="mr-2" size={20} /> Create Challenge
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-12">
          <div className="glass-hover card-glow rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-3"><Trophy className="text-gold w-5 h-5" /><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Challenges</p></div>
              <p className="text-4xl font-bold text-white">{challenges.length}</p>
              <p className="text-sm text-gray-500 mt-1">{challenges.filter(c => c.status === "active").length} active</p>
            </div>
          </div>
          <div className="glass-hover card-glow rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-3"><Users className="text-royal w-5 h-5" /><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Participants</p></div>
              <p className="text-4xl font-bold text-white">{totalParticipants}</p>
              <p className="text-sm text-gray-500 mt-1">across all challenges</p>
            </div>
          </div>
          <div className="glass-hover card-glow rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-3"><DollarSign className="text-profit w-5 h-5" /><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Prizes</p></div>
              <p className="text-4xl font-bold gradient-text">${totalPrize.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">prize pool</p>
            </div>
          </div>
          <div className="glass-hover card-glow rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
            <div className="p-6 relative">
              <div className="flex items-center gap-2 mb-3"><AlertTriangle className="text-loss w-5 h-5" /><p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Violations</p></div>
              <p className="text-4xl font-bold text-white">23</p>
              <p className="text-sm text-gray-500 mt-1">flagged trades today</p>
            </div>
          </div>
        </div>

        {/* Challenges List */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">My Challenges</h2>
          <div className="space-y-4">
            {challenges.map((challenge) => (
              <div key={challenge.id} className="glass-hover card-glow rounded-2xl border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
                <div className="p-6 md:p-8 relative">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-xl md:text-2xl font-bold text-white">{challenge.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          challenge.status === "active" ? "bg-profit/20 text-profit border border-profit/30" :
                          challenge.status === "registration_open" ? "bg-royal/20 text-royal border border-royal/30" :
                          "bg-white/10 text-gray-400 border border-white/20"
                        }`}>{challenge.status.replace("_", " ").toUpperCase()}</span>
                        <span className="px-3 py-1 rounded-full bg-white/10 text-gray-300 border border-white/20 text-xs font-medium">{challenge.type}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><p className="text-gray-500">Participants</p><p className="text-white font-semibold">{challenge.participantCount} <span className="text-gray-500">(D:{challenge.demoCount} R:{challenge.realCount})</span></p></div>
                        <div><p className="text-gray-500">Prize Pool</p><p className="text-gold font-semibold">{challenge.prizePoolText}</p></div>
                        <div><p className="text-gray-500">Period</p><p className="text-white font-semibold">{challenge.startDate} → {challenge.endDate}</p></div>
                        <div><p className="text-gray-500">Balance</p><p className="text-white font-semibold">${challenge.startingBalance} → ${challenge.targetBalance}</p></div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedChallengeId(challenge.id); setShowParticipants(true); }}
                        className="flex items-center gap-2 px-4 py-3 glass border border-white/20 text-white hover:bg-white/10 rounded-xl transition-all text-sm">
                        <Users size={16} /> Participants
                      </button>
                      <Link href={`/challenge/${challenge.id}`}>
                        <button className="flex items-center gap-2 px-4 py-3 bg-royal hover:bg-royal-600 text-white rounded-xl transition-all text-sm">
                          <Eye size={16} /> View <ChevronRight size={14} />
                        </button>
                      </Link>
                    </div>
                  </div>

                  {/* Quick Stats for Active Challenge */}
                  {challenge.status === "active" && (
                    <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/10">
                      <div className="flex items-center gap-2"><Activity className="text-profit w-4 h-4" /><span className="text-sm text-gray-400">Active today:</span><span className="text-white font-semibold">124</span></div>
                      <div className="flex items-center gap-2"><Shield className="text-royal w-4 h-4" /><span className="text-sm text-gray-400">Connected:</span><span className="text-profit font-semibold">812</span></div>
                      <div className="flex items-center gap-2"><UserX className="text-loss w-4 h-4" /><span className="text-sm text-gray-400">Disqualified:</span><span className="text-loss font-semibold">3</span></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Participants Modal */}
      {showParticipants && selectedChallenge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowParticipants(false)}>
          <div className="glass-hover card-glow rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden border border-white/20 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 md:p-8 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-royal/20 rounded-xl border border-royal/30"><Users className="text-royal w-6 h-6" /></div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Participants</h3>
                    <p className="text-sm text-gray-400">{selectedChallenge.title} — {challengeRegistrations.length} registered</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-2 px-3 py-2 glass border border-white/20 text-gray-300 hover:text-white rounded-lg text-sm"><Download size={14} /> Export CSV</button>
                  <button onClick={() => setShowParticipants(false)} className="p-2 hover:bg-white/10 rounded-xl"><span className="text-gray-400 text-2xl">×</span></button>
                </div>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(85vh-120px)] p-6 md:p-8">
              <div className="space-y-3">
                {challengeRegistrations.map((reg) => (
                  <div key={reg.id} className={`glass-hover rounded-xl p-4 border transition-all ${reg.disqualified ? "border-loss/30 bg-loss/5" : "border-white/10"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center text-white font-bold">{reg.username[0].toUpperCase()}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-semibold">{reg.username}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reg.accountType === "demo" ? "bg-royal/20 text-royal border border-royal/30" : "bg-gold/20 text-gold border border-gold/30"}`}>{reg.accountType}</span>
                            {reg.disqualified && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-loss/20 text-loss border border-loss/30">DQ</span>}
                          </div>
                          <p className="text-gray-500 text-sm">{reg.exnessEmail} • Acct: {reg.accountNumber}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                          reg.connectionStatus === "connected" ? "bg-profit/20 text-profit" :
                          reg.connectionStatus === "disconnected" ? "bg-loss/20 text-loss" : "bg-white/10 text-gray-400"
                        }`}>{reg.connectionStatus}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
