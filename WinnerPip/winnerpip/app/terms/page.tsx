"use client";

import Link from "next/link";
import Image from "next/image";

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: August 2026</p>

        <div className="space-y-6 text-gray-300 text-[15px] leading-relaxed">
          <h2 className="text-lg font-bold text-white">1. Platform Overview</h2>
          <p>
            WinnerPip is a trading competition platform that provides automated trade monitoring, rule evaluation, and leaderboard services for trading challenges. By using WinnerPip, you agree to these terms.
          </p>

          <h2 className="text-lg font-bold text-white">2. Account Registration</h2>
          <p>
            When you register for a challenge, you provide your MT5 account number, server, and investor (read-only) password. This gives the platform read-only access to view your trade history. WinnerPip cannot execute trades, modify orders, or withdraw funds from your account.
          </p>

          <h2 className="text-lg font-bold text-white">3. Challenge Rules</h2>
          <p>
            Each challenge has a specific set of rules defined by the challenge creator. Trades that violate these rules will have their profits removed from your qualified balance. Losses from rule-violating trades still count. The system evaluates rules automatically and the leaderboard reflects qualified performance only.
          </p>

          <h2 className="text-lg font-bold text-white">4. Disqualification</h2>
          <p>
            Participants may be disqualified for exceeding deposit limits, recharging their account during a challenge, failing to meet minimum trading requirements, or other rule violations. Disqualification decisions are made automatically by the evaluation system based on the defined rules.
          </p>

          <h2 className="text-lg font-bold text-white">5. Hosted Challenges (Third-Party)</h2>
          <p>
            WinnerPip hosts challenges on behalf of third-party challenge organizers. For hosted challenges (those marked &quot;Hosted by&quot; on the platform):
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>WinnerPip provides the technical platform only (trade monitoring, evaluation, leaderboard).</li>
            <li>Prizes and rewards are delivered by the challenge host, not by WinnerPip or BirrForex.</li>
            <li>WinnerPip and BirrForex are not responsible for prize delivery, disputes, or claims related to hosted challenges.</li>
            <li>Any disputes regarding prizes or challenge terms should be directed to the challenge host.</li>
          </ul>

          <h2 className="text-lg font-bold text-white">6. BirrForex Challenges</h2>
          <p>
            Challenges created directly by BirrForex (not marked as &quot;Hosted by&quot;) are organized, funded, and managed by BirrForex. Prize delivery for BirrForex challenges is handled by the BirrForex team.
          </p>

          <h2 className="text-lg font-bold text-white">7. No Financial Advice</h2>
          <p>
            WinnerPip is a competition platform and does not provide financial advice, trading signals, or investment recommendations. Participation in challenges involves real trading risk. Trade responsibly and only with capital you can afford to lose.
          </p>

          <h2 className="text-lg font-bold text-white">8. Fair Play</h2>
          <p>
            Any attempt to manipulate results, use multiple accounts, exploit system vulnerabilities, or engage in fraudulent activity will result in immediate disqualification and permanent ban from the platform.
          </p>

          <h2 className="text-lg font-bold text-white">9. Platform Availability</h2>
          <p>
            WinnerPip strives for continuous uptime but does not guarantee uninterrupted service. Scheduled maintenance, technical issues, or broker outages may temporarily affect data updates. The platform is not liable for missed trades or delayed evaluations caused by factors outside its control.
          </p>

          <h2 className="text-lg font-bold text-white">10. Changes to Terms</h2>
          <p>
            These terms may be updated at any time. Continued use of the platform after changes constitutes acceptance of the updated terms.
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
