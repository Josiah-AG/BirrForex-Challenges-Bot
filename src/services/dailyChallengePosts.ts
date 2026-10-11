import {db} from '../database/db';
import {config} from '../config';
import {isWeekendProhibited} from '../utils/rulePolicy';
import {resolveRuleCode} from '../utils/categorySettings';
import {challengeDates,choosePost,dailyChannels,postPhase,PostSlot,renderDaily} from '../utils/challengePosts';
export async function dailyCalendar(c:any):Promise<string[]>{
 const rows=(await db.query('SELECT rule_code,parameters FROM wp_challenge_rules WHERE challenge_id=$1',[c.id])).rows;
 const categories=c.type==='hybrid'?['demo','real']:[c.type];
 const weekend=categories.some(category=>{
   const rule=rows.find(r=>r.rule_code===resolveRuleCode(c,category))?.parameters;
   return rule && !isWeekendProhibited(rule);
 });
 return challengeDates(c,weekend);
}
/** Persistent template and per-channel receipts; serialize across ticks and replicas. */
export async function deliverDailyPost(telegram:any,c:any,day:number,slot:PostSlot,dates?:string[]):Promise<void>{
 if(c.host_id||c.source==='discord')return;
 dates=dates||await dailyCalendar(c);
 if(day<1||day>dates.length)return;
 const date=dates[day-1];
 const client=await db.getClient();let locked=false;
 try{
   locked=(await client.query('SELECT pg_try_advisory_lock(26101101,$1) AS locked',[c.id])).rows[0].locked;
   if(!locked)return;
   let row=(await client.query('SELECT * FROM challenge_daily_posts WHERE challenge_id=$1 AND post_date=$2 AND slot=$3',[c.id,date,slot])).rows[0];
   if(!row){
     const phase=postPhase(day,dates.length);
     const used=(await client.query('SELECT template_id FROM challenge_daily_posts WHERE slot=$1 AND phase=$2 ORDER BY id DESC LIMIT 6',[slot,phase])).rows.reverse().map(r=>r.template_id);
     const selected=choosePost(slot,phase,used);
     row=(await client.query(`INSERT INTO challenge_daily_posts(challenge_id,post_date,slot,phase,template_id,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[c.id,date,slot,phase,selected.id,renderDaily(c,day,dates.length,slot,selected.body)])).rows[0];
   }
   const errors:string[]=[];
   for(const channel of dailyChannels(day,dates.length,config.mainChannelId,config.challengeChannelId)){
     const key=String(channel);
     if(row.delivered[key])continue;
     try{
       const result=await telegram.sendMessage(channel,row.body,{parse_mode:'HTML',link_preview_options:{is_disabled:true}});
       await client.query(`UPDATE challenge_daily_posts SET delivered=delivered || $2::jsonb,error=NULL WHERE id=$1`,[row.id,JSON.stringify({[key]:result.message_id})]);
     }catch(e){errors.push((e as Error).message);}
   }
   if(errors.length){await client.query('UPDATE challenge_daily_posts SET error=$2 WHERE id=$1',[row.id,errors.join('; ')]);throw new Error('Daily post delivery incomplete; retry on next scheduled tick');}
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(26101101,$1)',[c.id]);client.release();}
}
