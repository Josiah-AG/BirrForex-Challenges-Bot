"use client";

import Link from "next/link";
import Image from "next/image";
import { Trophy, Shield, BarChart3, Users, Zap, ArrowRight, CheckCircle } from "lucide-react";

export default function HostLandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-royal/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl"></div>
      </div>

      {/* Header */}
      <header className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-bold gradient-text">WinnerPip</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/host/login" className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">Sign In</Link>
            <Link href="/host/register" className="px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold hover:opacity-90 transition-all">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 md:py-32 max-w-5xl relative text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-royal/10 border border-royal/20 mb-6">
          <Trophy size={14} className="text-gold" />
          <span className="text-xs text-gray-300 font-medium">Host Trading Challenges</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
          <span className="text-white">Run Your Own</span><br />
          <span className="gradient-text">Trading Competitions</span>
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          WinnerPip gives you the infrastructure to host professional trading challenges. Automated tracking, real-time leaderboards, and fair evaluation. You focus on your community, we handle the tech.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/host/register" className="px-8 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all flex items-center gap-2">
            Start Hosting <ArrowRight size={16} />
          </Link>
          <Link href="/host/login" className="px-8 py-3.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-semibold hover:bg-white/10 transition-all">
            Sign In
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-16 max-w-5xl relative">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">Everything You Need to Host</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<BarChart3 className="w-7 h-7 text-royal" />}
            title="Automated Tracking"
            description="Trades are tracked automatically. The system monitors every participant's account and evaluates performance against your rules."
          />
          <FeatureCard
            icon={<Trophy className="w-7 h-7 text-gold" />}
            title="Real-Time Leaderboard"
            description="Participants see their rank update throughout the challenge. Transparent, fair, and engaging for your community."
          />
          <FeatureCard
            icon={<Shield className="w-7 h-7 text-profit" />}
            title="Configurable Rules"
            description="Set your own rules: lot size limits, risk caps, trade duration, active days, and more. Each rule can be toggled on or off."
          />
          <FeatureCard
            icon={<Users className="w-7 h-7 text-royal" />}
            title="Easy Registration"
            description="Participants register directly on WinnerPip. Or upload a CSV with your participant list and we verify and connect them."
          />
          <FeatureCard
            icon={<Zap className="w-7 h-7 text-gold" />}
            title="Multiple Formats"
            description="Demo, real, or hybrid challenges. Fixed deposit, max limit, or min limit modes. Percentage or fixed targets."
          />
          <FeatureCard
            icon={<CheckCircle className="w-7 h-7 text-profit" />}
            title="Fair Evaluation"
            description="The system detects rule violations, fake stop losses, and account manipulation. Winners are determined by merit."
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-16 max-w-4xl relative">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="space-y-6">
          <Step number="1" title="Get Your Host Account" description="Contact us and we'll set up your host account. You'll receive login credentials for your dashboard." />
          <Step number="2" title="Create a Challenge" description="Set the title, dates, deposit rules, targets, prizes, and trading rules. Submit for approval." />
          <Step number="3" title="Participants Register" description="Users register directly on WinnerPip, or you upload a participant list. We verify every account." />
          <Step number="4" title="Challenge Runs Automatically" description="The system tracks trades, enforces rules, and updates the leaderboard throughout the competition." />
          <Step number="5" title="Results & Winners" description="At the end, the leaderboard is finalized. Winners are determined by the rules you set." />
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-20 max-w-3xl relative text-center">
        <div className="glass rounded-2xl border border-white/10 p-10">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Ready to Host?</h2>
          <p className="text-gray-400 mb-8">Get in touch and we&apos;ll have you running your first challenge in no time.</p>
          <Link href="/host/register" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold hover:opacity-90 transition-all">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 text-sm">
            <a href="https://linktr.ee/birrforex" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">
              Powered by <strong className="text-gray-400">BirrForex</strong>
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="glass rounded-2xl border border-white/10 p-6 hover:border-royal/30 transition-all">
      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-4">{icon}</div>
      <h3 className="text-white font-bold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="w-10 h-10 rounded-xl bg-royal/20 flex items-center justify-center flex-shrink-0">
        <span className="text-royal font-bold text-sm">{number}</span>
      </div>
      <div>
        <h3 className="text-white font-semibold mb-1">{title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
