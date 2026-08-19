"use client";

import Link from "next/link";
import Image from "next/image";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <header className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-bold gradient-text">WinnerPip</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-3xl font-bold text-white mb-8">About WinnerPip</h1>

        <div className="space-y-6 text-gray-300 text-[15px] leading-relaxed">
          <p>
            WinnerPip is a trading competition platform built for forex and CFD trading communities. It provides the infrastructure for running professional trading challenges with automated performance tracking, rule enforcement, and real-time leaderboards.
          </p>

          <h2 className="text-xl font-bold text-white pt-4">What We Do</h2>
          <p>
            We connect to participants&apos; MT5 trading accounts (read-only) and monitor their trades throughout a challenge period. The system evaluates each trade against a set of configurable rules, removes profits from trades that violate those rules, and ranks participants based on their qualified performance.
          </p>

          <h2 className="text-xl font-bold text-white pt-4">How Challenges Work</h2>
          <p>
            A challenge has a defined start and end date, a set of trading rules, and prizes for top performers. Participants register with their MT5 account details and an investor (read-only) password. Once the challenge starts, the platform tracks all closed trades and updates the leaderboard multiple times per day.
          </p>
          <p>
            Rules can include lot size limits, maximum simultaneous trades, stop loss requirements, daily loss caps, trade duration limits, and minimum active trading days. Each rule can be individually enabled or disabled per challenge.
          </p>

          <h2 className="text-xl font-bold text-white pt-4">For Challenge Hosts</h2>
          <p>
            WinnerPip is also available as a hosting platform. Trading educators, broker partners, and community leaders can use WinnerPip to run their own branded challenges. Hosts get a dedicated dashboard to manage participants, view leaderboards, and configure rules. Visit <Link href="/host" className="text-royal hover:underline">winnerpip.com/host</Link> to learn more.
          </p>

          <h2 className="text-xl font-bold text-white pt-4">Powered by BirrForex</h2>
          <p>
            WinnerPip is developed and operated by <a href="https://linktr.ee/birrforex" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline font-semibold">BirrForex</a>, an Ethiopian forex education and community brand focused on building tools that make trading more accessible, competitive, and fair.
          </p>
        </div>
      </div>

      <footer className="border-t border-white/5 py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <Link href="/" className="text-gray-600 text-sm hover:text-gray-400">&larr; Back to WinnerPip</Link>
        </div>
      </footer>
    </div>
  );
}
