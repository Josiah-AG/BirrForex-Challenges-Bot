"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { 
  Trophy, 
  Users,
  LogOut,
  Bell,
  Settings as SettingsIcon,
  Activity,
  DollarSign
} from "lucide-react";

export default function AdminDashboard() {
  const [notifications] = useState(5);

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity"></div>
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={44} height={44} className="rounded-xl relative shadow-2xl" />
              </div>
              <div className="hidden sm:block">
                <span className="text-xl font-bold gradient-text">WinnerPip</span>
                <p className="text-xs text-gray-500">Admin Dashboard</p>
              </div>
            </Link>
            
            <div className="flex items-center gap-2">
              <button className="relative p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <Bell size={20} />
                {notifications > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 bg-loss rounded-full animate-glow"></span>
                )}
              </button>
              <Link href="/settings">
                <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                  <SettingsIcon size={20} />
                </button>
              </Link>
              <Button 
                variant="ghost" 
                size="sm" 
                className="hover:bg-white/5 text-gray-400 hover:text-white"
                onClick={() => window.location.href = "/login"}
              >
                <LogOut size={18} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-7xl relative">
        <div className="mb-12">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Admin <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl">Platform overview and management</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-hover card-glow rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 glass rounded-xl">
                <Users className="text-royal w-5 h-5" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Users</p>
            </div>
            <p className="text-5xl font-bold text-white mb-2">1,234</p>
            <p className="text-sm text-profit">+12% this month</p>
          </div>

          <div className="glass-hover card-glow rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 glass rounded-xl">
                <Trophy className="text-gold w-5 h-5" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Active Challenges</p>
            </div>
            <p className="text-5xl font-bold text-white mb-2">8</p>
            <p className="text-sm text-gray-500">2 ending soon</p>
          </div>

          <div className="glass-hover card-glow rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 glass rounded-xl">
                <DollarSign className="text-profit w-5 h-5" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Prize Pool</p>
            </div>
            <p className="text-5xl font-bold gradient-text mb-2">$12K</p>
            <p className="text-sm text-gray-500">Across all challenges</p>
          </div>

          <div className="glass-hover card-glow rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 glass rounded-xl">
                <Activity className="text-royal w-5 h-5" />
              </div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Total Trades</p>
            </div>
            <p className="text-5xl font-bold text-white mb-2">45.2K</p>
            <p className="text-sm text-profit">+8% today</p>
          </div>
        </div>
      </div>
    </div>
  );
}
