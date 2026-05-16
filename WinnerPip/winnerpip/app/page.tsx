import Image from "next/image";
import Link from "next/link";
import { Sparkles, Zap, Shield, TrendingUp, Users, BarChart3 } from "lucide-react";

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
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <Image
                  src="/winnerpip-icon.png"
                  alt="WinnerPip"
                  width={44}
                  height={44}
                  className="rounded-xl relative"
                />
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:inline">WinnerPip</span>
            </Link>
            <nav className="flex items-center gap-4 md:gap-6">
              <Link href="/challenges" className="text-sm md:text-base text-gray-400 hover:text-white transition">
                Challenges
              </Link>
              <Link href="#features" className="text-sm md:text-base text-gray-400 hover:text-white transition hidden sm:inline">
                Features
              </Link>
              <Link
                href="/challenges"
                className="text-sm md:text-base text-gray-400 hover:text-white transition"
              >
                Login
              </Link>
              <Link
                href="/challenges"
                className="bg-gradient-brand hover:opacity-90 text-white px-4 py-2 md:px-6 md:py-2.5 rounded-xl transition text-sm md:text-base font-semibold shadow-lg shadow-royal/20"
              >
                Sign Up
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 relative">
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
              The ultimate platform for hosting and participating in <span className="gradient-text font-semibold">forex trading competitions</span>.
              Automated verification, real-time monitoring, and transparent leaderboards.
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
                description="Real-time rankings with full transparency. See exactly how you rank against other traders."
                gradient="from-profit/20 to-profit/5"
                iconColor="text-profit"
              />
              <FeatureCard
                icon={<Shield className="w-8 h-8" />}
                title="Automated Verification"
                description="Verifications for challenges are automated and done in minutes. No manual checking required."
                gradient="from-royal/20 to-royal/5"
                iconColor="text-royal"
              />
              <FeatureCard
                icon={<Zap className="w-8 h-8" />}
                title="Real-Time Monitoring"
                description="Automatic rule enforcement and violation detection across all participants."
                gradient="from-gold/20 to-gold/5"
                iconColor="text-gold"
              />
              <FeatureCard
                icon={<BarChart3 className="w-8 h-8" />}
                title="Flexible Rules"
                description="Each challenge has custom rules tailored to test different trading strategies."
                gradient="from-royal/20 to-royal/5"
                iconColor="text-royal"
              />
              <FeatureCard
                icon={<Users className="w-8 h-8" />}
                title="Multi-Account Support"
                description="Support for demo and real account challenges."
                gradient="from-profit/20 to-profit/5"
                iconColor="text-profit"
              />
              <FeatureCard
                icon={<Sparkles className="w-8 h-8" />}
                title="Detailed Analytics"
                description="Track your performance with comprehensive trade history and statistics."
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
                title="Register & Verify"
                description="Sign up and connect your Exness trading account. Automatic verification ensures you meet all requirements."
              />
              <Step
                number="2"
                title="Join a Challenge"
                description="Browse available challenges and join one that matches your style. Demo or real account - your choice."
              />
              <Step
                number="3"
                title="Trade & Compete"
                description="Trade according to the challenge rules. Our system monitors your trades in real-time."
              />
              <Step
                number="4"
                title="Win Prizes"
                description="Top performers win prizes. All rankings are transparent and based on qualified profits."
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="glass border-t border-white/5 py-8 relative">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">&copy; 2026 WinnerPip. All rights reserved.</p>
            <div className="flex gap-6 text-sm">
              <Link href="/about" className="text-gray-500 hover:text-gray-300 transition">About</Link>
              <Link href="/terms" className="text-gray-500 hover:text-gray-300 transition">Terms</Link>
              <Link href="/privacy" className="text-gray-500 hover:text-gray-300 transition">Privacy</Link>
              <Link href="/host" className="text-gray-600 hover:text-gray-400 transition">Host</Link>
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
