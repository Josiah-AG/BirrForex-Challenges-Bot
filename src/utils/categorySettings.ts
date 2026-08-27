/**
 * Per-category settings resolver for hybrid challenges.
 * 
 * When split_category_settings is ON for a hybrid challenge, demo and real
 * participants can have different starting balances, targets, and rules.
 * 
 * When OFF (default), or for non-hybrid challenges, falls back to the
 * shared starting_balance/target_balance — zero behavior change.
 */

export interface ChallengeBalances {
  startingBalance: number;
  targetBalance: number;
}

/**
 * Resolve the correct starting/target balance for a participant based on
 * their account type and the challenge's split_category_settings flag.
 * 
 * @param challenge - The challenge object (must include starting_balance, target_balance,
 *   split_category_settings, demo_starting_balance, demo_target_balance,
 *   real_starting_balance, real_target_balance)
 * @param accountType - 'demo' or 'real'
 * @returns { startingBalance, targetBalance } in raw $ (before cent conversion)
 */
export function resolveCategoryBalances(challenge: any, accountType: string): ChallengeBalances {
  const sharedStart = parseFloat(challenge.starting_balance || challenge.startingBalance || '30');
  const sharedTarget = parseFloat(challenge.target_balance || challenge.targetBalance || '60');

  // Only apply per-category when split is explicitly ON and challenge is hybrid
  const isSplit = challenge.split_category_settings === true || challenge.splitCategorySettings === true;
  const isHybrid = challenge.type === 'hybrid';

  if (!isSplit || !isHybrid) {
    return { startingBalance: sharedStart, targetBalance: sharedTarget };
  }

  if (accountType === 'demo') {
    return {
      startingBalance: challenge.demo_starting_balance != null ? parseFloat(challenge.demo_starting_balance) :
                       challenge.demoStartingBalance != null ? parseFloat(challenge.demoStartingBalance) : sharedStart,
      targetBalance: challenge.demo_target_balance != null ? parseFloat(challenge.demo_target_balance) :
                     challenge.demoTargetBalance != null ? parseFloat(challenge.demoTargetBalance) : sharedTarget,
    };
  }

  if (accountType === 'real') {
    return {
      startingBalance: challenge.real_starting_balance != null ? parseFloat(challenge.real_starting_balance) :
                       challenge.realStartingBalance != null ? parseFloat(challenge.realStartingBalance) : sharedStart,
      targetBalance: challenge.real_target_balance != null ? parseFloat(challenge.real_target_balance) :
                     challenge.realTargetBalance != null ? parseFloat(challenge.realTargetBalance) : sharedTarget,
    };
  }

  // Fallback for unknown account type
  return { startingBalance: sharedStart, targetBalance: sharedTarget };
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
