"use client";

import Link from "next/link";
import Image from "next/image";

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-gray-500 text-sm mb-10">Last updated: August 2026</p>

        <div className="space-y-6 text-gray-300 text-[15px] leading-relaxed">
          <h2 className="text-lg font-bold text-white">1. Data We Collect</h2>
          <p>When you register for a challenge, we collect:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>Your nickname (display name for the leaderboard)</li>
            <li>Email address (for account notifications, if provided)</li>
            <li>MT5 account number and server name</li>
            <li>Investor (read-only) password for trade monitoring</li>
            <li>Trade history from your MT5 account during the challenge period</li>
          </ul>

          <h2 className="text-lg font-bold text-white">2. How We Use Your Data</h2>
          <p>Your data is used solely for:</p>
          <ul className="list-disc list-inside space-y-2 text-gray-400">
            <li>Monitoring trades during the challenge period</li>
            <li>Evaluating trades against challenge rules</li>
            <li>Calculating and displaying leaderboard rankings</li>
            <li>Sending challenge-related notifications (if email is provided)</li>
            <li>Verifying account eligibility (partner allocation checks)</li>
          </ul>

          <h2 className="text-lg font-bold text-white">3. Data Security</h2>
          <p>
            Your data is stored securely on encrypted infrastructure. Investor passwords are used exclusively for read-only trade monitoring and cannot be used to execute trades or access funds. Sensitive credentials (such as broker API keys for challenge hosts) are encrypted using AES-256 encryption with keys stored separately from the database.
          </p>

          <h2 className="text-lg font-bold text-white">4. Data Retention</h2>
          <p>
            Trade data and registration details are retained for the duration of the challenge and a reasonable period after completion (for result verification and dispute resolution). After this period, detailed trade data may be deleted. Leaderboard results (nickname, rank, qualified balance) are retained indefinitely as part of the platform&apos;s challenge history.
          </p>

          <h2 className="text-lg font-bold text-white">5. Data Sharing</h2>
          <p>
            We do not sell or share your personal data with third parties. Your leaderboard performance (nickname, rank, trade count) is publicly visible on the challenge page. Your account number, email, and password are never displayed publicly.
          </p>
          <p>
            For transparency during active challenges, all participants&apos; trading history (trade symbol, direction, lot size, open/close time, profit, and rule violations) is visible to other participants through the leaderboard. This ensures fair play and allows participants to verify results. Only your nickname is shown alongside this data, not your account number or personal details.
          </p>
          <p>
            For hosted challenges, the challenge host can see your nickname, account type, account number, and registration status. They cannot see your investor password.
          </p>

          <h2 className="text-lg font-bold text-white">6. Read-Only Access</h2>
          <p>
            The investor password you provide grants read-only access to your trade history. This means WinnerPip can view closed trades, balances, and account info, but cannot place trades, modify orders, deposit, withdraw, or take any action on your account. You can change your investor password at any time to revoke access.
          </p>

          <h2 className="text-lg font-bold text-white">7. Cookies and Tracking</h2>
          <p>
            WinnerPip uses local storage to maintain your login session. We do not use third-party tracking cookies or analytics services that collect personal data.
          </p>

          <h2 className="text-lg font-bold text-white">8. Email Communications</h2>
          <p>
            By registering for a challenge with your email address, you consent to receive challenge-related notifications including registration confirmations, balance warnings, disqualification notices, and challenge start/end updates. These are transactional emails directly related to your participation, not marketing communications. You can stop receiving these emails by withdrawing from the challenge.
          </p>

          <h2 className="text-lg font-bold text-white">9. Data Controller and Processor</h2>
          <p>
            For BirrForex challenges, BirrForex acts as the data controller. For hosted challenges (third-party), the challenge host is the data controller and WinnerPip acts as a data processor providing technical services on their behalf. In both cases, WinnerPip applies the same security and privacy standards to your data.
          </p>

          <h2 className="text-lg font-bold text-white">10. Your Rights</h2>
          <p>
            You can request deletion of your data by contacting support@birrforex.com. If you withdraw from a challenge, your registration data will be marked as removed and your trades will no longer be evaluated.
          </p>

          <h2 className="text-lg font-bold text-white">11. Contact</h2>
          <p>
            For privacy-related questions or data deletion requests, contact us at <a href="mailto:support@birrforex.com" className="text-royal hover:underline">support@birrforex.com</a>.
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
