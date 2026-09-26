import { db } from '../database/db';
import { resolveCategoryBalances } from '../utils/categorySettings';
import { accountUnitMultiplier } from '../utils/accountUnits';
import { evaluationEngine } from './wpEvaluationEngine';

/** Management cards use the same category thresholds and currency units as evaluation. */
export async function countAboveTargets(challengeId: number): Promise<{demo:number;real:number;total:number}> {
  const saved=await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId]);
  const challenge=saved.rows[0];
  if(!challenge)throw new Error('Challenge not found');
  const entries=await db.query(`SELECT l.account_type,l.adjusted_balance,l.growth_percent,r.is_cent
    FROM wp_leaderboard l JOIN trading_registrations r ON r.id=l.registration_id
    WHERE l.challenge_id=$1 AND r.disqualified=false AND r.status IS DISTINCT FROM 'removed'`,[challengeId]);
  const counts={demo:0,real:0,total:0};
  for(const category of ['demo','real'] as const){
    if(challenge.type!=='hybrid' && challenge.type!==category)continue;
    const settings=resolveCategoryBalances(challenge,category);
    if(!settings.targetEnabled)continue;
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
  return counts;
}
