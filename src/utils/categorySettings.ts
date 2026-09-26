/**
 * Per-category settings resolver for hybrid challenges.
 * 
 * When split_category_settings is ON for a hybrid challenge, demo and real
 * participants can have different starting balances, targets, deposit modes, and rules.
 * 
 * When OFF, or for non-hybrid challenges, the challenge uses its unified configuration.
 * Split categories require their own complete values and never inherit from it.
 */

export interface ChallengeBalances {
  startingBalance: number;
  targetBalance: number;
  depositMode: string;
  targetPercent: number | null;
  /** When false, qualification does NOT require hitting the target — ranked purely by metric. Defaults true. */
  targetEnabled: boolean;
  /** When target is disabled: if true, accounts ending below their starting balance can still qualify. Defaults false. */
  allowBelowStart: boolean;
}

/** Normalize a possibly-null boolean-ish DB value to a strict boolean, with a default. */
function toBool(v: any, def: boolean): boolean {
  if (v === null || v === undefined) return def;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === 'true' || v === 't' || v === '1';
  return def;
}

/**
 * Resolve the correct starting/target balance, deposit mode, and target percent
 * for a participant based on their account type and the challenge's split_category_settings flag.
 * 
 * @param challenge - The challenge object (must include starting_balance, target_balance,
 *   split_category_settings, demo_starting_balance, demo_target_balance,
 *   real_starting_balance, real_target_balance, deposit_mode, target_percent,
 *   demo_deposit_mode, real_deposit_mode, demo_target_percent, real_target_percent)
 * @param accountType - 'demo' or 'real'
 * @returns { startingBalance, targetBalance, depositMode, targetPercent } in raw $ (before cent conversion)
 */
export function resolveCategoryBalances(challenge: any, accountType: string): ChallengeBalances {
  if (!['demo','real'].includes(accountType)) throw new Error('Valid account category required');
  const split = (challenge.split_category_settings === true || challenge.splitCategorySettings === true) && challenge.type === 'hybrid';
  const prefix = split ? accountType + '_' : '';
  const get = (field: string) => {
    const key = prefix + field;
    const camel = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    return challenge[key] ?? challenge[camel];
  };
  for (const field of ['starting_balance','target_balance', ...(split ? ['deposit_mode','target_enabled','allow_below_start'] : [])]) {
    if (get(field) == null) throw new Error(`Missing independent setting: ${prefix}${field}`);
  }
  return {
    startingBalance: Number(get('starting_balance')),
    targetBalance: Number(get('target_balance')),
    depositMode: get('deposit_mode') ?? 'fixed',
    targetPercent: get('target_percent') == null ? null : Number(get('target_percent')),
    targetEnabled: toBool(get('target_enabled'), true),
    allowBelowStart: toBool(get('allow_below_start'), false),
  };
}

/**
 * Resolve the correct deposit_mode for a participant's category.
 * Convenience wrapper when you only need the deposit mode.
 */
export function resolveCategoryDepositMode(challenge: any, accountType: string): string {
  return resolveCategoryBalances(challenge, accountType).depositMode;
}

/**
 * Resolve the correct rule_code to use for loading rules.
 * When split is ON: 'config_demo' or 'config_real'
 * When split is OFF: 'config' (default)
 */
export function resolveRuleCode(challenge: any, accountType: string): string {
  const isSplit = challenge.split_category_settings === true || challenge.splitCategorySettings === true;
  const isHybrid = challenge.type === 'hybrid';

  if (!isSplit || !isHybrid) return 'config';

  if (accountType === 'demo') return 'config_demo';
  if (accountType === 'real') return 'config_real';
  throw new Error(`Invalid account category for split challenge: ${accountType}`);
}
