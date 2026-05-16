"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft,
  User,
  Lock,
  Bell,
  Eye,
  EyeOff,
  Upload
} from "lucide-react";

export default function SettingsPage() {
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [displayMode, setDisplayMode] = useState<"username" | "fullname">("username");
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);

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
          <div className="flex items-center gap-4">
            <Link href="/trader-dashboard">
              <button className="p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <ArrowLeft size={20} />
              </button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-brand rounded-xl blur-xl opacity-50"></div>
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={40} height={40} className="rounded-xl relative" />
              </div>
              <div>
                <span className="text-lg font-bold gradient-text">Settings</span>
                <p className="text-xs text-gray-500">Manage your account</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl relative">
        <div className="space-y-6">
          {/* Profile Section */}
          <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                <User className="text-royal w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white">Profile Settings</h2>
            </div>
            
            <div className="space-y-6">
              {/* Profile Picture */}
              <div>
                <label className="text-sm text-gray-400 mb-3 block font-medium">Profile Picture</label>
                <div className="flex items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-brand flex items-center justify-center text-white text-3xl font-bold shadow-lg">
                    T
                  </div>
                  <div className="flex flex-col gap-3">
                    <Button className="bg-royal hover:bg-royal-600 text-white px-6 py-3 rounded-xl flex items-center gap-2">
                      <Upload size={18} />
                      Upload New Photo
                    </Button>
                    <p className="text-xs text-gray-500">JPG, PNG or GIF. Max size 2MB</p>
                  </div>
                </div>
              </div>
              
              {/* Display Name */}
              <div>
                <label className="text-sm text-gray-400 mb-3 block font-medium">Display Name on Leaderboards</label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <button 
                    onClick={() => setDisplayMode("fullname")}
                    className={`glass border rounded-xl p-4 text-left transition-all ${
                      displayMode === "fullname" 
                        ? 'border-royal bg-royal/10' 
                        : 'border-white/20 hover:border-white/30'
                    }`}
                  >
                    <p className="text-xs text-gray-500 mb-2">Full Name</p>
                    <p className="text-white font-semibold text-lg">John Doe</p>
                  </button>
                  <button 
                    onClick={() => setDisplayMode("username")}
                    className={`glass border rounded-xl p-4 text-left transition-all ${
                      displayMode === "username" 
                        ? 'border-royal bg-royal/10' 
                        : 'border-white/20 hover:border-white/30'
                    }`}
                  >
                    <p className="text-xs text-gray-500 mb-2">Username</p>
                    <p className="text-white font-semibold text-lg">trader_pro</p>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3">Choose how your name appears on public leaderboards</p>
              </div>

              {/* Account Info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 mb-2 block font-medium">Email</label>
                  <Input 
                    type="email" 
                    value="john@example.com" 
                    disabled 
                    className="bg-white/5 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-2 block font-medium">Username</label>
                  <Input 
                    type="text" 
                    value="trader_pro" 
                    className="bg-white/5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                <Lock className="text-royal w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white">Security</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-2 block font-medium">Current Password</label>
                <div className="relative">
                  <Input 
                    type={showCurrentPassword ? "text" : "password"}
                    placeholder="Enter current password"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-all"
                  >
                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block font-medium">New Password</label>
                <div className="relative">
                  <Input 
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new password"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-all"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Must be at least 12 characters with uppercase, lowercase, number, and special character</p>
              </div>

              <Button className="bg-royal hover:bg-royal-600 text-white px-6 py-3 rounded-xl mt-4">
                Update Password
              </Button>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="glass-hover card-glow rounded-2xl p-6 md:p-8 border border-white/20 shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-royal/20 rounded-xl border border-royal/30">
                <Bell className="text-royal w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-white">Notifications</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-lg mb-1">Push Notifications</p>
                  <p className="text-sm text-gray-400">Receive real-time alerts about your trades and rankings</p>
                </div>
                <button 
                  onClick={() => setPushNotifications(!pushNotifications)}
                  className={`w-14 h-7 rounded-full relative transition-all ${
                    pushNotifications ? 'bg-royal' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                    pushNotifications ? 'right-1' : 'left-1'
                  }`}></span>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-lg mb-1">Email Updates</p>
                  <p className="text-sm text-gray-400">Get challenge updates and summaries via email</p>
                </div>
                <button 
                  onClick={() => setEmailUpdates(!emailUpdates)}
                  className={`w-14 h-7 rounded-full relative transition-all ${
                    emailUpdates ? 'bg-royal' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${
                    emailUpdates ? 'right-1' : 'left-1'
                  }`}></span>
                </button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-4">
            <Link href="/trader-dashboard">
              <Button variant="ghost" className="px-6 py-3 rounded-xl hover:bg-white/5">
                Cancel
              </Button>
            </Link>
            <Button className="bg-gradient-brand hover:opacity-90 text-white px-8 py-3 rounded-xl shadow-lg shadow-royal/20">
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
