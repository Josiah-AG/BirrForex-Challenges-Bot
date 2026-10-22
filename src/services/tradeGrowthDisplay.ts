import {db} from '../database/db';
import {resolveCategoryBalances} from '../utils/categorySettings';
/** Display metadata only. Baseline and trade amounts both remain in native account units. */
export async function tradeGrowthContext(registrationId: number) {
 const row=(await db.query(`SELECT c.*,r.account_type,r.is_cent,r.actual_starting_balance,
 l.starting_balance AS evaluated_starting_balance FROM wp_current_registrations r
 JOIN trading_challenges c ON c.id=r.challenge_id
 LEFT JOIN wp_leaderboard l ON l.registration_id=r.id WHERE r.id=$1`,[registrationId])).rows[0];
 if(!row)return {};
 const mode=resolveCategoryBalances(row,row.account_type).depositMode;
 const baseline=row.evaluated_starting_balance ?? row.actual_starting_balance;
 return {tradeGrowthMode:mode==='min_limit'||mode==='max_limit',
 tradeStartingBalance:baseline!=null&&Number(baseline)>0?Number(baseline):null,tradeIsCent:!!row.is_cent};
}
export function withTradeGrowth(context:any,trade:any) {
 return {...context,netPnl:Number(trade.profit)+Number(trade.commission||0)+Number(trade.swap||0)};
}
