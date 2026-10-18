import {resolveCategoryBalances} from '../utils/categorySettings';
import {db} from '../database/db';
import {config} from '../config';
import {dashboardCTA} from '../utils/challengePosts';
export const escapePost = (value:any) => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function registrationPost(c:any,days?:number,promo?:number,includeCTA=true):string {
 const title=escapePost(c.title),tz=c.timezone||config.timezone;
 const heading=days===1 ? `⏰ LAST DAY TO JOIN! ${title} Starts Tomorrow! 🔥`
   : days ? `⏰ ${days} DAYS LEFT! ${title} is Almost Here! 🔥`
   : promo===2?`🔥 Ready to Take Part? ${title} is Calling!`
   : promo===3?`🚀 Your Next Challenge Awaits! ${title}`
   : `📣 Registration is OPEN! ${title} is Here! 🔥`;
 const type=c.type==='hybrid'?'Hybrid Challenge (Demo & Real)':c.type==='demo'?'Demo Account Challenge':'Real Account Challenge';
 const date=(value:any)=>new Date(value).toLocaleDateString('en-US',{timeZone:tz,month:'long',day:'numeric'});
 const balance=(category:string)=>{
   const b=resolveCategoryBalances(c,category);
   const label=b.depositMode==='min_limit'?'Minimum Starting Balance':b.depositMode==='max_limit'?'Maximum Starting Balance':'Starting Balance';
   const target=!b.targetEnabled?'No target — ranked by performance':b.depositMode==='fixed'?`$${b.targetBalance} balance`:`${b.targetPercent}% account growth`;
   return `💰 <b>${label}:</b> $${b.startingBalance}\n🎯 <b>${b.targetEnabled?'Target':'Ranking'}:</b> ${target}`;
 };
 const real=c.type==='hybrid'?balance('real'):'';
 const demo=c.type==='hybrid'?balance('demo'):'';
 const balances=c.type==='hybrid'?(real===demo?real:`<b>Real Accounts</b>\n${real}\n\n<b>Demo Accounts</b>\n${demo}`):balance(c.type);
 const categories=c.type==='hybrid'?['real','demo']:[c.type];
 const prizes=categories.flatMap((category:string)=>{
   let values=c[`${category}_prizes`]||[];
   if(typeof values==='string'){try{values=JSON.parse(values)}catch{values=[]}}
   return Array.isArray(values)?values:[];
 });
 const numeric=prizes.length>0&&prizes.every((v:any)=>/^\d+(\.\d+)?$/.test(String(v).trim()));
 const pool=numeric?`$${prizes.reduce((sum:number,v:any)=>sum+Number(v),0).toLocaleString('en-US')}`:escapePost(c.prize_pool_text);
 let links='';
 if(c.pdf_url)links+=`\n📄 Rules: <a href="${escapePost(c.pdf_url)}">Download PDF</a>`;
 if(c.video_url)links+=`\n🎥 Guide: <a href="${escapePost(c.video_url)}">Watch Video</a>`;
 return `<b>${heading}</b>\n\nThe challenge starts on <b>${date(c.start_date)}</b>! 🏁\n\n📊 <b>${type}</b>${c.only_cent_account?'\n📋 Real accounts: Cent Account Only':''}\n${balances}${pool?`\n🏆 <b>Prize Pool:</b> ${pool}`:''}\n\n📅 <b>Challenge Period:</b> ${date(c.start_date)} – ${date(new Date(new Date(c.end_date).getTime()-1))}${links?'\n'+links:''}\n\n🚀 <b>Haven’t registered yet?</b>\n\n👇 Tap the <b>“Join Challenge”</b> button below and secure your spot!${includeCTA?'\n\n'+dashboardCTA:''}`;
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
