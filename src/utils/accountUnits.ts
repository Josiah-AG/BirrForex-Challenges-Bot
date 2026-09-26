/** Configuration is in cents only for real-only, cent-only challenges. */
export function accountUnitMultiplier(challenge: any, rules: any, isCent: boolean): number {
  return isCent && !(challenge.type === 'real' && rules.only_cent_account === true) ? 100 : 1;
}
