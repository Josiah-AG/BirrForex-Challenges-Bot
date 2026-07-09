"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff, Hash, Key, Loader2, AlertCircle, MessageCircle, ArrowRight, Users } from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const challengeId = searchParams.get("challenge");

  const [accountNumber, setAccountNumber] = useState("");
  const [investorPassword, setInvestorPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isTeamOnly, setIsTeamOnly] = useState(false);
  const [challengeTitle, setChallengeTitle] = useState("");

  const botUsername = "birrforex_challenge_bot";
  const discordInvite = process.env.NEXT_PUBLIC_DISCORD_INVITE || "https://discord.gg/birrforex";

  // Check if challenge is team-only
  useState(() => {
    if (challengeId) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      fetch(`${apiUrl}/api/challenges`)
        .then(res => res.json())
        .then(data => {
          const challenge = data.challenges?.find((c: any) => c.id === parseInt(challengeId));
          if (challenge?.teamOnly) {
            setIsTeamOnly(true);
            setChallengeTitle(challenge.title);
          }
        })
        .catch(() => {});
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_number: accountNumber.trim(),
          investor_password: investorPassword.trim(),
          challenge_id: challengeId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.error === 'registration_removed') {
          setError(`Your registration was removed. Reason: ${data.reason}. You can register again.`);
        } else if (response.status === 403 && data.error === 'disqualified') {
          setError(`You have been disqualified. Reason: ${data.reason}`);
        } else if (response.status === 401) {
          setError("This account number and password are not registered. Please check your credentials or register first.");
        } else {
          setError(data.error || "Something went wrong. Please try again.");
        }
        setLoading(false);
        return;
      }

      localStorage.setItem("wp_token", data.token);
      localStorage.setItem("wp_user", JSON.stringify(data.user));

      if (challengeId) {
        window.location.href = `/challenge/${challengeId}`;
      } else {
        window.location.href = "/trader-dashboard";
      }
    } catch (err) {
      console.error("Login failed:", err);
      setError("Unable to connect to the server. Please try again later.");
      setLoading(false);
    }
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
            <Link href="/" className="flex justify-center group">
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
              {/* Error message */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-loss/10 border border-loss/30">
                  <AlertCircle className="w-5 h-5 text-loss flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-loss">{error}</p>
                </div>
              )}

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
              {isTeamOnly ? (
                <>
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-royal/10 border border-royal/30 mb-4">
                    <Users className="w-5 h-5 text-royal flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-white font-medium">BirrForex Teams Only Challenge</p>
                      <p className="text-xs text-gray-400 mt-1">This challenge is exclusively for members of BirrForex Live Trading Team. Go to our Discord server and find the challenge channel to register.</p>
                    </div>
                  </div>
                  <a
                    href={discordInvite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/30 hover:bg-[#5865F2]/30 text-[#5865F2] font-semibold transition-all text-sm"
                  >
                    <svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.4 37.4 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 5 59.7 59.7 0 00.4 45a.3.3 0 00.1.2 58.9 58.9 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4c.4-.3.7-.6 1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.6.2.2 0 00-.1.4 47.2 47.2 0 003.6 5.8.2.2 0 00.3.1A58.7 58.7 0 0070.5 45a.3.3 0 00.1-.2c1.6-16.7-2.7-31.2-11.5-44.1zM23.7 36.8c-3.8 0-7-3.5-7-7.8s3.1-7.8 7-7.8c4 0 7.1 3.5 7 7.8.1 4.3-3 7.8-7 7.8zm25.8 0c-3.9 0-7-3.5-7-7.8s3-7.8 7-7.8c3.9 0 7 3.5 7 7.8-.1 4.3-3.1 7.8-7 7.8z"/>
                    </svg>
                    Go to Discord Server to Register →
                    <ArrowRight size={14} />
                  </a>
                  <p className="text-center text-xs text-gray-500 mt-3">
                    Already registered? Sign in above with your account number and investor password.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-center text-sm text-gray-400 mb-4">Haven&apos;t registered yet?</p>
                  <a
                    href={challengeId ? `https://t.me/${botUsername}?start=tc_register_${challengeId}` : `https://t.me/${botUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-[#2AABEE]/20 border border-[#2AABEE]/30 hover:bg-[#2AABEE]/30 text-[#2AABEE] font-semibold transition-all text-sm"
                  >
                    <MessageCircle size={18} />
                    Register via Telegram
                    <ArrowRight size={14} />
                  </a>
                  <p className="text-center text-xs text-gray-500 mt-3">
                    The bot will guide you through registration. Once done, come back and sign in.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center"><div className="text-white">Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
