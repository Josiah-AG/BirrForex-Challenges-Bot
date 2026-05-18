"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Hash, Key, Loader2, MessageCircle, ArrowRight } from "lucide-react";

export default function DemoLoginPage() {
  const router = useRouter();
  const [accountNumber, setAccountNumber] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate a brief loading state then redirect — no API calls
    setTimeout(() => {
      router.push("/PCD/C/dashboard");
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e1a] relative">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }}></div>
      </div>

      <div className="w-full max-w-md space-y-6 relative">
        <Card className="glass-hover card-glow border-white/10 rounded-3xl overflow-hidden">
          <CardHeader className="text-center space-y-6 pt-10">
            <Link href="/PCD/C" className="flex justify-center group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-2xl blur-2xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <Image
                  src="/winnerpip-icon.png"
                  alt="WinnerPip"
                  width={80}
                  height={80}
                  className="rounded-2xl relative shadow-2xl"
                />
              </div>
            </Link>
            <div>
              <CardTitle className="text-3xl font-bold gradient-text">Welcome Back</CardTitle>
              <CardDescription className="text-gray-400 text-base mt-2">
                Sign in with your MT5 account credentials
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Account Number */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Hash className="w-4 h-4 text-royal" />
                  MT5 Account Number
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g., 12345678"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  required
                  className="text-lg"
                />
              </div>

              {/* Investor Password */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                  <Key className="w-4 h-4 text-royal" />
                  Investor Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Your investor (read-only) password"
                    value={investorPassword}
                    onChange={(e) => setInvestorPassword(e.target.value)}
                    required
                    className="pr-10 text-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full bg-gradient-brand hover:opacity-90 text-white py-6 text-lg rounded-xl shadow-lg shadow-royal/20 hover:shadow-royal/40 transition-all font-semibold"
                disabled={loading || !accountNumber || !investorPassword}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            {/* Register section */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-center text-sm text-gray-400 mb-4">Haven&apos;t registered yet?</p>
              <Link
                href="/PCD/C/challenges"
                className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-[#2AABEE]/20 border border-[#2AABEE]/30 hover:bg-[#2AABEE]/30 text-[#2AABEE] font-semibold transition-all text-sm"
              >
                <MessageCircle size={18} />
                Register via Telegram
                <ArrowRight size={14} />
              </Link>
              <p className="text-center text-xs text-gray-500 mt-3">
                The bot will guide you through registration. Once done, come back and sign in.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
