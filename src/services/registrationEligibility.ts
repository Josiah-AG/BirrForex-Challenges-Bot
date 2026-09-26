import { db } from '../database/db';
import { evaluationEngine } from './wpEvaluationEngine';
import { resolveCategoryBalances } from '../utils/categorySettings';
import { ConfigurationError } from '../utils/configValidation';
import { VpsVerifyResult } from './vpsService';

import { accountUnitMultiplier } from '../utils/accountUnits';
export { accountUnitMultiplier } from '../utils/accountUnits';
export async function validateVerifiedRegistration(challengeId: number, category: string, result: VpsVerifyResult, mode: 'web'|'csv'|'change'|'native'='web'): Promise<void> {
  if(result.success!==true || result.status!=='connected' || !Number.isFinite(result.balance)
    || !result.currency || result.trade_mode==null || ![0,2].includes(Number(result.trade_mode)))throw new ConfigurationError('Successful VPS verification with account type, currency and balance is required');
  const row=await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId]);
  const challenge=row.rows[0];
  if(!challenge)throw new ConfigurationError('Challenge not found');
  const permitted=mode==='csv'?['draft','pending_approval','registration_open']:['registration_open'];
  if(!permitted.includes(challenge.status) || challenge.configuration_frozen_at || Date.now()>=new Date(challenge.registration_deadline || challenge.start_date).getTime() || Date.now()>=new Date(challenge.start_date).getTime())throw new ConfigurationError('Registration is closed');
  if(challenge.host_id){
    const host=await db.query('SELECT active,registration_blocked FROM hosts WHERE id=$1',[challenge.host_id]);
    if(!host.rows[0]?.active || host.rows[0]?.registration_blocked)throw new ConfigurationError('Host registration is blocked');
  }
  if(challenge.host_id && mode==='web' && challenge.registration_mode!=='winnerpip')throw new ConfigurationError('This challenge accepts host-managed registration only');
  if(challenge.host_id && mode!=='csv' && challenge.registration_mode==='csv')throw new ConfigurationError('This challenge accepts host-managed registration only');
  const actual=Number(result.trade_mode)===0?'demo':'real';
  if(category!==actual || (challenge.type!=='hybrid' && challenge.type!==actual))throw new ConfigurationError(`Verified account is ${actual}; category does not match the challenge`);
  const rules=await evaluationEngine.rulesForAccount(challengeId,category);
  const cent=['USC','USCENT'].includes(result.currency.toUpperCase());
  if(category==='real' && rules.only_cent_account && !cent)throw new ConfigurationError('Real category requires a cent account');
  if(!rules.allow_professional && ['pro','raw_spread','zero'].includes(result.account_subtype || ''))throw new ConfigurationError('Professional account subtype is not allowed');
  const settings=resolveCategoryBalances(challenge,category);
  const limit=settings.startingBalance*accountUnitMultiplier(challenge,rules,cent);
  const balance=Number(result.balance),tolerance=limit*.01;
  if(settings.depositMode==='min_limit' && balance<limit-tolerance)throw new ConfigurationError(`Balance is below the required minimum (${limit} account-currency units)`);
  if(settings.depositMode!=='min_limit' && balance>limit+tolerance)throw new ConfigurationError(`Balance exceeds the allowed maximum (${limit} account-currency units)`);
  if(category==='demo' && settings.depositMode==='fixed' && Math.abs(balance-limit)>tolerance)throw new ConfigurationError(`Demo balance must match ${limit} account-currency units`);
}

/** Optional integration is intentional; configured but unavailable integration must fail closed. */
export async function validateHostAllocation(challengeId:number,email:string): Promise<void> {
  const context=await db.query(`SELECT c.host_id,h.has_broker_integration FROM trading_challenges c LEFT JOIN hosts h ON h.id=c.host_id WHERE c.id=$1`,[challengeId]);
  const row=context.rows[0];
  if(!row)throw new ConfigurationError('Challenge not found');
  if(!row.host_id || !row.has_broker_integration)return;
  const {hostService}=require('./hostService');
  const credentials=await hostService.getBrokerCredentials(row.host_id);
  if(!credentials)throw new ConfigurationError('Host broker integration is unavailable; registration cannot be verified');
  const {ExnessService}=require('./exnessService');
  const allocation=await new ExnessService(credentials).checkAllocation(email.trim().toLowerCase());
  if(!allocation || typeof allocation.affiliation!=='boolean')throw new ConfigurationError('Broker verification is unavailable; please retry');
  if(!allocation.affiliation)throw new ConfigurationError('Account is not allocated under this host’s broker partnership');
}
