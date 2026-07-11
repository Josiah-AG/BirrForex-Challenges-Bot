"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { TrendingUp, Trophy, AlertTriangle, Target, Activity, ArrowLeft, FileText, Clock, ChevronDown, ChevronUp, Shield, Award, X } from "lucide-react";

// ==================== TYPES ====================
interface Trade {
  ticket: number; date: string; openTime: string; closeTime: string;
  symbol: string; type: string; volume: number;
  openPrice: number; closePrice: number; stopLoss: number; takeProfit: number;
  profit: number; commission: number; swap: number;
  duration: string; isQualified: boolean; violations: string[]; slCheckPending?: boolean;
  slCheckResult?: string; slAllowedPrice?: number; slMaxAdverse?: number;
  isPartialClose?: boolean; parentTicket?: number; closesCount?: number;
}
interface LeaderboardEntry {
  rank: number; nickname: string; balance: number; trades: number;
  qualifiedTrades: number; flaggedTrades: number;
  qualifiedProfit: number; grossProfit: number; profitRemoved: number;
  accountType: string; accountSubtype?: string; isCent: boolean;
  isMe?: boolean; isDisqualified?: boolean; disqualifyReason?: string; isBlown?: boolean;
  isQualified?: boolean; isWithdrawn?: boolean;
  recentTrades: { symbol: string; type: string; profit: number; volume: number; date: string; flagged?: boolean; violations?: string[] }[];
}

export default function DemoDashboard() {
  const [showRules, setShowRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"trades" | "leaderboard" | "violations">("trades");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<LeaderboardEntry | null>(null);

  // Lock body scroll when any modal is open
  const anyModalOpen = showRules || !!selectedTrade || showLeaderboardModal || showViolationsModal;
  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [anyModalOpen]);

  // ==================== DEMO DATA ====================
  // This demo uses a Cent account challenge (USC currency).
  // All balances and profits are in cents (¢). The isCent flag drives ¢ vs $ display.
  // Trades cover every possible flag type produced by the evaluation engine.

  const challenge = {
    id: "1", title: "BFX Challenge 1 — Hybrid (Demo & Real)",
    status: "active", daysLeft: 4,
    startingBalance: 1000, targetBalance: 2000, isCent: true,
    realWinnersCount: 3, demoWinnersCount: 2,
  };

  // Current user is a cent real-account participant
  const isCent = challenge.isCent;
  const currency = isCent ? "¢" : "$";

  const myStats = {
    nickname: "TradeNinja", rank: 8, totalParticipants: 312,
    currentBalance: 1503.00,   // actualStartBalance(1000) + grossProfit(503)
    adjustedBalance: 1213.00,  // actualStartBalance(1000) + qualifiedProfit(213)
    qualifiedProfit: 213.00,   // gross minus removed
    grossProfit: 503.00,       // raw sum of all closed trade P&L
    profitRemoved: 290.00,     // profits stripped from flagged trades
    totalTrades: 12,
    qualifiedTrades: 3,
    flaggedTrades: 9,
    activeDays: 4,
    accountType: "real",
    accountSubtype: "standard_cent", // from trading_registrations.account_subtype
    lastUpdated: "08:00 EAT",
    nextUpdate: "12:00 EAT",
  };

  // 12 trades — every flag type represented at least once
  const recentTrades: Trade[] = [
    // ── QUALIFIED ───────────────────────────────────────────────────────────
    {
      ticket: 2847650, date: "Jun 4, 14:22", openTime: "Jun 4, 14:22 EAT", closeTime: "Jun 4, 16:48 EAT",
      symbol: "XAUUSDc", type: "Buy", volume: 0.01,
      openPrice: 4512.500, closePrice: 4521.300, stopLoss: 4505.000, takeProfit: 4530.000,
      profit: 88.00, commission: 0, swap: 0,
      duration: "2h 26m", isQualified: true, violations: [],
    },
    {
      ticket: 2847662, date: "May 30, 10:15", openTime: "May 30, 10:15 EAT", closeTime: "May 30, 12:40 EAT",
      symbol: "EURUSDc", type: "Sell", volume: 0.01,
      openPrice: 1.16500, closePrice: 1.16320, stopLoss: 1.16700, takeProfit: 1.16100,
      profit: 180.00, commission: 0, swap: 0,
      duration: "2h 25m", isQualified: true, violations: [],
    },
    {
      ticket: 2847654, date: "Jun 3, 12:00", openTime: "Jun 3, 12:00 EAT", closeTime: "Jun 3, 13:45 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4502.000, closePrice: 4507.500, stopLoss: 4510.000, takeProfit: 4485.000,
      profit: -55.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: true, violations: [],
    },

    // ── PARTIAL CLOSE (grouped position with 2 closes) ──────────────────────
    {
      ticket: 2847670, date: "Jun 4, 10:30", openTime: "Jun 4, 10:30 EAT", closeTime: "Jun 4, 12:15 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.02,
      openPrice: 4520.000, closePrice: 4515.000, stopLoss: 4525.000, takeProfit: 4500.000,
      profit: 60.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: true, violations: [],
      closesCount: 2, slCheckResult: "passed", slAllowedPrice: 4525.100, slMaxAdverse: 4521.800,
    },
    // First partial close
    {
      ticket: 2847671, date: "  └ Jun 4, 11:20", openTime: "Jun 4, 10:30 EAT", closeTime: "Jun 4, 11:20 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4520.000, closePrice: 4516.500, stopLoss: 4525.000, takeProfit: 4500.000,
      profit: 35.00, commission: 0, swap: 0,
      duration: "50m", isQualified: true, violations: [],
      isPartialClose: true, parentTicket: 2847670, slCheckResult: "passed",
    },
    // Second partial close
    {
      ticket: 2847672, date: "  └ Jun 4, 12:15", openTime: "Jun 4, 10:30 EAT", closeTime: "Jun 4, 12:15 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4520.000, closePrice: 4513.500, stopLoss: 4525.000, takeProfit: 4500.000,
      profit: 25.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: true, violations: [],
      isPartialClose: true, parentTicket: 2847670, slCheckResult: "passed",
    },

    // ── FLAG: No stop loss set on entry ────────────────────────────────────
    {
      ticket: 2847651, date: "Jun 4, 11:05", openTime: "Jun 4, 11:05 EAT", closeTime: "Jun 4, 13:30 EAT",
      symbol: "EURUSDc", type: "Sell", volume: 0.01,
      openPrice: 1.16420, closePrice: 1.16280, stopLoss: 0, takeProfit: 1.16100,
      profit: 140.00, commission: 0, swap: 0,
      duration: "2h 25m", isQualified: false,
      violations: ["No stop loss set on entry"],
    },

    // ── FLAG: SL risk too wide (Layer A) ────────────────────────────────────
    {
      ticket: 2847652, date: "Jun 4, 08:30", openTime: "Jun 4, 08:30 EAT", closeTime: "Jun 4, 10:15 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4508.000, closePrice: 4498.000, stopLoss: 4520.000, takeProfit: 4480.000,
      profit: 100.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: false,
      violations: ["SL risk ¢620.00 exceeds max ¢500"],
    },

    // ── FLAG: Fake SL — candle breach (Layer B, winning trade) ──────────────
    {
      ticket: 2847653, date: "Jun 3, 15:10", openTime: "Jun 3, 15:10 EAT", closeTime: "Jun 3, 17:45 EAT",
      symbol: "XAUUSDc", type: "Buy", volume: 0.01,
      openPrice: 4490.000, closePrice: 4510.000, stopLoss: 0, takeProfit: 4515.000,
      profit: 200.00, commission: 0, swap: 0,
      duration: "2h 35m", isQualified: false,
      violations: ["Max risk breached — price reached 4484.200 (allowed SL: 4484.950, max risk: ¢500). Trade profit ¢200.00 + max risk ¢500.00 = ¢700.00 deducted"],
      slCheckResult: "fake_sl", slAllowedPrice: 4484.950, slMaxAdverse: 4484.200,
    },

    // ── FLAG: Simultaneous trades + same-pair limit (two violations) ─────────
    {
      ticket: 2847655, date: "Jun 3, 09:15", openTime: "Jun 3, 09:15 EAT", closeTime: "Jun 3, 11:30 EAT",
      symbol: "XAUUSDc", type: "Buy", volume: 0.01,
      openPrice: 4495.000, closePrice: 4505.000, stopLoss: 4488.000, takeProfit: 4512.000,
      profit: 100.00, commission: 0, swap: 0,
      duration: "2h 15m", isQualified: false,
      violations: [
        "Exceeded max 3 simultaneous open trades (also open: #2847656 [EURUSDc], #2847657 [XAUUSDc])",
        "Exceeded max 2 simultaneous XAUUSDc trades (also open: #2847657)",
      ],
    },
    {
      ticket: 2847657, date: "Jun 3, 09:20", openTime: "Jun 3, 09:20 EAT", closeTime: "Jun 3, 10:50 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4496.000, closePrice: 4488.000, stopLoss: 4504.000, takeProfit: 4475.000,
      profit: 80.00, commission: 0, swap: 0,
      duration: "1h 30m", isQualified: false,
      violations: [
        "Exceeded max 3 simultaneous open trades (also open: #2847655 [XAUUSDc], #2847656 [EURUSDc])",
        "Exceeded max 2 simultaneous XAUUSDc trades (also open: #2847655)",
      ],
    },

    // ── FLAG: Lot size exceeded ─────────────────────────────────────────────
    {
      ticket: 2847658, date: "Jun 2, 16:30", openTime: "Jun 2, 16:30 EAT", closeTime: "Jun 2, 18:10 EAT",
      symbol: "GBPUSDc", type: "Buy", volume: 0.05,
      openPrice: 1.34280, closePrice: 1.34450, stopLoss: 1.34100, takeProfit: 1.34700,
      profit: 170.00, commission: 0, swap: 0,
      duration: "1h 40m", isQualified: false,
      violations: ["Lot size 0.05 exceeds max 0.02 lots"],
    },

    // ── FLAG: Hold time exceeded ─────────────────────────────────────────────
    {
      ticket: 2847659, date: "Jun 2, 09:00", openTime: "Jun 2, 09:00 EAT", closeTime: "Jun 3, 13:18 EAT",
      symbol: "EURUSDc", type: "Buy", volume: 0.01,
      openPrice: 1.16100, closePrice: 1.16380, stopLoss: 1.15900, takeProfit: 1.16600,
      profit: 280.00, commission: 0, swap: 12.00,
      duration: "28h 18m", isQualified: false,
      violations: ["Held 28.3h exceeds max 24h"],
    },

    // ── FLAG: Weekend trading ────────────────────────────────────────────────
    {
      ticket: 2847660, date: "May 31, 09:30", openTime: "May 31, 09:30 EAT", closeTime: "May 31, 11:45 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4488.000, closePrice: 4478.000, stopLoss: 4495.000, takeProfit: 4465.000,
      profit: 100.00, commission: 0, swap: 0,
      duration: "2h 15m", isQualified: false,
      violations: ["Weekend trading"],
    },

    // ── FLAG: Daily drawdown breach ──────────────────────────────────────────
    {
      ticket: 2847661, date: "May 30, 15:20", openTime: "May 30, 15:20 EAT", closeTime: "May 30, 17:05 EAT",
      symbol: "XAUUSDc", type: "Buy", volume: 0.01,
      openPrice: 4480.000, closePrice: 4492.000, stopLoss: 4474.000, takeProfit: 4500.000,
      profit: 120.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: false,
      violations: ["Profit after daily ¢250.00 drawdown breach"],
    },

    // ── SL CHECK PENDING (candle fetch failed — awaiting verification) ────────
    {
      ticket: 2847663, date: "Jun 4, 09:45", openTime: "Jun 4, 09:45 EAT", closeTime: "Jun 4, 11:30 EAT",
      symbol: "XAUUSDc", type: "Buy", volume: 0.01,
      openPrice: 4502.000, closePrice: 4518.000, stopLoss: 4497.000, takeProfit: 4525.000,
      profit: 160.00, commission: 0, swap: 0,
      duration: "1h 45m", isQualified: true, violations: [], slCheckPending: true,
    },
    {
      ticket: 2847664, date: "Jun 3, 13:00", openTime: "Jun 3, 13:00 EAT", closeTime: "Jun 3, 14:55 EAT",
      symbol: "EURUSDc", type: "Sell", volume: 0.01,
      openPrice: 1.17250, closePrice: 1.17080, stopLoss: 1.17400, takeProfit: 1.16900,
      profit: 170.00, commission: 0, swap: 0,
      duration: "1h 55m", isQualified: true, violations: [], slCheckPending: true,
    },
    {
      ticket: 2847665, date: "Jun 2, 15:30", openTime: "Jun 2, 15:30 EAT", closeTime: "Jun 2, 17:10 EAT",
      symbol: "XAUUSDc", type: "Sell", volume: 0.01,
      openPrice: 4478.000, closePrice: 4465.000, stopLoss: 4483.000, takeProfit: 4455.000,
      profit: 130.00, commission: 0, swap: 0,
      duration: "1h 40m", isQualified: true, violations: [], slCheckPending: true,
    },
  ];

  // Leaderboard — 20 entries shown of 312 total (real category)
  // Mix of: real cent accounts (¢) and real standard accounts ($)
  // Note: Demo accounts don't exist as cent on Exness — demo category uses $ only
  // Ranking uses normalized_balance (cent ÷ 100) internally so cent/standard compare fairly
  const leaderboardTotal = 312;
  const leaderboard: LeaderboardEntry[] = [
    // recentTrades for each user must have a mix of wins AND losses so that:
    //   Win Rate = wins / total  (not 100%)
    //   Avg RR   = avgWin / avgLoss  (not "—")
    {
      rank: 1, nickname: "GoldPipKing", balance: 2250.00, trades: 18, qualifiedTrades: 16, flaggedTrades: 2,
      qualifiedProfit: 1250.00, grossProfit: 1400.00, profitRemoved: 150.00,
      accountType: "real", accountSubtype: "standard_cent", isCent: true, isQualified: true,
      // 3W 1L → 75% win rate, avgWin≈85, avgLoss≈42, RR≈2.02
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  95.00, date: "Jun 4, 14:22 → 16:48", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  72.00, date: "Jun 4, 09:10 → 11:30", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -42.00, date: "Jun 3, 17:00 → 18:30", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  88.00, date: "Jun 3, 15:00 → 17:20", violations: [] },
      ],
    },
    {
      rank: 2, nickname: "MK_Kaizen", balance: 2180.00, trades: 22, qualifiedTrades: 19, flaggedTrades: 3,
      qualifiedProfit: 1180.00, grossProfit: 1320.00, profitRemoved: 140.00,
      accountType: "real", isCent: true, isQualified: true,
      // 2W 1L → 67% win rate, avgWin≈110, avgLoss≈48, RR≈2.29
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: 110.00, date: "Jun 4, 11:05 → 13:30", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit: -48.00, date: "Jun 4, 07:00 → 08:40", violations: [] },
        { symbol: "GBPUSDc", type: "Sell", volume: 0.05, profit: 140.00, date: "Jun 3, 16:30 → 18:10", flagged: true, violations: ["Lot size 0.05 exceeds max 0.02 lots"] },
      ],
    },
    {
      rank: 3, nickname: "Bella_FX", balance: 2090.00, trades: 14, qualifiedTrades: 12, flaggedTrades: 2,
      qualifiedProfit: 1090.00, grossProfit: 1200.00, profitRemoved: 110.00,
      accountType: "real", isCent: true, isQualified: true,
      // 2W 1L → 67% win rate, avgWin≈81.5, avgLoss≈38, RR≈2.14
      recentTrades: [
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  88.00, date: "Jun 4, 08:30 → 10:15", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit: -38.00, date: "Jun 3, 15:20 → 16:50", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  75.00, date: "Jun 3, 12:00 → 13:45", violations: [] },
      ],
    },
    {
      rank: 4, nickname: "SoberBoy", balance: 1890.00, trades: 20, qualifiedTrades: 15, flaggedTrades: 5,
      qualifiedProfit: 890.00, grossProfit: 1140.00, profitRemoved: 250.00,
      accountType: "real", isCent: true,
      // 2W 1L → 67% win rate, avgWin≈145, avgLoss≈55, RR≈2.64
      recentTrades: [
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  90.00, date: "Jun 4, 09:15 → 11:30", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -55.00, date: "Jun 3, 18:00 → 19:20", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: 200.00, date: "Jun 3, 15:10 → 17:45", flagged: true, violations: ["SL violated. Price exceeded the maximum allowed risk (¢500, SL should be @ 4484.95000) on the M15 candle formed at 15:45 EAT. Trade should have been closed at that point"] },
      ],
    },
    {
      rank: 5, nickname: "FireMan", balance: 1780.00, trades: 16, qualifiedTrades: 14, flaggedTrades: 2,
      qualifiedProfit: 780.00, grossProfit: 890.00, profitRemoved: 110.00,
      accountType: "real", isCent: true,
      // 2W 1L → 67% win rate, avgWin≈73.5, avgLoss≈35, RR≈2.10
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  82.00, date: "Jun 3, 09:00 → 11:20", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit: -35.00, date: "Jun 3, 07:15 → 08:40", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  65.00, date: "Jun 2, 14:30 → 16:00", violations: [] },
      ],
    },
    {
      rank: 6, nickname: "CR7_Kete", balance: 1620.00, trades: 12, qualifiedTrades: 11, flaggedTrades: 1,
      qualifiedProfit: 620.00, grossProfit: 680.00, profitRemoved: 60.00,
      accountType: "real", isCent: true,
      // 2W 1L → 67% win rate, avgWin≈77, avgLoss≈40, RR≈1.93
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  85.00, date: "Jun 4, 10:00 → 11:45", violations: [] },
        { symbol: "GBPUSDc", type: "Sell", volume: 0.01, profit: -40.00, date: "Jun 3, 13:00 → 14:30", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  69.00, date: "Jun 3, 08:20 → 09:55", violations: [] },
      ],
    },
    {
      rank: 7, nickname: "AlphaFX", balance: 1490.00, trades: 24, qualifiedTrades: 18, flaggedTrades: 6,
      qualifiedProfit: 490.00, grossProfit: 760.00, profitRemoved: 270.00,
      accountType: "real", isCent: true,
      // 2W 2L → 50% win rate, avgWin≈78, avgLoss≈62, RR≈1.26
      recentTrades: [
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  92.00, date: "Jun 4, 11:30 → 13:00", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit: -68.00, date: "Jun 4, 08:00 → 09:30", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -56.00, date: "Jun 3, 16:00 → 17:45", violations: [] },
        { symbol: "GBPUSDc", type: "Sell", volume: 0.01, profit:  64.00, date: "Jun 3, 10:00 → 12:15", violations: [] },
      ],
    },
    // ── YOU ─────────────────────────────────────────────────────────────────
    {
      rank: 8, nickname: "TradeNinja", balance: myStats.currentBalance, trades: myStats.totalTrades,
      qualifiedTrades: myStats.qualifiedTrades, flaggedTrades: myStats.flaggedTrades,
      qualifiedProfit: myStats.qualifiedProfit, grossProfit: myStats.grossProfit, profitRemoved: myStats.profitRemoved,
      accountType: "real", isCent: true, isMe: true,
      // 2W 1L → 67% win rate (88+140 wins, 55 loss), avgWin≈114, avgLoss≈55, RR≈2.07
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  88.00, date: "Jun 4, 14:22 → 16:48", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit: 140.00, date: "Jun 4, 11:05 → 13:30", flagged: true, violations: ["No stop loss set on entry"] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -55.00, date: "Jun 3, 12:00 → 13:45", violations: [] },
      ],
    },
    // ────────────────────────────────────────────────────────────────────────
    {
      rank: 9, nickname: "NightOwl", balance: 1180.00, trades: 30, qualifiedTrades: 22, flaggedTrades: 8,
      qualifiedProfit: 180.00, grossProfit: 540.00, profitRemoved: 360.00,
      accountType: "real", isCent: true,
      // 2W 2L → 50% win rate, avgWin≈65, avgLoss≈58, RR≈1.12
      recentTrades: [
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  72.00, date: "Jun 4, 12:00 → 13:30", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit: -62.00, date: "Jun 4, 09:00 → 10:40", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  58.00, date: "Jun 3, 14:00 → 15:30", violations: [] },
        { symbol: "GBPUSDc", type: "Sell", volume: 0.01, profit: -54.00, date: "Jun 3, 10:00 → 11:20", violations: [] },
      ],
    },
    // ── Real STANDARD account ($) — ranks alongside cent users ──────────────
    {
      rank: 10, nickname: "SwingKing", balance: 11.20, trades: 15, qualifiedTrades: 13, flaggedTrades: 2,
      qualifiedProfit: 1.20, grossProfit: 2.80, profitRemoved: 1.60,
      accountType: "real", accountSubtype: "standard", isCent: false,
      // 2W 1L → 67% win rate, avgWin≈1.4, avgLoss≈0.72, RR≈1.94
      recentTrades: [
        { symbol: "EURUSDm", type: "Buy",  volume: 0.01, profit:  1.40, date: "Jun 4, 10:00 → 12:15", violations: [] },
        { symbol: "GBPUSDm", type: "Sell", volume: 0.01, profit: -0.72, date: "Jun 4, 07:30 → 08:50", violations: [] },
        { symbol: "XAUUSDm", type: "Sell", volume: 0.01, profit:  2.20, date: "Jun 3, 14:00 → 16:30", flagged: true, violations: ["No stop loss set on entry"] },
      ],
    },
    {
      rank: 11, nickname: "TrendRider", balance: 10.80, trades: 11, qualifiedTrades: 10, flaggedTrades: 1,
      qualifiedProfit: 0.80, grossProfit: 1.50, profitRemoved: 0.70,
      accountType: "real", accountSubtype: "standard", isCent: false,
      // 2W 1L → 67% win rate, avgWin≈0.85, avgLoss≈0.55, RR≈1.55
      recentTrades: [
        { symbol: "GBPUSDm", type: "Sell", volume: 0.01, profit:  0.80, date: "Jun 4, 08:00 → 09:30", violations: [] },
        { symbol: "EURUSDm", type: "Buy",  volume: 0.01, profit: -0.55, date: "Jun 3, 15:00 → 16:20", violations: [] },
        { symbol: "XAUUSDm", type: "Buy",  volume: 0.01, profit:  0.90, date: "Jun 3, 10:00 → 11:30", violations: [] },
      ],
    },
    {
      rank: 12, nickname: "PipSniper", balance: 1050.00, trades: 11, qualifiedTrades: 9, flaggedTrades: 2,
      qualifiedProfit: 50.00, grossProfit: 150.00, profitRemoved: 100.00,
      accountType: "real", isCent: true,
      // 2W 1L → 67% win rate, avgWin≈65, avgLoss≈48, RR≈1.35
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit:  72.00, date: "Jun 4, 09:30 → 11:00", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit: -48.00, date: "Jun 3, 14:00 → 15:30", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  58.00, date: "Jun 3, 08:00 → 09:40", violations: [] },
      ],
    },
    {
      rank: 13, nickname: "FXWarrior", balance: 980.00, trades: 18, qualifiedTrades: 14, flaggedTrades: 4,
      qualifiedProfit: -20.00, grossProfit: 200.00, profitRemoved: 220.00,
      accountType: "real", isCent: true,
      // 1W 2L → 33% win rate, avgWin≈55, avgLoss≈65, RR≈0.85
      recentTrades: [
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -72.00, date: "Jun 4, 10:00 → 11:30", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit:  55.00, date: "Jun 4, 07:00 → 08:30", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -58.00, date: "Jun 3, 15:00 → 16:30", violations: [] },
      ],
    },
    // ── Another standard account ─────────────────────────────────────────────
    {
      rank: 14, nickname: "MarketPro", balance: 9.20, trades: 8, qualifiedTrades: 7, flaggedTrades: 1,
      qualifiedProfit: -0.80, grossProfit: 0.50, profitRemoved: 1.30,
      accountType: "real", accountSubtype: "standard", isCent: false,
      // 1W 2L → 33% win rate, avgWin≈0.90, avgLoss≈0.70, RR≈1.29
      recentTrades: [
        { symbol: "EURUSDm", type: "Sell", volume: 0.01, profit: -0.80, date: "Jun 4, 09:00 → 10:15", violations: [] },
        { symbol: "GBPUSDm", type: "Buy",  volume: 0.01, profit:  0.90, date: "Jun 3, 13:00 → 14:20", violations: [] },
        { symbol: "XAUUSDm", type: "Sell", volume: 0.01, profit: -0.60, date: "Jun 3, 08:00 → 09:30", violations: [] },
      ],
    },
    {
      rank: 15, nickname: "ChartWiz", balance: 920.00, trades: 9, qualifiedTrades: 8, flaggedTrades: 1,
      qualifiedProfit: -80.00, grossProfit: 0.00, profitRemoved: 80.00,
      accountType: "real", isCent: true,
      // 1W 2L → 33% win rate, avgWin≈60, avgLoss≈70, RR≈0.86
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -75.00, date: "Jun 4, 11:00 → 12:30", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  60.00, date: "Jun 3, 14:00 → 15:20", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -65.00, date: "Jun 3, 09:00 → 10:30", violations: [] },
      ],
    },
    {
      rank: 16, nickname: "PipHunter", balance: 845.00, trades: 14, qualifiedTrades: 10, flaggedTrades: 4,
      qualifiedProfit: -155.00, grossProfit: 50.00, profitRemoved: 205.00,
      accountType: "real", isCent: true,
      // 1W 2L → 33% win rate, avgWin≈70, avgLoss≈80, RR≈0.88
      recentTrades: [
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -88.00, date: "Jun 4, 09:00 → 10:30", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit:  70.00, date: "Jun 3, 13:00 → 14:30", violations: [] },
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -72.00, date: "Jun 3, 08:00 → 09:20", violations: [] },
      ],
    },
    {
      rank: 17, nickname: "ForexEagle", balance: 820.00, trades: 7, qualifiedTrades: 6, flaggedTrades: 1,
      qualifiedProfit: -180.00, grossProfit: -80.00, profitRemoved: 100.00,
      accountType: "real", isCent: true,
      // 1W 2L → 33% win rate, avgWin≈52, avgLoss≈78, RR≈0.67
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -85.00, date: "Jun 4, 10:00 → 11:20", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  52.00, date: "Jun 3, 14:00 → 15:30", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit: -71.00, date: "Jun 3, 09:00 → 10:10", violations: [] },
      ],
    },
    // ── Blown account ────────────────────────────────────────────────────────
    {
      rank: 18, nickname: "ScalpGod", balance: 0, trades: 28, qualifiedTrades: 18, flaggedTrades: 10,
      qualifiedProfit: -1000.00, grossProfit: -1000.00, profitRemoved: 0,
      accountType: "real", isCent: true, isBlown: true,
      // 1W 2L → 33% win rate, avgWin≈95, avgLoss≈385, RR≈0.25
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.02, profit: -320.00, date: "Jun 3, 07:30 → 09:00", violations: [] },
        { symbol: "XAUUSDc", type: "Sell", volume: 0.01, profit:  95.00,  date: "Jun 2, 14:00 → 15:30", violations: [] },
        { symbol: "EURUSDc", type: "Buy",  volume: 0.01, profit: -450.00, date: "Jun 2, 09:00 → 11:00", violations: [] },
      ],
    },
    // ── Disqualified ─────────────────────────────────────────────────────────
    {
      rank: 19, nickname: "Heron_FX", balance: 1950.00, trades: 9, qualifiedTrades: 9, flaggedTrades: 0,
      qualifiedProfit: 950.00, grossProfit: 950.00, profitRemoved: 0,
      accountType: "real", isCent: true, isDisqualified: true,
      disqualifyReason: "Account recharged — deposit of ¢500.00 detected after challenge start (2026-06-02)",
      recentTrades: [], // DQ — stats hidden, no trades shown
    },
    // ── Blown standard account ───────────────────────────────────────────────
    {
      rank: 20, nickname: "ZeroRisk", balance: 0, trades: 12, qualifiedTrades: 8, flaggedTrades: 4,
      qualifiedProfit: -10.00, grossProfit: -10.00, profitRemoved: 0,
      accountType: "real", accountSubtype: "standard", isCent: false, isBlown: true,
      // 1W 2L → 33% win rate, avgWin≈0.80, avgLoss≈0.90, RR≈0.89
      recentTrades: [
        { symbol: "EURUSDm", type: "Sell", volume: 0.01, profit: -0.95, date: "Jun 4, 10:00 → 11:20", violations: [] },
        { symbol: "GBPUSDm", type: "Buy",  volume: 0.01, profit:  0.80, date: "Jun 3, 14:00 → 15:30", violations: [] },
        { symbol: "XAUUSDm", type: "Sell", volume: 0.01, profit: -0.85, date: "Jun 3, 09:00 → 10:10", violations: [] },
      ],
    },
    // ── Withdrawn / Exited ────────────────────────────────────────────────────
    {
      rank: 21, nickname: "EarlyExit", balance: 850.00, trades: 5, qualifiedTrades: 4, flaggedTrades: 1,
      qualifiedProfit: -150.00, grossProfit: -100.00, profitRemoved: 50.00,
      accountType: "real", isCent: true, isWithdrawn: true,
      recentTrades: [
        { symbol: "XAUUSDc", type: "Buy",  volume: 0.01, profit: -65.00, date: "Jun 3, 10:00 → 11:20", violations: [] },
        { symbol: "EURUSDc", type: "Sell", volume: 0.01, profit:  45.00, date: "Jun 2, 14:00 → 15:30", violations: [] },
      ],
    },
  ];

  // ── Helpers (identical to production) ──────────────────────────────────
  const formatBalance = (amount: number, isCentAcct?: boolean) => {
    if (isCentAcct) return `${amount.toFixed(2)}¢`;
    return `$${amount.toFixed(2)}`;
  };

  const formatSubtype = (subtype: string | null | undefined, accountType: string): string => {
    const map: Record<string, string> = {
      standard:      'Standard',
      standard_cent: 'Standard Cent',
      pro:           'Pro',
      raw_spread:    'Raw Spread',
      zero:          'Zero',
    };
    if (subtype && map[subtype]) return map[subtype];
    return accountType.charAt(0).toUpperCase() + accountType.slice(1);
  };

  // Win Rate & Avg RR — computed from trades (same as production)
  const winningTrades = recentTrades.filter(t => t.profit > 0);
  const losingTrades  = recentTrades.filter(t => t.profit < 0);
  const winRate = recentTrades.length > 0 ? Math.round((winningTrades.length / recentTrades.length) * 100) : 0;
  const avgWin  = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.profit, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length  > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.profit, 0) / losingTrades.length) : 0;
  const avgRR   = avgLoss > 0 ? avgWin / avgLoss : 0;

  const violations = recentTrades.filter(t => !t.isQualified);
  const isBlownAccount = myStats.totalTrades > 0 && myStats.currentBalance <= 0;
  const showProgressBar = myStats.totalTrades > 0 && !isBlownAccount;
  const progressPercent = ((myStats.adjustedBalance - challenge.startingBalance) / (challenge.targetBalance - challenge.startingBalance)) * 100;

  return (
    <div className="min-h-screen bg-[#0a0e1a]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-royal/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-profit/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }}></div>
      </div>

      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-white/5">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/PCD/C/challenges"><button className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"><ArrowLeft size={20} /></button></Link>
              <div className="flex items-center gap-2">
                <Image src="/winnerpip-icon.png" alt="WinnerPip" width={32} height={32} className="rounded-lg" />
                <div className="hidden sm:block">
                  <p className="text-sm font-bold text-white leading-tight">{challenge.title}</p>
                  <p className="text-xs text-gray-500">{myStats.nickname} • #161585721 • {formatSubtype(myStats.accountSubtype, myStats.accountType)}</p>
                </div>
              </div>
            </div>
            <button onClick={() => setShowRules(true)} className="flex items-center gap-2 px-3 py-2 glass border border-royal/30 text-royal hover:bg-royal/10 rounded-xl transition-all text-sm"><FileText size={14} /><span className="hidden sm:inline">Rules</span></button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-6xl relative">

        {/* TOP STATS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          <button onClick={() => setShowLeaderboardModal(true)} className="glass rounded-2xl p-4 md:p-5 border border-white/10 text-left hover:border-gold/30 transition-all">
            <div className="flex items-center gap-2 mb-2"><Trophy size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Rank</p></div>
            <p className="text-3xl md:text-4xl font-bold gradient-text">#{myStats.rank}</p>
            <p className="text-xs text-gray-500 mt-1">of {myStats.totalParticipants}</p>
          </button>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-profit" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Profit</p></div>
            <p className={`text-3xl md:text-4xl font-bold ${myStats.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(myStats.qualifiedProfit, isCent)}</p>
            <p className="text-xs text-gray-500 mt-1">Total P&L: {formatBalance(myStats.grossProfit, isCent)}</p>
          </div>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><Target size={16} className="text-royal" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Balance</p></div>
            <p className="text-3xl md:text-4xl font-bold text-white">{formatBalance(myStats.adjustedBalance, isCent)}</p>
            <p className="text-xs text-gray-500 mt-1">Gross: {formatBalance(myStats.currentBalance, isCent)}</p>
          </div>
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-2"><Clock size={16} className="text-gold" /><p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Time Left</p></div>
            <p className="text-3xl md:text-4xl font-bold text-gold">{challenge.daysLeft}</p>
            <p className="text-xs text-gray-500 mt-1">days remaining</p>
          </div>
        </div>

        {/* PROGRESS BAR — only when user has trades and is not blown */}
        {showProgressBar ? (
          <div className="glass rounded-2xl p-4 md:p-5 border border-white/10 mb-6">
            <div className="flex items-center justify-between mb-3"><p className="text-sm font-medium text-gray-300">Progress to Target</p><p className={`text-sm font-bold ${progressPercent >= 0 ? "text-white" : "text-loss"}`}>{progressPercent.toFixed(0)}%</p></div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${progressPercent >= 0 ? "bg-gradient-to-r from-royal to-profit" : "bg-loss"}`} style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }} /></div>
            <div className="flex justify-between mt-2 text-xs text-gray-500"><span>{formatBalance(challenge.startingBalance, isCent)}</span><span>{formatBalance(challenge.targetBalance, isCent)}</span></div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4 border border-white/10 mb-6 text-center">
            <p className="text-xs text-gray-500">Deposit and start trading to track progress</p>
          </div>
        )}

        {/* MINI STATS */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-6">
          <MiniStat label="Trades" value={myStats.totalTrades.toString()} icon={<Activity size={14} />} />
          <MiniStat label="Qualified" value={myStats.qualifiedTrades.toString()} icon={<Award size={14} />} color="text-profit" />
          <MiniStat label="Removed" value={`${currency}${myStats.profitRemoved.toFixed(2)}`} icon={<Target size={14} />} color="text-royal" />
          <button onClick={() => setShowViolationsModal(true)} className="glass rounded-xl p-3 border border-white/10 text-center hover:border-loss/30 transition-all">
            <div className="flex items-center justify-center gap-1 mb-1 text-loss"><AlertTriangle size={14} /><p className="text-[9px] uppercase tracking-wider font-medium">Flagged</p></div>
            <p className="text-lg font-bold text-loss">{myStats.flaggedTrades}</p>
          </button>
          <MiniStat label="Win Rate" value={`${winRate}%`} icon={<ChevronUp size={14} />} color={winRate >= 50 ? "text-profit" : "text-loss"} />
          <MiniStat label="Avg RR" value={avgRR > 0 ? avgRR.toFixed(2) : "—"} icon={<ChevronDown size={14} />} color="text-royal" />
        </div>

        {/* TAB NAVIGATION */}
        <div className="flex gap-1 p-1 glass rounded-xl border border-white/10 mb-6">
          <TabBtn active={activeTab === "trades"} onClick={() => setActiveTab("trades")} label="Trades" count={myStats.totalTrades} />
          <TabBtn active={activeTab === "leaderboard"} onClick={() => setActiveTab("leaderboard")} label="Leaderboard" />
          <TabBtn active={activeTab === "violations"} onClick={() => setActiveTab("violations")} label="Flagged" count={myStats.flaggedTrades} />
        </div>

        {/* TRADES TAB */}
        {activeTab === "trades" && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Recent Trades</p>
            <p className="text-xs text-gray-500">Tap a trade for details</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px]">
              <thead><tr className="border-b border-white/5">
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Date</th>
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Symbol</th>
                <th className="text-left py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Type</th>
                <th className="text-right py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Profit</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Volume</th>
                <th className="text-center py-3 px-4 text-[10px] text-gray-400 font-medium uppercase">Status</th>
              </tr></thead>
              <tbody>{recentTrades.map((t) => (
                <tr key={t.ticket} onClick={() => setSelectedTrade(t)} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${t.slCheckPending ? "bg-gold/5" : !t.isQualified ? "bg-loss/5" : ""} ${t.isPartialClose ? "opacity-75" : ""}`}>
                  <td className="py-3 px-4 text-xs text-gray-400">{t.date}</td>
                  <td className="py-3 px-4 text-sm text-white font-semibold">{t.isPartialClose ? '' : t.symbol}{t.closesCount ? <span className="text-[10px] text-gray-500 ml-1">({t.closesCount} closes)</span> : ''}</td>
                  <td className="py-3 px-4"><span className={`px-2 py-1 rounded-md text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span></td>
                  <td className={`py-3 px-4 text-right text-sm font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{t.profit >= 0 ? "+" : ""}{formatBalance(t.profit, isCent)}</td>
                  <td className="py-3 px-4 text-center text-xs text-gray-400">{t.volume} lot</td>
                  <td className="py-3 px-4 text-center">
                    {t.slCheckPending
                      ? <span title="Max risk check pending" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/20 border border-gold/40 text-gold text-[10px] font-bold cursor-help">⏳</span>
                      : t.isQualified
                        ? <span className="text-profit">✓</span>
                        : <span className="text-loss">🚩</span>
                    }
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="p-3 border-t border-white/5 text-center"><p className="text-xs text-gray-600">Last updated: 2h ago • Next update: 12:00 EAT</p></div>
        </div>
        )}

        {/* LEADERBOARD TAB */}
        {activeTab === "leaderboard" && (
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2"><Trophy size={16} className="text-gold" /><p className="text-sm font-semibold text-white">Leaderboard</p></div>
            <p className="text-xs text-gray-500">Next update: 12:00 EAT</p>
          </div>
          <div className="divide-y divide-white/5">
            {leaderboard.map((entry) => (
              <LeaderboardRow key={entry.rank} entry={entry} formatBalance={formatBalance} formatSubtype={formatSubtype} onClick={() => { setShowLeaderboardModal(true); setSelectedUser(entry); }} realWinnersCount={challenge.realWinnersCount} demoWinnersCount={challenge.demoWinnersCount} />
            ))}
          </div>
          <div className="p-3 border-t border-white/5 text-center">
            <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold hover:bg-white/10 hover:text-white transition-all">
              Load More ({leaderboard.length} of {leaderboardTotal})
            </button>
          </div>
        </div>
        )}

        {/* VIOLATIONS TAB */}
        {activeTab === "violations" && (
        <div className="space-y-3">
          {violations.length === 0 ? (
            <div className="glass rounded-2xl border border-white/10 p-8 text-center">
              <Shield className="w-12 h-12 text-profit mx-auto mb-3" />
              <p className="text-white font-semibold">No violations!</p>
              <p className="text-sm text-gray-400 mt-1">All your trades follow the rules</p>
            </div>
          ) : (<>
            <div className="glass rounded-xl border border-loss/20 p-4"><p className="text-xs text-gray-300"><span className="text-loss font-semibold">{violations.length} flagged trades</span> — Profits removed. Losses still count.</p></div>
            {violations.map((t) => (
              <div key={t.ticket} onClick={() => setSelectedTrade(t)} className="glass rounded-2xl border border-loss/20 p-4 bg-loss/5 cursor-pointer hover:border-loss/40 transition-all">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-loss/20 rounded-lg flex-shrink-0"><AlertTriangle size={14} className="text-loss" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-white font-semibold">{t.symbol}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                      <span className="text-xs text-gray-500">{t.date}</span>
                    </div>
                    {t.violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>}
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>Lots: {t.volume}</span>
                      <span>Profit removed: <span className="text-loss font-semibold">{formatBalance(t.profit > 0 ? t.profit : 0, isCent)}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>)}
        </div>
        )}
      </div>

      {/* ==================== TRADE DETAIL MODAL ==================== */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setSelectedTrade(null)}>
          <div className="glass rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto border border-white/10" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${selectedTrade.type === "Buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>{selectedTrade.type}</span>
                <span className="text-lg font-bold text-white">{selectedTrade.symbol}</span>
              </div>
              <button onClick={() => setSelectedTrade(null)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DRow label="Ticket" value={`#${selectedTrade.ticket}`} />
                <DRow label="Volume" value={`${selectedTrade.volume} lots`} />
                <DRow label="Opened" value={selectedTrade.openTime} />
                <DRow label="Closed" value={selectedTrade.closeTime} />
                <DRow label="Entry" value={selectedTrade.openPrice.toFixed(5)} />
                <DRow label="Exit" value={selectedTrade.closePrice.toFixed(5)} />
                <DRow label="Stop Loss" value={selectedTrade.stopLoss ? selectedTrade.stopLoss.toFixed(5) : "None"} color={selectedTrade.stopLoss ? "text-loss" : "text-gray-500"} />
                <DRow label="Take Profit" value={selectedTrade.takeProfit ? selectedTrade.takeProfit.toFixed(5) : "None"} color="text-profit" />
                <DRow label="Commission" value={`${currency}${selectedTrade.commission.toFixed(2)}`} />
                <DRow label="Swap" value={`${currency}${selectedTrade.swap.toFixed(2)}`} />
                <DRow label="Duration" value={selectedTrade.duration} />
                <DRow label="Net P&L" value={`${selectedTrade.profit >= 0 ? "+" : ""}${formatBalance(selectedTrade.profit, isCent)}`} color={selectedTrade.profit >= 0 ? "text-profit" : "text-loss"} />
              </div>
              <div className={`p-4 rounded-xl border ${selectedTrade.slCheckPending ? "bg-gold/10 border-gold/30" : selectedTrade.isQualified ? "bg-profit/10 border-profit/20" : "bg-loss/10 border-loss/20"}`}>
                {selectedTrade.slCheckPending ? (
                  <div>
                    <p className="text-sm text-gold font-semibold flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gold/30 border border-gold/50 text-[10px] font-bold">?</span>
                      SL Check Pending
                    </p>
                    <p className="text-xs text-gray-300">
                      The stop loss candle check for this trade could not be completed due to a data fetch issue.
                      This trade may be disqualified if it is found against the rules in the next check.
                      Benefit of doubt is applied until then — this trade is currently treated as qualified.
                    </p>
                  </div>
                ) : selectedTrade.isQualified ? (
                  <p className="text-sm text-profit font-semibold flex items-center gap-2"><Shield size={16} />Qualified — counts toward your balance</p>
                ) : (
                  <div>
                    <p className="text-sm text-loss font-semibold flex items-center gap-2 mb-2"><AlertTriangle size={16} />Flagged — profit removed</p>
                    {selectedTrade.violations.length > 0 && <p className="text-sm text-white">{selectedTrade.violations.join(", ")}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== LEADERBOARD MODAL ==================== */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => { setShowLeaderboardModal(false); setSelectedUser(null); }}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-gold/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><Trophy size={20} className="text-gold" /><h3 className="text-lg font-bold text-white">Leaderboard</h3></div>
              <button onClick={() => { setShowLeaderboardModal(false); setSelectedUser(null); }} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            {!selectedUser ? (
              <div className="divide-y divide-white/5">
                {leaderboard.map((entry) => (
                  <LeaderboardRow key={entry.rank} entry={entry} formatBalance={formatBalance} formatSubtype={formatSubtype} onClick={() => setSelectedUser(entry)} realWinnersCount={challenge.realWinnersCount} demoWinnersCount={challenge.demoWinnersCount} />
                ))}
                <div className="p-3 border-t border-white/5 text-center">
                  <button className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-semibold">
                    Load More ({leaderboard.length} of {leaderboardTotal})
                  </button>
                </div>
              </div>
            ) : (
              // ── User detail — matches production exactly ──────────────────
              <div className="p-5">
                <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back to leaderboard</button>
                <div className="flex items-center gap-4 mb-6">
                  {(() => { const wc = selectedUser.accountType === 'demo' ? challenge.demoWinnersCount : challenge.realWinnersCount; const win = !selectedUser.isDisqualified && selectedUser.isQualified && wc > 0 && selectedUser.rank <= wc; return <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${selectedUser.isDisqualified ? "bg-loss/20 text-loss" : win ? "bg-profit/20 text-profit" : "bg-white/10 text-gray-400"}`}>{win ? "🏆" : `#${selectedUser.rank}`}</div>; })()}
                  <div>
                    <p className="text-xl font-bold text-white">{selectedUser.nickname}</p>
                    <p className="text-sm text-gray-400">
                      {selectedUser.isDisqualified
                        ? <span className="text-loss font-semibold">Disqualified</span>
                        : <>Balance: <span className="text-white font-semibold">{formatBalance(selectedUser.balance, selectedUser.isCent)}</span></>
                      }
                    </p>
                  </div>
                </div>

                {/* DQ reason — only shown when DQ'd */}
                {selectedUser.isDisqualified && selectedUser.disqualifyReason && (
                  <div className="p-4 rounded-xl bg-loss/10 border border-loss/20 mb-4">
                    <p className="text-xs text-gray-400 mb-1">Disqualification Reason:</p>
                    <p className="text-sm text-white">{selectedUser.disqualifyReason}</p>
                  </div>
                )}

                {/* Stats — hidden for DQ users (matches production) */}
                {!selectedUser.isDisqualified && (<>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Trades</p><p className="text-lg font-bold text-white">{selectedUser.trades}</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Qualified</p><p className="text-lg font-bold text-white">{selectedUser.qualifiedTrades}</p></div>
                    <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Flagged</p><p className="text-lg font-bold text-loss">{selectedUser.flaggedTrades}</p></div>
                  </div>

                  {/* Win Rate + Avg RR — computed from trades (matches production) */}
                  {selectedUser.recentTrades.length > 0 && (() => {
                    const wins   = selectedUser.recentTrades.filter(t => t.profit > 0);
                    const losses = selectedUser.recentTrades.filter(t => t.profit < 0);
                    const wr  = Math.round((wins.length / selectedUser.recentTrades.length) * 100);
                    const aw  = wins.length   > 0 ? wins.reduce((s, t) => s + t.profit, 0)   / wins.length   : 0;
                    const al  = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.profit, 0) / losses.length) : 0;
                    const rr  = al > 0 ? aw / al : 0;
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Win Rate</p><p className={`text-lg font-bold ${wr >= 50 ? "text-profit" : "text-loss"}`}>{wr}%</p></div>
                        <div className="bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-gray-500 mb-1">Avg RR</p><p className="text-lg font-bold text-royal">{rr > 0 ? rr.toFixed(2) : "—"}</p></div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Net P&L</p><p className={`text-sm font-bold ${selectedUser.qualifiedProfit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(selectedUser.qualifiedProfit, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Total P&L</p><p className="text-sm font-bold text-white">{formatBalance(selectedUser.grossProfit, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">P&L Removed</p><p className="text-sm font-bold text-loss">{formatBalance(selectedUser.profitRemoved, selectedUser.isCent)}</p></div>
                    <div className="bg-white/5 rounded-xl p-3"><p className="text-[10px] text-gray-500 mb-1">Account Type</p><p className="text-sm font-bold text-white">{formatSubtype(selectedUser.accountSubtype, selectedUser.accountType)}</p></div>
                  </div>

                  {/* Trade list — matches production row format */}
                  {selectedUser.recentTrades.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 mb-2">Trades ({selectedUser.recentTrades.length})</p>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {selectedUser.recentTrades.map((t, i) => (
                          <div key={i} className={`py-2 px-3 rounded-lg ${t.flagged ? "bg-loss/10 border border-loss/20" : "bg-white/5"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.type === "Buy" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss"}`}>{t.type}</span>
                                <div>
                                  <p className="text-xs text-white font-medium">{t.symbol}</p>
                                  <p className="text-[10px] text-gray-500">{t.date}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-xs font-bold ${t.profit >= 0 ? "text-profit" : "text-loss"}`}>{formatBalance(t.profit, selectedUser.isCent)}</p>
                                <p className="text-[10px] text-gray-500">{t.volume} lot {t.flagged && <span className="text-loss">🚩</span>}</p>
                              </div>
                            </div>
                            {t.flagged && t.violations && t.violations.length > 0 && (
                              <p className="text-[10px] text-loss mt-1 pl-7">⚠️ {t.violations[0]}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">No recent trades to show</p>
                  )}
                </>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== VIOLATIONS MODAL ==================== */}
      {showViolationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setShowViolationsModal(false)}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-loss/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><AlertTriangle size={20} className="text-loss" /><h3 className="text-lg font-bold text-white">Flagged Trades ({violations.length})</h3></div>
              <button onClick={() => setShowViolationsModal(false)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 rounded-xl bg-loss/10 border border-loss/20 mb-2"><p className="text-xs text-gray-300"><span className="text-loss font-semibold">Note:</span> Profits from flagged trades are removed. Losses still count.</p></div>
              {violations.map((t) => (
                <div key={t.ticket} className="p-4 rounded-xl bg-white/5 border border-loss/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${t.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}>{t.type}</span>
                      <span className="text-white font-semibold">{t.symbol}</span>
                    </div>
                    <span className="text-xs text-gray-500">{t.date}</span>
                  </div>
                  {t.violations.length > 0 && <div className="bg-loss/10 border border-loss/20 rounded-lg p-2 mb-2"><p className="text-sm text-white">{t.violations[0]}</p></div>}
                  <div className="flex gap-4 text-xs text-gray-400"><span>Lots: {t.volume}</span><span>Profit removed: <span className="text-loss font-semibold">{formatBalance(t.profit > 0 ? t.profit : 0, isCent)}</span></span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================== RULES MODAL ==================== */}
      {showRules && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-hidden" onClick={() => setShowRules(false)}>
          <div className="glass rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-royal/30" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 glass p-4 border-b border-white/10 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center gap-3"><FileText size={20} className="text-royal" /><h3 className="text-lg font-bold text-white">Challenge Rules</h3></div>
              <button onClick={() => setShowRules(false)} className="p-2 hover:bg-white/10 rounded-lg"><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <RuleItem code="1" text="Maximum lot size per trade: 0.02" />
              <RuleItem code="2" text="Maximum 3 trades open at the same time" />
              <RuleItem code="3" text="Maximum 2 trades on the same pair simultaneously" />
              <RuleItem code="4" text="Stop loss required on all trades (max risk: $5)" />
              <RuleItem code="5" text="Daily loss cap: $10 from day's opening balance" />
              <RuleItem code="6" text="Maximum trade duration: 24 hours" />
              <RuleItem code="7" text="No weekend trading (Friday 22:00 — Sunday 22:00 UTC)" />
              <RuleItem code="8" text="Minimum 7 active trading days to qualify" />
              <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
                <RuleItem code="•" text="No recharging (additional deposits) allowed during the challenge" />
                <RuleItem code="•" text="Unlimited trades per day — as long as all rules are followed" />
                <RuleItem code="•" text="No leverage limit" />
                <RuleItem code="•" text="Trades against the rules will have profits disqualified (losses still count)" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-4">
                <p className="text-xs text-gray-400"><span className="text-loss font-semibold">Penalty:</span> Profits from flagged trades are removed from your qualified balance. Losses from flagged trades still count. Repeated or severe violations may result in disqualification.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ entry, formatBalance, formatSubtype, onClick, realWinnersCount, demoWinnersCount }: { entry: LeaderboardEntry; formatBalance: (n: number, c?: boolean) => string; formatSubtype: (s: string | undefined, t: string) => string; onClick: () => void; realWinnersCount?: number; demoWinnersCount?: number }) {
  const winnersCount = entry.accountType === 'demo' ? (demoWinnersCount || 0) : (realWinnersCount || 0);
  const winner = !entry.isDisqualified && entry.isQualified && winnersCount > 0 && entry.rank <= winnersCount;
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${winner ? "bg-profit/10 border-l-2 border-profit hover:bg-profit/15" : entry.isMe ? "bg-royal/10 border-l-2 border-royal hover:bg-royal/15" : "hover:bg-white/5"} ${entry.isDisqualified ? "opacity-60" : ""}`}>
      <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${entry.isDisqualified ? "bg-loss/20 text-loss" : winner ? "bg-profit/20 text-profit" : "bg-white/5 text-gray-500"}`}>
        {winner ? "🏆" : entry.rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold truncate ${winner ? "text-profit" : entry.isMe ? "text-royal" : entry.isDisqualified ? "text-gray-500" : "text-white"}`}>{entry.nickname}</p>
          {winner && <span className="px-1.5 py-0.5 bg-profit/20 text-profit text-[10px] rounded font-bold">#{entry.rank}</span>}
          {entry.isMe && !winner && <span className="px-1.5 py-0.5 bg-royal/20 text-royal text-[10px] rounded font-bold">YOU</span>}
          {entry.isDisqualified && <span className="px-1.5 py-0.5 bg-loss/20 text-loss text-[10px] rounded font-bold">DQ</span>}
          {entry.isBlown && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">💀</span>}
          {entry.isWithdrawn && !entry.isDisqualified && <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[10px] rounded font-bold">🚪</span>}
        </div>
        <p className="text-[10px] text-gray-500">{entry.trades} trades • {entry.qualifiedTrades} qualified • {formatSubtype(entry.accountSubtype, entry.accountType)}</p>
      </div>
      <p className={`text-sm font-bold ${winner ? "text-profit" : "text-white"}`}>
        {entry.isDisqualified ? <span className="text-loss">DQ</span> : entry.isBlown ? <span className="text-gray-500">💀 Blown</span> : entry.isWithdrawn ? <span className="text-gray-500">🚪 Exited</span> : formatBalance(entry.balance, entry.isCent)}
      </p>
    </button>
  );
}
function MiniStat({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (<div className="glass rounded-xl p-3 border border-white/10 text-center"><div className={`flex items-center justify-center gap-1 mb-1 ${color || "text-gray-400"}`}>{icon}<p className="text-[9px] uppercase tracking-wider font-medium">{label}</p></div><p className={`text-lg font-bold ${color || "text-white"}`}>{value}</p></div>);
}
function TabBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (<button onClick={onClick} className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all ${active ? "bg-royal/20 text-royal border border-royal/30" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>{label}{count !== undefined && count > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${active ? "bg-royal/30 text-royal" : "bg-white/10 text-gray-500"}`}>{count}</span>}</button>);
}
function RuleItem({ code, text }: { code: string; text: string }) {
  return (<div className="flex gap-3 items-start"><span className="px-2 py-1 bg-royal/20 text-royal text-xs font-bold rounded flex-shrink-0">{code}</span><p className="text-sm text-gray-300">{text}</p></div>);
}
function DRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (<div className="bg-white/5 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p><p className={`text-sm font-semibold ${color || "text-white"}`}>{value}</p></div>);
}
