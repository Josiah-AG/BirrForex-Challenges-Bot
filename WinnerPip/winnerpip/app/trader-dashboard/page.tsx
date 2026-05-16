"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Trophy, 
  Calendar,
  Users,
  Target,
  LogOut,
  Bell,
  Settings as SettingsIcon,
  TrendingUp,
  Zap,
  ArrowUpRight,
  Sparkles,
  Mail,
  Hash,
  Server,
  Key,
  Check,
  Loader2,
  Shield,
} from "lucide-react";

export default function TraderDashboard() {
  const [notifications] = useState(3);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [selectedChallenge, setSelectedChallenge] = useState<{name: string; type: string; startDate: string; prize: string; participants: number; maxParticipants: number} | null>(null);
  const [joinStep, setJoinStep] = useState(1);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinCategory, setJoinCategory] = useState<"demo" | "real">("demo");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinAccount, setJoinAccount] = useState("");
  const [joinServer, setJoinServer] = useState("");
  const [joinPassword, setJoinPassword] = useState("");

  const handleJoinChallenge = (challenge: {name: string; type: string; startDate: string; prize: string; participants: number; maxParticipants: number}) => {
    setSelectedChallenge(challenge);
    setJoinStep(1);
    setJoinEmail("");
    setJoinAccount("");
    setJoinServer("");
    setJoinPassword("");
    setShowJoinModal(true);
  };

  const handleJoinNext = () => {
    if (joinStep === 2) {
      // Simulate email verification
      setJoinLoading(true);
      setTimeout(() => {
        setJoinLoading(false);
        setJoinStep(3);
      }, 1500);
      return;
    }
    if (joinStep === 4) {
      // Simulate connection test
      setJoinLoading(true);
      setTimeout(() => {
        setJoinLoading(false);
        setJoinStep(5);
      }, 2000);
      return;
    }
    if (joinStep === 5) {
      // Complete registration
      setShowJoinModal(false);
      alert(`Successfully joined ${selectedChallenge?.name}!`);
      return;
    }
    setJoinStep(joinStep + 1);
  };

  // Mock data - enrolled challenges
  const enrolledChallenges = [
    {
      id: 1,
      name: "Challenge 15 - Hybrid",
      type: "hybrid",
      status: "active",
      daysLeft: 12,
      myRank: 12,
      totalParticipants: 847,
      myProfit: 127.50,
      target: 60,
      startingBalance: 30,
    },
  ];

  // Mock data - available challenges
  const availableChallenges = [
    {
      id: 2,
      name: "Challenge 16 - Demo Only",
      type: "demo",
      status: "upcoming",
      startDate: "2026-03-20",
      prize: "$1000",
      participants: 0,
      maxParticipants: 1000,
    },
    {
      id: 3,
      name: "Challenge 17 - Real Account",
      type: "real",
      status: "upcoming",
      startDate: "2026-03-25",
      prize: "$2000",
      participants: 0,
      maxParticipants: 500,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
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
                <p className="text-xs text-gray-500">Trading Platform</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-2">
              <button className="relative p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all group">
                <Bell size={20} />
                {notifications > 0 && (
                  <>
                    <span className="absolute top-2 right-2 w-2 h-2 bg-loss rounded-full animate-glow"></span>
                    <span className="absolute top-2 right-2 w-2 h-2 bg-loss rounded-full animate-ping"></span>
                  </>
                )}
              </button>
              <Link href="/settings">
                <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                  <SettingsIcon size={20} />
                </button>
              </Link>
              <Button 
                variant="ghost" 
                size="sm" 
                className="hover:bg-white/5 text-gray-400 hover:text-white"
                onClick={() => window.location.href = "/login"}
              >
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl relative">
        {/* Welcome Section */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="text-gold w-8 h-8" />
            <h1 className="text-4xl md:text-6xl font-bold">
              Welcome back, <span className="gradient-text">Trader!</span>
            </h1>
          </div>
          <p className="text-gray-400 text-lg md:text-xl">Track your performance and dominate the leaderboards</p>
        </div>

        {/* Enrolled Challenges */}
        {enrolledChallenges.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 glass rounded-2xl">
                <TrendingUp className="text-profit w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">Active Challenges</h2>
                <p className="text-gray-500 text-sm">Your ongoing competitions</p>
              </div>
            </div>
            
            <div className="grid gap-8">
              {enrolledChallenges.map((challenge) => (
                <div key={challenge.id} className="glass-hover card-glow rounded-3xl group shadow-[0_20px_60px_rgba(0,0,0,0.5)] border border-white/20 relative overflow-hidden">
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-royal/10 via-transparent to-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
                  
                  <div className="p-6 md:p-8 relative">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 mb-8">
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <Zap className="text-gold w-6 h-6" />
                          <h3 className="text-2xl md:text-3xl font-bold text-white">{challenge.name}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="px-4 py-2 rounded-full bg-profit/20 text-profit border border-profit/30 text-sm font-semibold backdrop-blur-sm shadow-lg">
                            ● {challenge.status.toUpperCase()}
                          </span>
                          <span className="px-4 py-2 rounded-full bg-royal/20 text-royal border border-royal/30 text-sm font-semibold backdrop-blur-sm shadow-lg">
                            {challenge.type.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <Link href={`/challenge/${challenge.id}`}>
                        <Button className="bg-gradient-brand hover:opacity-90 text-white px-8 py-6 text-lg rounded-2xl shadow-2xl shadow-royal/30 hover:shadow-royal/50 transition-all group">
                          View Dashboard
                          <ArrowUpRight className="ml-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" size={20} />
                        </Button>
                      </Link>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Rank Card */}
                      <div className="glass rounded-2xl p-6 hover:bg-white/10 transition-all group/card border border-white/20 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Trophy className="text-gold w-5 h-5" />
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Rank</p>
                        </div>
                        <p className="text-4xl font-bold gradient-text mb-1">#{challenge.myRank}</p>
                        <p className="text-sm text-gray-500">of {challenge.totalParticipants}</p>
                      </div>

                      {/* Profit Card */}
                      <div className="glass rounded-2xl p-6 hover:bg-white/10 transition-all group/card border border-white/20 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="text-profit w-5 h-5" />
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Profit</p>
                        </div>
                        <p className={`text-4xl font-bold mb-1 ${challenge.myProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                          ${challenge.myProfit}
                        </p>
                        <p className="text-sm text-gray-500">Target: ${challenge.target}</p>
                      </div>

                      {/* Days Left Card */}
                      <div className="glass rounded-2xl p-6 hover:bg-white/10 transition-all group/card border border-white/20 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="text-gold w-5 h-5" />
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Time Left</p>
                        </div>
                        <p className="text-4xl font-bold text-gold mb-1">{challenge.daysLeft}</p>
                        <p className="text-sm text-gray-500">days remaining</p>
                      </div>

                      {/* Progress Card */}
                      <div className="glass rounded-2xl p-6 hover:bg-white/10 transition-all group/card border border-white/20 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Target className="text-royal w-5 h-5" />
                          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Progress</p>
                        </div>
                        <p className="text-4xl font-bold text-royal mb-1">
                          {((challenge.myProfit / challenge.target) * 100).toFixed(0)}%
                        </p>
                        <p className="text-sm text-gray-500">to target</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Challenges */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 glass rounded-2xl">
              <Trophy className="text-gold w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-white">Available Challenges</h2>
              <p className="text-gray-500 text-sm">Join and start competing</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableChallenges.map((challenge) => (
              <div key={challenge.id} className="glass-hover card-glow rounded-2xl group shadow-[0_12px_40px_rgba(0,0,0,0.4)] border border-white/20 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-royal/10 to-gold/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-[#0f1629] to-[#1a1f3a]"></div>
                
                <div className="p-6 relative">
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-white mb-3 group-hover:gradient-text transition-all">{challenge.name}</h3>
                    <div className="flex gap-2">
                      <span className="px-3 py-1.5 rounded-full bg-white/10 text-gray-300 border border-white/20 text-xs font-medium shadow-lg">
                        {challenge.status}
                      </span>
                      <span className="px-3 py-1.5 rounded-full bg-royal/20 text-royal border border-royal/30 text-xs font-semibold shadow-lg">
                        {challenge.type}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="p-2 glass rounded-lg">
                        <Calendar size={16} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Starts</p>
                        <p className="text-sm text-white font-medium">{challenge.startDate}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-gold/10 to-gold/5 border border-gold/20">
                      <div className="p-2 glass rounded-lg">
                        <Trophy size={16} className="text-gold" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Prize Pool</p>
                        <p className="text-sm font-bold gradient-text">{challenge.prize}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="p-2 glass rounded-lg">
                        <Users size={16} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Participants</p>
                        <p className="text-sm text-white font-medium">{challenge.participants}/{challenge.maxParticipants}</p>
                      </div>
                    </div>
                  </div>

                  <Button 
                    onClick={() => handleJoinChallenge(challenge)}
                    className="w-full bg-gradient-brand hover:opacity-90 text-white py-6 rounded-xl shadow-lg shadow-royal/20 hover:shadow-royal/40 transition-all font-semibold"
                  >
                    Join Challenge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Join Challenge Modal — Multi-Step Registration */}
        {showJoinModal && selectedChallenge && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowJoinModal(false)}>
            <div className="glass-hover card-glow rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-royal/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="p-6 md:p-8 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                    <Trophy className="text-gold w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Join Challenge</h3>
                    <p className="text-sm text-gray-400">{selectedChallenge.name} — Step {joinStep} of 5</p>
                  </div>
                </div>
                {/* Progress dots */}
                <div className="flex gap-2 mt-4">
                  {[1,2,3,4,5].map(s => (
                    <div key={s} className={`flex-1 h-1 rounded-full transition-all ${s <= joinStep ? 'bg-royal' : 'bg-white/10'}`} />
                  ))}
                </div>
              </div>

              <div className="p-6 md:p-8">
                {/* Step 1: Choose Category */}
                {joinStep === 1 && (
                  <div className="space-y-4">
                    <p className="text-gray-300 mb-4">Choose your account category:</p>
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => setJoinCategory("demo")}
                        className={`p-5 rounded-xl border text-center transition-all ${joinCategory === "demo" ? "border-royal bg-royal/10" : "border-white/20 hover:border-white/30"}`}>
                        <p className="text-2xl mb-2">🏦</p>
                        <p className="text-white font-bold">Demo</p>
                        <p className="text-xs text-gray-500 mt-1">Practice account</p>
                      </button>
                      <button onClick={() => setJoinCategory("real")}
                        className={`p-5 rounded-xl border text-center transition-all ${joinCategory === "real" ? "border-gold bg-gold/10" : "border-white/20 hover:border-white/30"}`}>
                        <p className="text-2xl mb-2">💰</p>
                        <p className="text-white font-bold">Real</p>
                        <p className="text-xs text-gray-500 mt-1">Live account</p>
                      </button>
                    </div>
                    <div className="bg-royal/10 border border-royal/20 rounded-xl p-3 mt-4">
                      <p className="text-xs text-gray-300">You can only compete in one category per challenge.</p>
                    </div>
                  </div>
                )}

                {/* Step 2: Exness Email */}
                {joinStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Mail className="text-royal w-5 h-5" />
                      <p className="text-white font-semibold">Exness Email</p>
                    </div>
                    <p className="text-gray-400 text-sm">Enter the email address associated with your Exness account.</p>
                    <Input type="email" value={joinEmail} onChange={(e) => setJoinEmail(e.target.value)} placeholder="your@email.com" />
                    {joinLoading && (
                      <div className="flex items-center gap-2 text-royal">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <p className="text-sm">Verifying your account...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: MT5 Account Details */}
                {joinStep === 3 && (
                  <div className="space-y-4">
                    <div className="bg-profit/10 border border-profit/20 rounded-xl p-3 mb-2">
                      <p className="text-profit text-sm font-semibold flex items-center gap-2"><Check size={16} /> Email verified!</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="text-royal w-4 h-4" />
                        <label className="text-sm text-gray-400 font-medium">MT5 {joinCategory === "demo" ? "Demo" : "Real"} Account Number</label>
                      </div>
                      <Input value={joinAccount} onChange={(e) => setJoinAccount(e.target.value)} placeholder="e.g., 12345678" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Server className="text-royal w-4 h-4" />
                        <label className="text-sm text-gray-400 font-medium">MT5 Server</label>
                      </div>
                      <Input value={joinServer} onChange={(e) => setJoinServer(e.target.value)}
                        placeholder={joinCategory === "demo" ? "e.g., ExnessMT5Trial9" : "e.g., ExnessMT5Real9"} />
                    </div>
                  </div>
                )}

                {/* Step 4: Investor Password */}
                {joinStep === 4 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="text-royal w-5 h-5" />
                      <p className="text-white font-semibold">Investor Password</p>
                    </div>
                    <p className="text-gray-400 text-sm">This is the read-only password for your MT5 account. It allows the platform to view your trades without making any changes.</p>
                    <Input type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="Investor password" />
                    {joinLoading && (
                      <div className="flex items-center gap-2 text-royal">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <p className="text-sm">Connecting to your account...</p>
                      </div>
                    )}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                      <p className="text-xs text-gray-400"><Shield className="inline w-3 h-3 mr-1" />Your password is encrypted and used only for read-only access to monitor trades.</p>
                    </div>
                  </div>
                )}

                {/* Step 5: Confirmation */}
                {joinStep === 5 && (
                  <div className="space-y-4">
                    <div className="bg-profit/10 border border-profit/20 rounded-xl p-4 text-center">
                      <p className="text-profit text-lg font-bold flex items-center justify-center gap-2"><Check size={20} /> Account Connected!</p>
                    </div>
                    <div className="glass rounded-xl p-5 border border-white/10 space-y-3">
                      <div className="flex justify-between"><span className="text-gray-400">Category:</span><span className="text-white font-semibold capitalize">{joinCategory}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Email:</span><span className="text-white font-semibold">{joinEmail}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Account:</span><span className="text-white font-semibold">{joinAccount}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Server:</span><span className="text-white font-semibold">{joinServer}</span></div>
                    </div>
                    <div className="bg-royal/10 border border-royal/20 rounded-xl p-3">
                      <p className="text-sm text-gray-300">By confirming, you agree to follow all challenge rules. The platform will monitor your trades in real-time.</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                  {joinStep > 1 && !joinLoading && (
                    <Button onClick={() => setJoinStep(joinStep - 1)} variant="ghost" className="flex-1 px-4 py-3 rounded-xl hover:bg-white/5">Back</Button>
                  )}
                  <Button onClick={handleJoinNext} disabled={joinLoading || (joinStep === 2 && !joinEmail) || (joinStep === 3 && (!joinAccount || !joinServer)) || (joinStep === 4 && !joinPassword)}
                    className="flex-1 bg-gradient-brand hover:opacity-90 text-white px-6 py-3 rounded-xl shadow-lg shadow-royal/20 disabled:opacity-50">
                    {joinLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : joinStep === 5 ? "Confirm & Join" : "Continue"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
