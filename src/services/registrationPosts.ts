import {db} from '../database/db';
import {config} from '../config';
import {challengeBalanceSummary,dashboardCTA,postDate} from '../utils/challengePosts';
export const escapePost = (value:any) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function registrationPost(c:any,days?:number):string {
 const title=escapePost(c.title),tz=c.timezone||config.timezone;
 const heading=days ? (days===1?'🚨 LAST CHANCE TO REGISTER!':`⏰ ${days} DAYS REMAINING!`) : '🎯 NEW CHALLENGE — Registration Open!';
 const type=c.type==='hybrid'?'Hybrid (Demo & Real Account)':c.type==='demo'?'Demo Account':'Real Account';
 let prizes=escapePost(c.prize_pool_text);
 if(!prizes)for(const category of ['real','demo'])if(c.type===category||c.type==='hybrid'){
   const values=typeof c[`${category}_prizes`]==='string'?JSON.parse(c[`${category}_prizes`]):c[`${category}_prizes`]||[];
   prizes+=`\n${category==='real'?'Real':'Demo'} Account: `+values.map((v:any,i:number)=>`${i+1}. $${escapePost(v)}`).join(' · ');
 }
 let links='';
 if(c.pdf_url)links+=`\n📄 Rules: <a href="${escapePost(c.pdf_url)}">Download PDF</a>`;
 if(c.video_url)links+=`\n🎥 Guide: <a href="${escapePost(c.video_url)}">Watch Video</a>`;
 return `<b>${heading}</b>\n\n<b>${title}</b>\n${days?`Starts ${days===1?'tomorrow':`in ${days} days`} — register before the challenge begins!\n`:''}\n📊 ${type}${c.only_cent_account?'\n📋 Real accounts: Cent Account Only':''}\n${challengeBalanceSummary(c)}\n📅 <b>Start:</b> ${postDate(c.start_date,tz)}\n🏁 <b>End:</b> ${postDate(c.end_date,tz)}\n🏆 ${prizes}${links}\n\n👉 <b>Tap "Join Challenge" below to register!</b>\n\n${dashboardCTA}`;
}
/** Persist receipts per channel; retry only missing deliveries, including after restarts. */
export async function deliverRegistrationPost(telegram:any,c:any,key='announcement',days?:number):Promise<boolean>{
 if(c.host_id||c.source==='discord'||c.status!=='registration_open')return false;
 const client=await db.getClient();let locked=false;
 try{
  locked=(await client.query('SELECT pg_try_advisory_lock(26101103,$1) AS locked',[c.id])).rows[0].locked;
  if(!locked)return false;
  await client.query('INSERT INTO challenge_registration_posts(challenge_id,post_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[c.id,key]);
  const row=(await client.query('SELECT * FROM challenge_registration_posts WHERE challenge_id=$1 AND post_key=$2',[c.id,key])).rows[0];
  if(row.completed_at)return true;
  const rules=await client.query("SELECT parameters FROM wp_challenge_rules WHERE challenge_id=$1 AND rule_code=$2",[c.id,c.type==='hybrid'&&c.split_category_settings?'config_real':'config']);
  const body=registrationPost({...c,only_cent_account:c.type!=='demo'&&rules.rows[0]?.parameters?.only_cent_account},days);
  const info=await telegram.getMe();
  const opts={parse_mode:'HTML',link_preview_options:{is_disabled:true},reply_markup:{inline_keyboard:[[{text:'🚀 Join Challenge',url:`https://t.me/${info.username}?start=tc_register_${c.id}`}],[{text:'💰 Open Exness Account',url:config.exnessPartnerSignupLink}]]}};
  const errors:string[]=[];
  for(const channel of [...new Set([config.mainChannelId,config.challengeChannelId])]){
   if(row.delivered[String(channel)])continue;
   try{
    const result=await telegram.sendMessage(channel,body,opts);
    await client.query('UPDATE challenge_registration_posts SET delivered=delivered || $3::jsonb WHERE challenge_id=$1 AND post_key=$2',[c.id,key,JSON.stringify({[String(channel)]:result.message_id})]);
   }catch(e){errors.push((e as Error).message);}
  }
  await client.query('UPDATE challenge_registration_posts SET error=$3,completed_at=CASE WHEN $3::text IS NULL THEN NOW() ELSE NULL END WHERE challenge_id=$1 AND post_key=$2',[c.id,key,errors.length?errors.join('; '):null]);
  if(errors.length)throw new Error('Telegram delivery incomplete. Check bot channel permissions; missing deliveries will retry automatically.');
  if(key==='announcement')await client.query('UPDATE trading_challenges SET announcement_posted=true WHERE id=$1',[c.id]);
  return true;
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(26101103,$1)',[c.id]);client.release();}
}
