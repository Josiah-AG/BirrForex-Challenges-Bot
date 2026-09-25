export interface RulesEnabled {
  max_lot_size: boolean;
  max_open_trades: boolean;
  pair_limit: boolean;
  stop_loss_required: boolean;
  daily_loss_cap: boolean;
  max_hold_hours: boolean;
  min_trade_duration: boolean;
  weekend_trading: boolean;
  min_active_days: boolean;
  min_total_trades: boolean;
}

export interface RuleConfig {
  max_lot_size: number | null;
  max_open_trades: number | null;
  pair_limit: number | null;
  stop_loss_required: boolean;
  max_risk_dollars: number | null;
  max_risk_mode?: 'fixed' | 'percentage';       // 'fixed' = $ amount, 'percentage' = % of account balance at trade open
  max_risk_percent?: number | null;              // e.g. 10 = 10% of balance
  daily_loss_cap: number | null;
  daily_loss_mode?: 'fixed' | 'percentage';      // 'fixed' = $ amount, 'percentage' = % of day's opening balance
  daily_loss_percent?: number | null;            // e.g. 20 = 20% of day's opening balance
  max_hold_hours: number | null;
  min_trade_duration_minutes: number | null;     // Minimum trade hold time in minutes — trades shorter than this are flagged
  weekend_trading: boolean;
  min_active_days: number;
  min_total_trades: number | null;               // Minimum total trades to qualify — blue flag during challenge, DQ at end
  only_cent_account: boolean;
  allow_professional: boolean;
  rules_enabled?: RulesEnabled;
}


export function isRuleEnabled(rules: { rules_enabled?: Partial<RulesEnabled> }, ruleKey: keyof RulesEnabled): boolean {
  if (!rules.rules_enabled) return true; // Legacy: all rules enabled by default
  return rules.rules_enabled[ruleKey] !== false; // Explicit false = disabled
}

/** Both the configured behavior and its enable switch must permit enforcement. */
export function isRiskRuleEnabled(rules: RuleConfig): boolean {
  return rules.stop_loss_required === true && isRuleEnabled(rules, 'stop_loss_required');
}

export function isWeekendProhibited(rules: RuleConfig): boolean {
  return !rules.weekend_trading && isRuleEnabled(rules, 'weekend_trading');
}

export function minimumTrades(rules: RuleConfig): number {
  return isRuleEnabled(rules, 'min_total_trades') ? (rules.min_total_trades || 0) : 0;
}
