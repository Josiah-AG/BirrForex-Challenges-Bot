import { isRuleEnabled } from './rulePolicy';
import { resolveCategoryBalances } from './categorySettings';

export class ConfigurationError extends Error { readonly status = 400; }
function invalid(field: string, message: string): never { throw new ConfigurationError(`${field}: ${message}`); }
function number(field: string, value: any, positive = false, integer = false) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean'
      || !Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) <= 0)
      || (integer && !Number.isSafeInteger(Number(value)))) invalid(field, `must be a ${positive ? 'positive' : 'non-negative'} ${integer ? 'integer' : 'number'}`);
}
export function validateRules(rules: any): void {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) invalid('rules', 'configuration required');
  const switches = ['max_lot_size','max_open_trades','pair_limit','stop_loss_required','daily_loss_cap','max_hold_hours','min_trade_duration','weekend_trading','min_active_days','min_total_trades'];
  if (!rules.rules_enabled || switches.some(k => typeof rules.rules_enabled[k] !== 'boolean')) invalid('rules_enabled', 'each rule needs an explicit ON/OFF switch');
  for (const key of ['stop_loss_required','weekend_trading','only_cent_account','allow_professional']) {
    if (typeof rules[key] !== 'boolean') invalid(key, 'must be true or false');
  }
  const fields: Record<string, string> = {max_lot_size:'max_lot_size',max_open_trades:'max_open_trades',pair_limit:'pair_limit',max_hold_hours:'max_hold_hours',min_trade_duration:'min_trade_duration_minutes',min_active_days:'min_active_days',min_total_trades:'min_total_trades'};
  for (const [toggle,field] of Object.entries(fields)) {
    if (rules[field] != null || isRuleEnabled(rules,toggle as any)) number(field,rules[field],isRuleEnabled(rules,toggle as any), ['max_open_trades','pair_limit','min_active_days','min_total_trades'].includes(field));
  }
  for (const [modeField,fixed,percent,toggle] of [['max_risk_mode','max_risk_dollars','max_risk_percent','stop_loss_required'],['daily_loss_mode','daily_loss_cap','daily_loss_percent','daily_loss_cap']]) {
    const mode=rules[modeField] ?? 'fixed';
    if (!['fixed','percentage'].includes(mode)) invalid(modeField,'must be fixed or percentage');
    for (const field of [fixed,percent]) if (rules[field] != null) number(field,rules[field]);
    if (isRuleEnabled(rules,toggle as any) && (toggle !== 'stop_loss_required' || rules.stop_loss_required)) number(mode === 'fixed' ? fixed : percent,rules[mode === 'fixed' ? fixed : percent],true);
  }
}
export function validateChallenge(data: any, requireRules = true): void {
  if (typeof data.title !== 'string' || !data.title.trim()) invalid('title','is required');
  if (!['demo','real','hybrid'].includes(data.type)) invalid('type','must be demo, real or hybrid');
  for(const field of ['split_category_settings','target_enabled','allow_below_start','demo_target_enabled','real_target_enabled','demo_allow_below_start','real_allow_below_start','team_only']){
    if(data[field]!=null && typeof data[field]!=='boolean')invalid(field,'must be true or false');
  }
  if(!data.start_date || !data.end_date)invalid('dates','start and end are required');
  const start=new Date(data.start_date).getTime(),end=new Date(data.end_date).getTime();
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start) invalid('dates','end must be after a valid start');
  try { new Intl.DateTimeFormat('en',{timeZone:data.timezone || 'Africa/Nairobi'}); } catch { invalid('timezone','invalid IANA timezone'); }
  if (data.registration_deadline && (!Number.isFinite(new Date(data.registration_deadline).getTime()) || new Date(data.registration_deadline).getTime()>start)) invalid('registration_deadline','must be no later than challenge start');
  if(data.registration_mode!=null && !['manual','csv','winnerpip'].includes(data.registration_mode))invalid('registration_mode','must be manual, csv or winnerpip');
  if (data.split_category_settings && data.type!=='hybrid') invalid('split_category_settings','requires hybrid challenge');
  for (const category of data.type==='hybrid'?['demo','real']:[data.type]) {
    let balances;
    try { balances=resolveCategoryBalances(data,category); } catch(e) { invalid(category,(e as Error).message); }
    number(`${category}.starting_balance`,balances.startingBalance,true);
    number(`${category}.target_balance`,balances.targetBalance);
    if (!['fixed','max_limit','min_limit'].includes(balances.depositMode)) invalid(`${category}.deposit_mode`,'invalid mode');
    if (balances.targetEnabled && balances.depositMode!=='fixed') number(`${category}.target_percent`,balances.targetPercent,true);
    if (balances.targetEnabled && balances.depositMode==='fixed') number(`${category}.target_balance`,balances.targetBalance,true);
    if (requireRules && data.evaluation_type!=='legacy') validateRules(data.split_category_settings ? data[`rules_${category}`] : data.rules);
  }
  for (const category of ['demo','real']) {
    if(data[`${category}_winners_count`]!=null)number(`${category}_winners_count`,data[`${category}_winners_count`],false,true);
    const prizes=data[`${category}_prizes`];
    if(prizes!=null && !Array.isArray(prizes))invalid(`${category}_prizes`,'must be a list');
    if(Array.isArray(prizes)){
      prizes.forEach((value,index)=>{
        if(typeof value==='string' && value.trim() && !Number.isFinite(Number(value)))return; // Descriptive awards, e.g. '$50' or 'funded account'.
        number(`${category}_prizes[${index}]`,value);
      });
      if(prizes.length && prizes.length!==Number(data[`${category}_winners_count`]))invalid(`${category}_prizes`,'provide exactly one amount per winner');
    }
  }
  if(data.pull_times && (!Array.isArray(data.pull_times) || data.pull_times.some((v:any)=>typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))))invalid('pull_times','must contain HH:MM times');
}

/** An unused absolute target is stored explicitly as zero, never copied from another category. */
export function normalizeChallengeInput(input: any): any {
  const data={...input};
  for(const prefix of ['', 'demo_', 'real_']){
    const key=prefix+'target_balance';
    if((data[key]===null || data[key]==='') &&
      (data[prefix+'target_enabled']===false || ['max_limit','min_limit'].includes(data[prefix+'deposit_mode'])))data[key]=0;
  }
  return data;
}
