"use client";

import Link from "next/link";
import Image from "next/image";
import { Mail, ArrowLeft } from "lucide-react";

export default function HostRegisterPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-4">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-royal/8 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/host" className="inline-block">
            <Image src="/winnerpip-icon.png" alt="WinnerPip" width={56} height={56} className="rounded-xl mx-auto mb-3" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Become a Host</h1>
          <p className="text-gray-500 text-sm mt-1">Run your own trading challenges on WinnerPip</p>
        </div>

        {/* Contact Card */}
        <div className="glass rounded-2xl border border-white/10 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-royal/20 flex items-center justify-center mx-auto mb-5">
            <Mail size={28} className="text-royal" />
          </div>

          <h2 className="text-lg font-bold text-white mb-3">Contact Us to Get Started</h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            Host accounts are set up manually by our team. Reach out to us and we&apos;ll get you started with your own challenge hosting account.
          </p>

          <a
            href="mailto:support@birrforex.com?subject=WinnerPip Host Account Request"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-brand text-white font-semibold text-sm hover:opacity-90 transition-all"
          >
            <Mail size={16} />
            support@birrforex.com
          </a>

          <p className="text-gray-600 text-xs mt-4">
            We&apos;ll respond within 24 hours with your account details.
          </p>
        </div>

        {/* Back to login */}
        <div className="text-center mt-6">
          <Link href="/host/login" className="inline-flex items-center gap-1 text-gray-500 text-sm hover:text-gray-300 transition-colors">
            <ArrowLeft size={14} />
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
