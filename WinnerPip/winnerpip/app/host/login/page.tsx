"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, LogIn } from "lucide-react";

export default function HostLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
      const res = await fetch(`${apiUrl}/api/host/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem("host_token", data.token);
        localStorage.setItem("host_info", JSON.stringify(data.host));
        window.location.href = "/host/dashboard";
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Could not connect to server. Try again.");
    }

    setLoading(false);
  };

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
          <h1 className="text-2xl font-bold text-white">Host Portal</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to manage your challenges</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="glass rounded-2xl border border-white/10 p-8 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-loss/10 border border-loss/30">
              <p className="text-sm text-loss">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50 transition-colors"
              placeholder="host@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50 transition-colors"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Register link */}
        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/host/register" className="text-royal hover:text-royal/80 font-semibold transition-colors">
              Get Started
            </Link>
          </p>
        </div>

        {/* Back to WinnerPip */}
        <div className="text-center mt-4">
          <Link href="/" className="text-gray-600 text-xs hover:text-gray-400 transition-colors">
            &larr; Back to WinnerPip
          </Link>
        </div>
      </div>
    </div>
  );
}
