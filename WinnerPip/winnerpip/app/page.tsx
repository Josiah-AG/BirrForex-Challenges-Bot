import Image from "next/image";
import Link from "next/link";
import { Sparkles, Zap, Shield, TrendingUp, Users, BarChart3 } from "lucide-react";
import { StatsSection } from "./StatsSection";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e1a]">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-profit/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5" role="banner">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group" aria-label="WinnerPip Home">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <Image
                  src="/winnerpip-icon.png"
                  alt="WinnerPip Logo"
                  width={44}
                  height={44}
                  className="rounded-xl relative"
                />
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:inline">WinnerPip</span>
            </Link>
            <nav className="flex items-center gap-4 md:gap-6" aria-label="Main navigation">
              <Link
                href="/challenges"
                className="bg-gradient-brand hover:opacity-90 text-white px-5 py-2.5 md:px-7 md:py-3 rounded-xl transition text-sm md:text-base font-semibold shadow-lg shadow-royal/20 flex items-center gap-2"
                aria-label="View and join trading challenges"
              >
                Join Challenge
                <Zap className="w-4 h-4" aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 relative" role="main">
        <section className="container mx-auto px-4 py-16 md:py-24 text-center">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Sparkles className="text-gold w-6 h-6 animate-pulse" />
              <span className="text-sm text-gray-400 uppercase tracking-wider font-semibold">The Future of Trading Competitions</span>
              <Sparkles className="text-gold w-6 h-6 animate-pulse" />
            </div>
            
            <Image
              src="/winnerpip-main-logo.png"
              alt="WinnerPip - Trade, Compete, Win"
              width={600}
              height={240}
              className="mx-auto mb-8 md:mb-12 w-full max-w-[400px] md:max-w-[600px] h-auto animate-float"
              priority
            />
            
            <p className="text-lg md:text-2xl text-gray-400 mb-10 md:mb-12 max-w-3xl mx-auto leading-relaxed">
              Trade on your own MT5 account. We track your performance automatically and rank you against other traders. Hit the target, follow the rules, win prizes.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
              <Link
                href="/challenges"
                className="group bg-gradient-brand hover:opacity-90 text-white px-8 py-4 md:px-10 md:py-5 rounded-2xl text-lg md:text-xl font-bold transition shadow-2xl shadow-royal/30 hover:shadow-royal/50 flex items-center justify-center gap-2"
              >
                View Challenges
                <Zap className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 md:py-24 relative">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                Why <span className="gradient-text">WinnerPip</span>?
              </h2>
              <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
                Built for traders who demand excellence, transparency, and fair competition
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
              <FeatureCard
                icon={<TrendingUp className="w-8 h-8" />}
                title="Live Leaderboards"
                description="See your rank update throughout the challenge. Fully transparent, no hidden calculations."
                gradient="from-profit/20 to-profit/5"
                iconColor="text-profit"
              />
              <FeatureCard
                icon={<Shield className="w-8 h-8" />}
                title="Automated Verification"
                description="Account connection is verified in seconds. No manual steps, no waiting."
                gradient="from-royal/20 to-royal/5"
                iconColor="text-royal"
              />
              <FeatureCard
                icon={<Zap className="w-8 h-8" />}
                title="Rule Enforcement"
                description="Every trade is checked against the challenge rules. Violations flagged automatically."
                gradient="from-gold/20 to-gold/5"
                iconColor="text-gold"
              />
              <FeatureCard
                icon={<BarChart3 className="w-8 h-8" />}
                title="Custom Rules"
                description="Each challenge has its own rules: lot size limits, SL requirements, max hold time, daily loss caps."
                gradient="from-royal/20 to-royal/5"
                iconColor="text-royal"
              />
              <FeatureCard
                icon={<Users className="w-8 h-8" />}
                title="Demo or Real"
                description="Compete with a demo account to practice, or go real for bigger prizes."
                gradient="from-profit/20 to-profit/5"
                iconColor="text-profit"
              />
              <FeatureCard
                icon={<Sparkles className="w-8 h-8" />}
                title="Full Trade History"
                description="See every trade, every violation, every pip. Nothing hidden."
                gradient="from-gold/20 to-gold/5"
                iconColor="text-gold"
              />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 md:py-24 relative">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-5xl font-bold mb-4">
                How It <span className="gradient-text">Works</span>
              </h2>
              <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
                Start competing in four simple steps
              </p>
            </div>
            
            <div className="max-w-4xl mx-auto space-y-8">
              <Step
                number="1"
                title="Register"
                description="Connect your MT5 account using the read-only investor password. This lets us track your trades without any access to your funds or trading ability."
              />
              <Step
                number="2"
                title="Join a Challenge"
                description="Pick a challenge that fits your style. Some are demo-only, some real, some both. Each has its own rules and prize structure."
              />
              <Step
                number="3"
                title="Trade"
                description="Trade normally on your MT5 account. The system pulls your data automatically 6 times a day and checks it against the challenge rules."
              />
              <Step
                number="4"
                title="Win"
                description="If you hit the target balance with qualified trades, you rank on the leaderboard. Top traders take home the prizes."
              />
            </div>
          </div>
        </section>

        {/* Track Record */}
        <StatsSection />

        {/* Security & Trust */}
        <section className="py-16 md:py-20 relative" aria-label="Security information">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto glass rounded-2xl border border-white/10 p-8 md:p-12">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-profit/20 rounded-xl border border-profit/30 flex-shrink-0">
                  <Shield className="w-6 h-6 text-profit" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-white mb-2">We only use read-only investor passwords</h3>
                  <p className="text-gray-400 text-sm md:text-base leading-relaxed">When you register for a challenge, you provide your MT5 investor password. This is a built-in MetaTrader feature that gives view-only access to trade history and balance. It cannot place trades, move money, or change anything on your account. Prop firms, copy-trading services, and analytics tools all use this same method.</p>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 mt-8">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className="text-profit font-bold text-sm mb-1">View-only access</p>
                  <p className="text-gray-500 text-xs">We can see your trades but never execute or modify them</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className="text-profit font-bold text-sm mb-1">No withdrawals possible</p>
                  <p className="text-gray-500 text-xs">Investor passwords have zero access to fund transfers</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <p className="text-profit font-bold text-sm mb-1">Standard MT5 feature</p>
                  <p className="text-gray-500 text-xs">Built into MetaTrader by design for safe third-party monitoring</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="glass border-t border-white/5 py-8 relative" role="contentinfo">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">&copy; 2026 WinnerPip. All rights reserved.</p>
            <div className="flex gap-6 text-sm">
              <Link href="/host" className="text-gray-500 hover:text-gray-300 transition">Host</Link>
              <Link href="/about" className="text-gray-500 hover:text-gray-300 transition">About</Link>
              <Link href="/terms" className="text-gray-500 hover:text-gray-300 transition">Terms</Link>
              <Link href="/privacy" className="text-gray-500 hover:text-gray-300 transition">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, gradient, iconColor }: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  gradient: string;
  iconColor: string;
}) {
  return (
    <div className="glass-hover card-glow rounded-2xl p-8 group">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl`}></div>
      <div className="relative">
        <div className={`${iconColor} mb-6 transform group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <h3 className="text-xl font-bold mb-3 text-white group-hover:gradient-text transition-all">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-6 group">
      <div className="flex-shrink-0">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 bg-gradient-brand rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
          <div className="relative w-16 h-16 bg-gradient-brand rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-2xl">
            {number}
          </div>
        </div>
      </div>
      <div className="flex-1 glass-hover rounded-2xl p-6">
        <h3 className="text-2xl font-bold mb-3 text-white group-hover:gradient-text transition-all">{title}</h3>
        <p className="text-gray-400 text-lg leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
