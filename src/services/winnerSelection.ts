import { db } from '../database/db';

// Imported legacy display records, bound to verified historical IDs rather than editable titles.
const archivedWinners = {
  real: [
    {rank:1,nickname:'Eyobgere',total_trades:19,flagged_trades:1,prize:'iPhone 17 Pro Max'},
    {rank:2,nickname:'Therealteme89',total_trades:16,flagged_trades:2,prize:'iPhone 17 Pro Max'},
    {rank:3,nickname:'Amanxspat',total_trades:9,flagged_trades:0,prize:'iPhone 17 Pro Max'},
  ],
  demo: [
    {rank:1,nickname:'Devaman00',total_trades:20,flagged_trades:0,prize:'$300'},
    {rank:2,nickname:'Romeo5121',total_trades:24,flagged_trades:8,prize:'$200'},
    {rank:3,nickname:'Bella4x19',total_trades:47,flagged_trades:5,prize:'$100'},
  ],
};

/** All presentation paths use the same eligible ordered identities. */
export async function selectWinnerPipWinners(challengeId: number, category: 'demo'|'real'): Promise<any[]> {
  const result=await db.query('SELECT * FROM trading_challenges WHERE id=$1',[challengeId]);
  const challenge=result.rows[0];
  if(!challenge || (challenge.type!=='hybrid' && challenge.type!==category))return [];
  if(challenge.leaderboard_locked_at){
    const snapshot=await db.query('SELECT winners FROM challenge_result_snapshots WHERE challenge_id=$1 ORDER BY id DESC LIMIT 1',[challengeId]);
    if(snapshot.rows[0])return snapshot.rows[0].winners[category] || [];
  }
  if([5,17].includes(challengeId))return archivedWinners[category].map(w=>({...w,archived:true}));
  return selectLiveWinners(challengeId,category,Number(challenge[`${category}_winners_count`] || 0));
}
async function selectLiveWinners(challengeId: number,category: string,count: number): Promise<any[]> {
  const result=await db.query(`SELECT l.*,r.username,r.user_id,r.nickname,r.is_cent FROM wp_leaderboard l
    JOIN trading_registrations r ON r.id=l.registration_id
    WHERE l.challenge_id=$1 AND l.account_type=$2 AND l.is_qualified=true
    AND l.is_disqualified=false AND r.disqualified=false AND r.status IS DISTINCT FROM 'removed'
    AND l.rank IS NOT NULL ORDER BY l.rank ASC,l.registration_id ASC LIMIT $3`,[challengeId,category,count]);
  return result.rows;
}
export async function snapshotWinnerPipResults(challengeId: number, reason: string): Promise<void> {
  const rows=await db.query('SELECT * FROM trading_challenges WHERE id=$1 FOR UPDATE',[challengeId]);
  const challenge=rows.rows[0];
  if(!challenge)throw new Error('Challenge not found');
  const real=await selectLiveWinners(challengeId,'real',Number(challenge.real_winners_count||0));
  const demo=await selectLiveWinners(challengeId,'demo',Number(challenge.demo_winners_count||0));
  await db.query('INSERT INTO challenge_result_snapshots(challenge_id,reason,winners) VALUES($1,$2,$3)',[challengeId,reason,JSON.stringify({real,demo})]);
}
