/**
 * BirrForex Challenge Evaluation Engine (Legacy — MT5 file-based)
 * This is the original evaluation engine used for post-challenge file uploads.
 * The new real-time evaluation is in wpEvaluationEngine.ts
 */

import { MT5Position, MT5Deal, MT5AccountInfo } from './mt5Parser';

export interface EvaluationConfig {
  challengeStartDate: string;
  challengeEndDate: string;
  startingBalanceLimit: number;
  targetBalance: number;
  maxLot: number;
  maxOpenTrades: number;
  maxSamePair: number;
  maxSlDollars: number;
  maxDailyLoss: number;
  maxHoldHours: number;
  minActiveDays: number;
}

export interface FlaggedTrade {
  positionId: string;
  symbol: string;
  openTime: string;
  profit: number;
  reasons: string[];
}

export interface DailyDrawdownInfo {
  day: string;
  dayName: string;
  openBalance: number;
  minBalance: number;
  closeBalance: number;
  drawdown: number;
  breached: boolean;
  profitsRemovedAfterBreach: number;
}

export interface EvaluationResult {
  accountNumber: string;
  accountType: 'demo' | 'real';
  accountName: string;
  isCent: boolean;
  startingBalance: number;
  reportedBalance: number;
  adjustedBalance: number;
  profitRemoved: number;
  totalTrades: number;
  flaggedCount: number;
  activeDays: number;
  isQualified: boolean;
  isDisqualified: boolean;
  disqualifyReasons: string[];
  checks: {
    challengePeriod: boolean;
    startingBalance: boolean;
    noRecharging: boolean;
    activeDays: boolean;
    weekendTrading: boolean;
    lotSize: boolean;
    maxOpenTrades: boolean;
    samePairLimit: boolean;
    stopLoss: boolean;
    dailyDrawdown: boolean;
    holdTime: boolean;
  };
  flaggedTrades: FlaggedTrade[];
  dailyDrawdowns: DailyDrawdownInfo[];
  slViolationCount: number;
  noSlCount: number;
  slTooWideCount: number;
  maxSimultaneous: number;
  worstDrawdownDay: string;
  worstDrawdownAmount: number;
  balanceResetOnDay1: boolean;
  shortReport: string;
  fullReport: string;
}

/**
 * Evaluate an MT5 account from uploaded file data.
 * This is the legacy evaluation used by /evaluate command.
 */
export function evaluateAccount(
  account: MT5AccountInfo,
  positions: MT5Position[],
  deals: MT5Deal[],
  reportedBalance: number,
  config: EvaluationConfig
): EvaluationResult {
  // Load from compiled dist (the full implementation)
  const compiled = require('../../dist/services/evaluationEngine');
  return compiled.evaluateAccount(account, positions, deals, reportedBalance, config);
}
