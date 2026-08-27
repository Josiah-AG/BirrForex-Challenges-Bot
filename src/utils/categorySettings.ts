/**
 * Per-category settings resolver for hybrid challenges.
 * 
 * When split_category_settings is ON for a hybrid challenge, demo and real
 * participants can have different starting balances, targets, deposit modes, and rules.
 * 
 * When OFF (default), or for non-hybrid challenges, falls back to the
 * shared starting_balance/target_balance — zero behavior change.
 */

export interface ChallengeBalances {
  startingBalance: number;
  targetBalance: number;
  depositMode: string;
  targetPercent: number | null;
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
  const sharedStart = parseFloat(challenge.starting_balance || challenge.startingBalance || '30');
  const sharedTarget = parseFloat(challenge.target_balance || challenge.targetBalance || '60');
  const sharedDepositMode = challenge.deposit_mode || challenge.depositMode || 'fixed';
  const sharedTargetPercent = challenge.target_percent != null ? parseFloat(challenge.target_percent) :
                              challenge.targetPercent != null ? parseFloat(challenge.targetPercent) : null;

  // Only apply per-category when split is explicitly ON and challenge is hybrid
  const isSplit = challenge.split_category_settings === true || challenge.splitCategorySettings === true;
  const isHybrid = challenge.type === 'hybrid';

  if (!isSplit || !isHybrid) {
    return { startingBalance: sharedStart, targetBalance: sharedTarget, depositMode: sharedDepositMode, targetPercent: sharedTargetPercent };
  }

  if (accountType === 'demo') {
    const depositMode = challenge.demo_deposit_mode || challenge.demoDepositMode || sharedDepositMode;
    const targetPercent = challenge.demo_target_percent != null ? parseFloat(challenge.demo_target_percent) :
                          challenge.demoTargetPercent != null ? parseFloat(challenge.demoTargetPercent) : sharedTargetPercent;
    return {
      startingBalance: challenge.demo_starting_balance != null ? parseFloat(challenge.demo_starting_balance) :
                       challenge.demoStartingBalance != null ? parseFloat(challenge.demoStartingBalance) : sharedStart,
      targetBalance: challenge.demo_target_balance != null ? parseFloat(challenge.demo_target_balance) :
                     challenge.demoTargetBalance != null ? parseFloat(challenge.demoTargetBalance) : sharedTarget,
      depositMode,
      targetPercent,
    };
  }

  if (accountType === 'real') {
    const depositMode = challenge.real_deposit_mode || challenge.realDepositMode || sharedDepositMode;
    const targetPercent = challenge.real_target_percent != null ? parseFloat(challenge.real_target_percent) :
                          challenge.realTargetPercent != null ? parseFloat(challenge.realTargetPercent) : sharedTargetPercent;
    return {
      startingBalance: challenge.real_starting_balance != null ? parseFloat(challenge.real_starting_balance) :
                       challenge.realStartingBalance != null ? parseFloat(challenge.realStartingBalance) : sharedStart,
      targetBalance: challenge.real_target_balance != null ? parseFloat(challenge.real_target_balance) :
                     challenge.realTargetBalance != null ? parseFloat(challenge.realTargetBalance) : sharedTarget,
      depositMode,
      targetPercent,
    };
  }

  // Fallback for unknown account type
  return { startingBalance: sharedStart, targetBalance: sharedTarget, depositMode: sharedDepositMode, targetPercent: sharedTargetPercent };
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
  return 'config';
}
