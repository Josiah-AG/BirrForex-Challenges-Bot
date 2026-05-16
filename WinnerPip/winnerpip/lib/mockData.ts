import type { Challenge, Registration, Trade, LeaderboardEntry, ChallengeRule } from '@/types';

// ==================== CHALLENGE RULES (for Challenge 15) ====================

export const challenge15Rules: ChallengeRule[] = [
  { id: 'r1', ruleCode: 'MAX_LOT_SIZE', ruleLabel: 'Maximum lot size per trade is 0.02', parameters: { maxLots: 0.02 }, penalty: 'flag', orderNumber: 1 },
  { id: 'r2', ruleCode: 'MAX_OPEN_TRADES', ruleLabel: 'Maximum 3 open trades at same time', parameters: { maxOpen: 3 }, penalty: 'flag', orderNumber: 2 },
  { id: 'r3', ruleCode: 'REQUIRE_STOP_LOSS', ruleLabel: 'Stop loss required, max $5 loss per trade', parameters: { maxLossPerTrade: 5 }, penalty: 'flag', orderNumber: 3 },
  { id: 'r4', ruleCode: 'MAX_SAME_PAIR', ruleLabel: 'Max 2 trades on same currency pair', parameters: { maxCount: 2 }, penalty: 'flag', orderNumber: 4 },
  { id: 'r5', ruleCode: 'MAX_HOLD_TIME', ruleLabel: 'Cannot hold position more than 24 hours', parameters: { maxHours: 24 }, penalty: 'flag', orderNumber: 5 },
  { id: 'r6', ruleCode: 'MAX_DAILY_LOSS', ruleLabel: 'Maximum $10 loss per day', parameters: { maxLoss: 10 }, penalty: 'flag', orderNumber: 6 },
  { id: 'r7', ruleCode: 'MIN_ACTIVE_DAYS', ruleLabel: 'Must trade on at least 7 days', parameters: { minDays: 7 }, penalty: 'warn', orderNumber: 7 },
  { id: 'r8', ruleCode: 'NO_WEEKEND_TRADING', ruleLabel: 'No trading on weekends', parameters: {}, penalty: 'flag', orderNumber: 8 },
  { id: 'r9', ruleCode: 'NO_RECHARGE', ruleLabel: 'Cannot recharge account', parameters: {}, penalty: 'disqualify', orderNumber: 9 },
];

// ==================== CHALLENGES ====================

export const mockChallenges: Challenge[] = [
  {
    id: '1',
    hostId: 'host1',
    title: 'Challenge 15 - Hybrid',
    type: 'hybrid',
    status: 'active',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    startingBalance: 30,
    targetBalance: 60,
    realWinnersCount: 3,
    demoWinnersCount: 3,
    realPrizes: [500, 300, 200],
    demoPrizes: [300, 200, 100],
    prizePoolText: '$1,600 Total Prize Pool',
    description: 'Trade with $30 starting balance. Hit $60 target. Best qualified profit wins.',
    rules: challenge15Rules,
    participantCount: 847,
    demoCount: 612,
    realCount: 235,
    createdAt: '2026-02-15',
  },
  {
    id: '2',
    hostId: 'host1',
    title: 'Challenge 16 - Demo Only',
    type: 'demo',
    status: 'registration_open',
    startDate: '2026-04-20',
    endDate: '2026-04-30',
    startingBalance: 50,
    targetBalance: 100,
    realWinnersCount: 0,
    demoWinnersCount: 5,
    realPrizes: [],
    demoPrizes: [500, 300, 200, 100, 50],
    prizePoolText: '$1,150 Total Prize Pool',
    description: 'Demo account challenge. Start with $50, target $100.',
    rules: challenge15Rules,
    participantCount: 0,
    demoCount: 0,
    realCount: 0,
    createdAt: '2026-03-25',
  },
  {
    id: '3',
    hostId: 'host1',
    title: 'Challenge 17 - Real Account',
    type: 'real',
    status: 'registration_open',
    startDate: '2026-04-25',
    endDate: '2026-05-10',
    startingBalance: 100,
    targetBalance: 200,
    realWinnersCount: 3,
    demoWinnersCount: 0,
    realPrizes: [1000, 500, 250],
    demoPrizes: [],
    prizePoolText: '$1,750 Total Prize Pool',
    description: 'Real account challenge for serious traders.',
    rules: challenge15Rules,
    participantCount: 0,
    demoCount: 0,
    realCount: 0,
    createdAt: '2026-03-28',
  },
];

// ==================== REGISTRATIONS ====================

export const mockRegistrations: Registration[] = [
  {
    id: 'reg1', challengeId: '1', userId: 'user1', username: 'trader_pro',
    accountType: 'demo', exnessEmail: 'john@example.com', accountNumber: '12345678',
    mt5Server: 'ExnessMT5Trial9', connectionStatus: 'connected', lastSyncAt: '2026-03-13T14:30:00Z',
    disqualified: false, registeredAt: '2026-02-28T10:00:00Z',
  },
  {
    id: 'reg2', challengeId: '1', userId: 'user2', username: 'TradeMaster',
    accountType: 'real', exnessEmail: 'master@example.com', accountNumber: '87654321',
    mt5Server: 'ExnessMT5Real9', connectionStatus: 'connected', lastSyncAt: '2026-03-13T14:25:00Z',
    disqualified: false, registeredAt: '2026-02-27T08:00:00Z',
  },
  {
    id: 'reg3', challengeId: '1', userId: 'user3', username: 'ForexKing',
    accountType: 'demo', exnessEmail: 'king@example.com', accountNumber: '11223344',
    mt5Server: 'ExnessMT5Trial9', connectionStatus: 'connected', lastSyncAt: '2026-03-13T14:20:00Z',
    disqualified: false, registeredAt: '2026-02-28T12:00:00Z',
  },
  {
    id: 'reg4', challengeId: '1', userId: 'user4', username: 'PipHunter',
    accountType: 'real', exnessEmail: 'hunter@example.com', accountNumber: '55667788',
    mt5Server: 'ExnessMT5Real9', connectionStatus: 'connected', lastSyncAt: '2026-03-13T14:15:00Z',
    disqualified: false, registeredAt: '2026-03-01T09:00:00Z',
  },
  {
    id: 'reg5', challengeId: '1', userId: 'user5', username: 'ScalpKing',
    accountType: 'demo', exnessEmail: 'scalp@example.com', accountNumber: '99887766',
    mt5Server: 'ExnessMT5Trial9', connectionStatus: 'disconnected',
    disqualified: true, disqualifiedReason: 'Partner changed from BirrForex', disqualifiedAt: '2026-03-10T12:00:00Z',
    registeredAt: '2026-02-28T15:00:00Z',
  },
];

// ==================== TRADES (for current user reg1) ====================

export const mockTrades: Trade[] = [
  {
    id: 't1', registrationId: 'reg1', ticket: '100001', symbol: 'EURUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-13T14:00:00Z', closeTime: '2026-03-13T14:30:00Z',
    openPrice: 1.0850, closePrice: 1.0875, stopLoss: 1.0830, takeProfit: 1.0900,
    profit: 12.50, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-13T14:35:00Z',
  },
  {
    id: 't2', registrationId: 'reg1', ticket: '100002', symbol: 'GBPUSD', tradeType: 'sell',
    lots: 0.05, openTime: '2026-03-13T10:00:00Z', closeTime: '2026-03-13T10:15:00Z',
    openPrice: 1.2750, closePrice: 1.2714, stopLoss: 1.2780,
    profit: 18.30, commission: -0.10, swap: 0, isQualified: false,
    violations: [{ ruleCode: 'MAX_LOT_SIZE', ruleLabel: 'Maximum lot size per trade is 0.02', detail: 'Lot size 0.05 exceeds maximum 0.02' }],
    syncedAt: '2026-03-13T10:20:00Z',
  },
  {
    id: 't3', registrationId: 'reg1', ticket: '100003', symbol: 'USDJPY', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-12T16:00:00Z', closeTime: '2026-03-12T16:45:00Z',
    openPrice: 148.50, closePrice: 148.24, stopLoss: 148.00,
    profit: -5.20, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-12T16:50:00Z',
  },
  {
    id: 't4', registrationId: 'reg1', ticket: '100004', symbol: 'EURUSD', tradeType: 'sell',
    lots: 0.02, openTime: '2026-03-12T11:00:00Z', closeTime: '2026-03-12T11:20:00Z',
    openPrice: 1.0870, closePrice: 1.0826, stopLoss: 1.0900, takeProfit: 1.0820,
    profit: 8.75, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-12T11:25:00Z',
  },
  {
    id: 't5', registrationId: 'reg1', ticket: '100005', symbol: 'GBPJPY', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-11T09:00:00Z', closeTime: '2026-03-11T09:30:00Z',
    openPrice: 189.50, closePrice: 190.26, stopLoss: 189.00, takeProfit: 190.50,
    profit: 15.20, commission: -0.06, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-11T09:35:00Z',
  },
  {
    id: 't6', registrationId: 'reg1', ticket: '100006', symbol: 'EURUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-10T14:00:00Z', closeTime: '2026-03-11T16:20:00Z',
    openPrice: 1.0820, closePrice: 1.0881, stopLoss: 1.0790,
    profit: 12.10, commission: -0.04, swap: -0.30, isQualified: false,
    violations: [{ ruleCode: 'MAX_HOLD_TIME', ruleLabel: 'Cannot hold position more than 24 hours', detail: 'Position held for 26h 20m (max 24h)' }],
    syncedAt: '2026-03-11T16:25:00Z',
  },
  {
    id: 't7', registrationId: 'reg1', ticket: '100007', symbol: 'XAUUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-10T10:00:00Z', closeTime: '2026-03-10T10:45:00Z',
    openPrice: 2150.00, closePrice: 2158.50, stopLoss: 2145.00, takeProfit: 2160.00,
    profit: 17.00, commission: -0.08, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-10T10:50:00Z',
  },
  {
    id: 't8', registrationId: 'reg1', ticket: '100008', symbol: 'GBPJPY', tradeType: 'sell',
    lots: 0.02, openTime: '2026-03-08T09:00:00Z', closeTime: '2026-03-08T09:45:00Z',
    openPrice: 190.10, closePrice: 189.67, stopLoss: 190.50,
    profit: 8.50, commission: -0.06, swap: 0, isQualified: false,
    violations: [{ ruleCode: 'MAX_SAME_PAIR', ruleLabel: 'Max 2 trades on same currency pair', detail: 'GBPJPY traded 3 times (max 2)' }],
    syncedAt: '2026-03-08T09:50:00Z',
  },
  {
    id: 't9', registrationId: 'reg1', ticket: '100009', symbol: 'AUDUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-07T13:00:00Z', closeTime: '2026-03-07T13:30:00Z',
    openPrice: 0.6520, closePrice: 0.6548, stopLoss: 0.6500, takeProfit: 0.6550,
    profit: 5.60, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-07T13:35:00Z',
  },
  {
    id: 't10', registrationId: 'reg1', ticket: '100010', symbol: 'NZDUSD', tradeType: 'sell',
    lots: 0.02, openTime: '2026-03-06T11:00:00Z', closeTime: '2026-03-06T11:20:00Z',
    openPrice: 0.6180, closePrice: 0.6155, stopLoss: 0.6200, takeProfit: 0.6150,
    profit: 5.00, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-06T11:25:00Z',
  },
  {
    id: 't11', registrationId: 'reg1', ticket: '100011', symbol: 'USDCAD', tradeType: 'buy',
    lots: 0.01, openTime: '2026-03-05T09:00:00Z', closeTime: '2026-03-05T09:15:00Z',
    openPrice: 1.3580, closePrice: 1.3620, stopLoss: 1.3560, takeProfit: 1.3630,
    profit: 2.95, commission: -0.02, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-05T09:20:00Z',
  },
  {
    id: 't12', registrationId: 'reg1', ticket: '100012', symbol: 'EURUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-04T14:00:00Z', closeTime: '2026-03-04T14:40:00Z',
    openPrice: 1.0800, closePrice: 1.0835, stopLoss: 1.0780, takeProfit: 1.0840,
    profit: 7.00, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-04T14:45:00Z',
  },
  {
    id: 't13', registrationId: 'reg1', ticket: '100013', symbol: 'GBPUSD', tradeType: 'buy',
    lots: 0.02, openTime: '2026-03-03T10:00:00Z', closeTime: '2026-03-03T10:25:00Z',
    openPrice: 1.2680, closePrice: 1.2720, stopLoss: 1.2660, takeProfit: 1.2730,
    profit: 8.00, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-03T10:30:00Z',
  },
  {
    id: 't14', registrationId: 'reg1', ticket: '100014', symbol: 'USDJPY', tradeType: 'sell',
    lots: 0.02, openTime: '2026-03-02T15:00:00Z', closeTime: '2026-03-02T15:30:00Z',
    openPrice: 149.20, closePrice: 148.85, stopLoss: 149.50, takeProfit: 148.80,
    profit: 4.70, commission: -0.04, swap: 0, isQualified: true, violations: [],
    syncedAt: '2026-03-02T15:35:00Z',
  },
];

// ==================== LEADERBOARD ====================

export const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, registrationId: 'reg_tm', username: 'TradeMaster', accountType: 'demo', qualifiedProfit: 245.50, grossProfit: 280.30, totalTrades: 67, qualifiedTrades: 62, flaggedTrades: 5, bestTradeProfit: 32.50, bestInstrument: 'XAUUSD' },
  { rank: 2, registrationId: 'reg_fk', username: 'ForexKing', accountType: 'real', qualifiedProfit: 198.30, grossProfit: 215.80, totalTrades: 52, qualifiedTrades: 49, flaggedTrades: 3, bestTradeProfit: 28.00, bestInstrument: 'GBPJPY' },
  { rank: 3, registrationId: 'reg_ph', username: 'PipHunter', accountType: 'demo', qualifiedProfit: 187.20, grossProfit: 201.40, totalTrades: 48, qualifiedTrades: 45, flaggedTrades: 3, bestTradeProfit: 25.00, bestInstrument: 'EURUSD' },
  { rank: 4, registrationId: 'reg_gw', username: 'GoldWolf', accountType: 'real', qualifiedProfit: 175.80, grossProfit: 190.20, totalTrades: 55, qualifiedTrades: 51, flaggedTrades: 4, bestTradeProfit: 22.00, bestInstrument: 'XAUUSD' },
  { rank: 5, registrationId: 'reg_sp', username: 'SwingPro', accountType: 'demo', qualifiedProfit: 162.40, grossProfit: 178.90, totalTrades: 41, qualifiedTrades: 39, flaggedTrades: 2, bestTradeProfit: 20.50, bestInstrument: 'EURUSD' },
  { rank: 6, registrationId: 'reg_fx', username: 'FXNinja', accountType: 'demo', qualifiedProfit: 155.00, grossProfit: 168.30, totalTrades: 38, qualifiedTrades: 36, flaggedTrades: 2, bestTradeProfit: 19.00, bestInstrument: 'GBPUSD' },
  { rank: 7, registrationId: 'reg_mt', username: 'MarketTiger', accountType: 'real', qualifiedProfit: 148.60, grossProfit: 160.10, totalTrades: 44, qualifiedTrades: 41, flaggedTrades: 3, bestTradeProfit: 18.50, bestInstrument: 'USDJPY' },
  { rank: 8, registrationId: 'reg_pp', username: 'PipPirate', accountType: 'demo', qualifiedProfit: 142.30, grossProfit: 155.80, totalTrades: 36, qualifiedTrades: 34, flaggedTrades: 2, bestTradeProfit: 17.00, bestInstrument: 'AUDUSD' },
  { rank: 9, registrationId: 'reg_tw', username: 'TradeWizard', accountType: 'demo', qualifiedProfit: 138.90, grossProfit: 150.20, totalTrades: 42, qualifiedTrades: 40, flaggedTrades: 2, bestTradeProfit: 16.50, bestInstrument: 'EURUSD' },
  { rank: 10, registrationId: 'reg_cs', username: 'ChartSniper', accountType: 'real', qualifiedProfit: 132.00, grossProfit: 145.60, totalTrades: 39, qualifiedTrades: 37, flaggedTrades: 2, bestTradeProfit: 15.80, bestInstrument: 'GBPJPY' },
  { rank: 11, registrationId: 'reg_bf', username: 'BullFighter', accountType: 'demo', qualifiedProfit: 129.50, grossProfit: 140.80, totalTrades: 35, qualifiedTrades: 33, flaggedTrades: 2, bestTradeProfit: 15.00, bestInstrument: 'NZDUSD' },
  { rank: 12, registrationId: 'reg1', username: 'trader_pro', accountType: 'demo', qualifiedProfit: 127.50, grossProfit: 142.30, totalTrades: 14, qualifiedTrades: 11, flaggedTrades: 3, bestTradeProfit: 17.00, bestInstrument: 'XAUUSD', isCurrentUser: true },
  { rank: 13, registrationId: 'reg_tj', username: 'TraderJoe', accountType: 'demo', qualifiedProfit: 115.80, grossProfit: 128.40, totalTrades: 41, qualifiedTrades: 38, flaggedTrades: 3, bestTradeProfit: 14.00, bestInstrument: 'EURUSD' },
  { rank: 14, registrationId: 'reg_mp', username: 'MarketPro', accountType: 'real', qualifiedProfit: 108.40, grossProfit: 120.60, totalTrades: 39, qualifiedTrades: 36, flaggedTrades: 3, bestTradeProfit: 13.50, bestInstrument: 'USDJPY' },
  { rank: 15, registrationId: 'reg_dc', username: 'DayChaser', accountType: 'demo', qualifiedProfit: 102.00, grossProfit: 115.30, totalTrades: 33, qualifiedTrades: 31, flaggedTrades: 2, bestTradeProfit: 12.00, bestInstrument: 'GBPUSD' },
];

// ==================== HELPER: Calculate stats from trades ====================

export function calculateStats(trades: Trade[]) {
  const qualifiedTrades = trades.filter(t => t.isQualified);
  const flaggedTrades = trades.filter(t => !t.isQualified);

  const grossProfit = trades.reduce((sum, t) => sum + t.profit, 0);
  const flaggedProfit = flaggedTrades.reduce((sum, t) => sum + Math.max(0, t.profit), 0);
  const qualifiedProfit = grossProfit - flaggedProfit;

  const bestTrade = qualifiedTrades.reduce((best, t) => t.profit > best.profit ? t : best, { profit: 0, symbol: 'N/A' } as { profit: number; symbol: string });

  const symbolProfits: Record<string, number> = {};
  qualifiedTrades.forEach(t => {
    symbolProfits[t.symbol] = (symbolProfits[t.symbol] || 0) + t.profit;
  });
  const bestInstrument = Object.entries(symbolProfits).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    qualifiedProfit: Math.round(qualifiedProfit * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalTrades: trades.length,
    qualifiedTrades: qualifiedTrades.length,
    flaggedTrades: flaggedTrades.length,
    bestTradeProfit: Math.round(bestTrade.profit * 100) / 100,
    bestInstrument,
    totalLots: Math.round(trades.reduce((sum, t) => sum + t.lots, 0) * 100) / 100,
  };
}
