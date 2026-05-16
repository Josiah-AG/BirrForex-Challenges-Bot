// ==================== ENUMS ====================

export type UserRole = 'trader' | 'host' | 'admin';
export type ChallengeType = 'demo' | 'real' | 'hybrid';
export type ChallengeStatus = 'draft' | 'registration_open' | 'active' | 'submission_open' | 'reviewing' | 'completed';
export type AccountType = 'demo' | 'real';
export type RegistrationStatus = 'pending' | 'verified' | 'connected' | 'disconnected' | 'error';
export type RulePenalty = 'flag' | 'disqualify' | 'warn';

// ==================== RULE CODES ====================

export type RuleCode =
  | 'MAX_LOT_SIZE'
  | 'MAX_OPEN_TRADES'
  | 'REQUIRE_STOP_LOSS'
  | 'MAX_SAME_PAIR'
  | 'MAX_HOLD_TIME'
  | 'MAX_DAILY_LOSS'
  | 'MIN_ACTIVE_DAYS'
  | 'NO_WEEKEND_TRADING'
  | 'MAX_TRADES_PER_DAY'
  | 'ALLOWED_INSTRUMENTS'
  | 'BLOCKED_INSTRUMENTS'
  | 'MIN_TRADE_DURATION'
  | 'NO_HEDGING'
  | 'NO_RECHARGE';

export interface RuleDefinition {
  code: RuleCode;
  label: string;
  description: string;
  category: 'position' | 'risk' | 'activity' | 'time' | 'instrument';
  parameterSchema: RuleParameter[];
}

export interface RuleParameter {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'string[]';
  placeholder?: string;
  unit?: string;
}

// ==================== CORE MODELS ====================

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  role: UserRole;
  profilePicture?: string;
  createdAt: Date;
}

export interface Challenge {
  id: string;
  hostId: string;
  title: string;
  type: ChallengeType;
  status: ChallengeStatus;
  startDate: string;
  endDate: string;
  startingBalance: number;
  targetBalance: number;
  realWinnersCount: number;
  demoWinnersCount: number;
  realPrizes: number[];
  demoPrizes: number[];
  prizePoolText?: string;
  pdfUrl?: string;
  videoUrl?: string;
  description?: string;
  rules: ChallengeRule[];
  participantCount: number;
  demoCount: number;
  realCount: number;
  createdAt: string;
}

export interface ChallengeRule {
  id: string;
  ruleCode: RuleCode;
  ruleLabel: string;
  parameters: Record<string, any>;
  penalty: RulePenalty;
  orderNumber: number;
}

export interface Registration {
  id: string;
  challengeId: string;
  userId: string;
  username: string;
  accountType: AccountType;
  exnessEmail: string;
  accountNumber: string;
  mt5Server: string;
  investorPassword?: string;
  clientUid?: string;
  connectionStatus: RegistrationStatus;
  lastSyncAt?: string;
  disqualified: boolean;
  disqualifiedReason?: string;
  disqualifiedAt?: string;
  registeredAt: string;
}

export interface Trade {
  id: string;
  registrationId: string;
  ticket: string;
  symbol: string;
  tradeType: 'buy' | 'sell';
  lots: number;
  openTime: string;
  closeTime?: string;
  openPrice: number;
  closePrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  profit: number;
  commission: number;
  swap: number;
  isQualified: boolean;
  violations: TradeViolation[];
  syncedAt: string;
}

export interface TradeViolation {
  ruleCode: RuleCode;
  ruleLabel: string;
  detail: string;
}

export interface LeaderboardEntry {
  rank: number;
  registrationId: string;
  username: string;
  accountType: AccountType;
  qualifiedProfit: number;
  grossProfit: number;
  totalTrades: number;
  qualifiedTrades: number;
  flaggedTrades: number;
  bestTradeProfit: number;
  bestInstrument: string;
  isCurrentUser?: boolean;
}

export interface Winner {
  id: string;
  challengeId: string;
  registrationId: string;
  username: string;
  category: AccountType;
  position: number;
  prizeAmount: string;
  finalProfit: number;
  claimed: boolean;
}

// ==================== RULE LIBRARY ====================

export const RULE_LIBRARY: RuleDefinition[] = [
  {
    code: 'MAX_LOT_SIZE',
    label: 'Maximum Lot Size',
    description: 'Limit the maximum lot size per trade',
    category: 'position',
    parameterSchema: [{ key: 'maxLots', label: 'Max Lots', type: 'number', placeholder: '0.02', unit: 'lots' }],
  },
  {
    code: 'MAX_OPEN_TRADES',
    label: 'Maximum Open Trades',
    description: 'Limit simultaneous open positions',
    category: 'position',
    parameterSchema: [{ key: 'maxOpen', label: 'Max Open', type: 'number', placeholder: '3' }],
  },
  {
    code: 'REQUIRE_STOP_LOSS',
    label: 'Require Stop Loss',
    description: 'All trades must have a stop loss set',
    category: 'risk',
    parameterSchema: [{ key: 'maxLossPerTrade', label: 'Max Loss Per Trade', type: 'number', placeholder: '5', unit: '$' }],
  },
  {
    code: 'MAX_SAME_PAIR',
    label: 'Same Pair Limit',
    description: 'Limit trades on the same instrument',
    category: 'instrument',
    parameterSchema: [{ key: 'maxCount', label: 'Max Trades', type: 'number', placeholder: '2' }],
  },
  {
    code: 'MAX_HOLD_TIME',
    label: 'Maximum Hold Time',
    description: 'Maximum duration a position can be held',
    category: 'time',
    parameterSchema: [{ key: 'maxHours', label: 'Max Hours', type: 'number', placeholder: '24', unit: 'hours' }],
  },
  {
    code: 'MAX_DAILY_LOSS',
    label: 'Maximum Daily Loss',
    description: 'Maximum allowed loss per trading day',
    category: 'risk',
    parameterSchema: [{ key: 'maxLoss', label: 'Max Loss', type: 'number', placeholder: '10', unit: '$' }],
  },
  {
    code: 'MIN_ACTIVE_DAYS',
    label: 'Minimum Active Days',
    description: 'Minimum number of days trader must be active',
    category: 'activity',
    parameterSchema: [{ key: 'minDays', label: 'Min Days', type: 'number', placeholder: '7', unit: 'days' }],
  },
  {
    code: 'NO_WEEKEND_TRADING',
    label: 'No Weekend Trading',
    description: 'Trading on weekends is not allowed',
    category: 'time',
    parameterSchema: [],
  },
  {
    code: 'MAX_TRADES_PER_DAY',
    label: 'Max Trades Per Day',
    description: 'Limit the number of trades per day',
    category: 'activity',
    parameterSchema: [{ key: 'maxTrades', label: 'Max Trades', type: 'number', placeholder: '10' }],
  },
  {
    code: 'MIN_TRADE_DURATION',
    label: 'Minimum Trade Duration',
    description: 'Minimum time a trade must be held (anti-scalping)',
    category: 'time',
    parameterSchema: [{ key: 'minMinutes', label: 'Min Minutes', type: 'number', placeholder: '5', unit: 'min' }],
  },
  {
    code: 'NO_HEDGING',
    label: 'No Hedging',
    description: 'Cannot have opposing positions on the same pair',
    category: 'position',
    parameterSchema: [],
  },
  {
    code: 'NO_RECHARGE',
    label: 'No Account Recharge',
    description: 'Cannot deposit additional funds during challenge',
    category: 'risk',
    parameterSchema: [],
  },
];
