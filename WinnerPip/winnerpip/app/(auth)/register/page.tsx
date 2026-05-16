"use client";

import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, ArrowRight } from "lucide-react";

export default function RegisterPage() {
  const botUsername = "birrforex_challenge_bot";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0a0e1a] relative">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1s" }}></div>
      </div>

      <div className="w-full max-w-md relative">
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
              <CardTitle className="text-3xl font-bold gradient-text">Join WinnerPip</CardTitle>
              <CardDescription className="text-gray-400 text-base mt-2">
                Registration is done through our Telegram bot
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-10">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white py-6 text-lg rounded-xl shadow-lg shadow-[#2AABEE]/20 hover:shadow-[#2AABEE]/40 transition-all font-semibold group">
                <MessageCircle className="w-6 h-6 mr-3" />
                Register via Telegram
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </a>

            <p className="text-center text-xs text-gray-500 mt-6 leading-relaxed">
              The bot will guide you through account verification, server selection, and password setup. Once done, come back here and sign in.
            </p>

            <div className="mt-8 text-center text-sm text-gray-400">
              Already registered?{" "}
              <Link href="/login" className="gradient-text font-semibold hover:opacity-80 transition">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
