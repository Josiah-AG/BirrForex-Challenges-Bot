import { db } from '../database/db';
import { resolveCategoryBalances } from '../utils/categorySettings';
import { accountUnitMultiplier } from '../utils/accountUnits';
import { evaluationEngine } from './wpEvaluationEngine';

/** Management cards use the same category thresholds and currency units as evaluation. */
export async function countAboveTargets(challengeId: number): Promise<{demo:number;real:number;total:number; noTargetCard?:{value:string;sub:string}}> {
  const saved=await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId]);
  const challenge=saved.rows[0];
  if(!challenge)throw new Error('Challenge not found');
  const entries=await db.query(`SELECT l.account_type,l.adjusted_balance,l.growth_percent,l.total_withdrawn,l.zero_balance_at,l.is_withdrawn,l.is_disqualified,r.actual_starting_balance,r.registration_balance,r.is_cent
    FROM wp_leaderboard l JOIN trading_registrations r ON r.id=l.registration_id
    WHERE l.challenge_id=$1 AND r.disqualified=false AND r.status IS DISTINCT FROM 'removed'`,[challengeId]);
  const counts: {demo:number;real:number;total:number;noTargetCard?:{value:string;sub:string}}={demo:0,real:0,total:0};
  const summaries: {category:string;target:boolean;allow:boolean;count:number}[]=[];
  for(const category of ['demo','real'] as const){
    if(challenge.type!=='hybrid' && challenge.type!==category)continue;
    const settings=resolveCategoryBalances(challenge,category);
    if(!settings.targetEnabled){
      const rules=await evaluationEngine.rulesForAccount(challengeId,category);
      const count=entries.rows.filter(row=>row.account_type===category && !row.is_disqualified && !row.is_withdrawn && !row.zero_balance_at &&
        Number(row.adjusted_balance)-Number(row.total_withdrawn||0) >= Number(row.actual_starting_balance ?? row.registration_balance ?? settings.startingBalance*accountUnitMultiplier(challenge,rules,row.is_cent===true))).length;
      summaries.push({category,target:false,allow:settings.allowBelowStart,count});
      continue;
    }
    summaries.push({category,target:true,allow:false,count:0});
    const categoryEntries=entries.rows.filter(row=>row.account_type===category);
    if(!categoryEntries.length)continue;
    const rules=await evaluationEngine.rulesForAccount(challengeId,category);
    for(const row of categoryEntries){
      const reached=settings.depositMode==='fixed'
        ? Number(row.adjusted_balance)>=settings.targetBalance*accountUnitMultiplier(challenge,rules,row.is_cent===true)
        : Number(row.growth_percent)>=Number(settings.targetPercent);
      if(reached){counts[category]++;counts.total++;}
    }
  }
  if(summaries.some(s=>!s.target)){
    const noTargets=summaries.every(s=>!s.target);
    const samePolicy=noTargets && summaries.every(s=>s.allow===summaries[0].allow);
    counts.noTargetCard={value:noTargets?'No target':'Mixed targets',sub:samePolicy
      ? (summaries[0].allow?'':`${summaries.reduce((n,s)=>n+s.count,0)} at or above starting balance`)
      : summaries.map(s=>`${s.category==='demo'?'Demo':'Real'}: ${s.target?`${counts[s.category as 'demo'|'real']} above target`:s.allow?'No target':`No target · ${s.count} at or above starting balance`}`).join(' / ')};
  }
  return counts;
}
