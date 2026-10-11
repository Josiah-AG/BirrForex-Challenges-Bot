import { getLocalTime, formatInTimezone } from './timezone';
import { resolveCategoryBalances } from './categorySettings';
export const dashboardCTA = '📊 Visit winnerpip.com to view your dashboard and track your challenge status.';
export const escapePost = (s: unknown) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export type PostSlot = 'morning' | 'evening';
export type PostPhase = 'first' | 'early' | 'middle' | 'penultimate' | 'final';
export function challengeDates(c: any, weekends = false): string[] {
  const zone=c.timezone || 'Africa/Nairobi';
  const first=getLocalTime(new Date(c.start_date),zone).dateStr;
  // The exact end instant is excluded; midnight must not create a phantom extra day.
  const last=getLocalTime(new Date(new Date(c.end_date).getTime()-1),zone).dateStr;
  const dates:string[]=[];
  for(let ms=Date.parse(first);ms<=Date.parse(last);ms+=86400000){
    const d=new Date(ms);
    if(weekends || (d.getUTCDay()!==0 && d.getUTCDay()!==6))dates.push(d.toISOString().slice(0,10));
  }
  return dates;
}
export function postPhase(day:number,total:number):PostPhase {
  if(day===total)return 'final';
  if(day===1)return 'first';
  if(day===total-1)return 'penultimate';
  return day<=Math.ceil(total/2)?'early':'middle';
}
// Independent pools for each stage and slot. No assumptions about weeks, targets or prizes.
export const messageBank:Record<PostSlot,Record<PostPhase,string[]>>={
 morning:{
 first:[
 'A fresh challenge begins. Read the rules, plan your risk, and let quality guide your first decision.',
 'Start with a plan you can follow. Patience and controlled risk matter more than a busy trade history.',
 'Your opening day sets the tone. Check your account, review the rules, and wait for your setup.',
 'Welcome to the starting line. Focus on decisions you can explain and risk you can manage.',
 'Begin calmly. A clear trading plan is a stronger foundation than chasing an early lead.',
 'New challenge, clear focus: protect your capital and make every decision deliberate.'
 ],
 early:[
 'Build good habits early. Review the last session before deciding what deserves your attention today.',
 'There is no need to chase the leaderboard. Follow your setup and respect the challenge limits.',
 'Keep your process consistent. A missed opportunity is better than a trade outside your plan.',
 'Check your qualified trades as well as your balance. Rule compliance is part of performance.',
 'Give yourself room to think. Set your risk before entering and avoid impulsive adjustments.',
 'Progress starts with preparation. Review the market, your exposure, and your challenge status.'
 ],
 middle:[
 'Use this stage to review your process. Keep what is working and identify avoidable mistakes.',
 'Stay steady through changing conditions. Protect your capital and keep your decisions disciplined.',
 'Your position can change; your risk standards should remain clear. Trade within the rules.',
 'Pause before adding exposure. Review open positions and your remaining risk allowance.',
 'Quality still matters more than activity. Check your qualified trades and active-day requirements.',
 'A thoughtful review can be more useful than another entry. Keep your plan in focus.'
 ],
 penultimate:[
 'One trading day follows today. Review any unmet requirements without forcing trades to catch up.',
 'The finish is approaching. Check your qualified trades, active days, and open positions.',
 'Prepare for the final trading day. Keep risk controlled and review the exact closing time.',
 'Stay patient near the finish. Protect your process rather than chasing a last-minute jump.',
 'Review your standing and remaining requirements today. Make deliberate decisions within the rules.',
 'A careful finish starts now. Check your exposure and avoid taking risks just to improve your rank.'
 ],
 final:[
 'Final trading day. Review the closing time, your positions, and the requirements still to meet.',
 'Finish with discipline. Do not let the deadline push you into trades outside your plan.',
 'The final session is here. Check your dashboard and keep every decision within the challenge rules.',
 'Stay focused through the finish. Review qualified trades and your account status before the deadline.',
 'Close out the challenge thoughtfully. Protect your capital and check the exact end time below.',
 'Last trading day: keep your standards consistent. Final results follow synchronization and evaluation.'
 ]},
 evening:{
 first:[
 'Review your opening session. What followed your plan, and what would you improve next time?',
 'Your first session is a chance to learn. Check recorded trades and any rule flags on your dashboard.',
 'Take a moment to review today’s decisions. Carry useful lessons forward without chasing losses.',
 'A strong review is part of a strong routine. Check your exposure and challenge status.',
 'Reflect on your first day. Judge your process as well as the balance change.',
 'Before stepping away, review your positions and confirm that you understand any flagged trades.'
 ],
 early:[
 'How did your plan hold up today? Review your trades before deciding what to change.',
 'Take stock of today’s session. Check qualified trades, risk limits, and any positions still open.',
 'Keep the review simple: what worked, what did not, and what will you do differently?',
 'A quiet session can still be disciplined. Avoid forcing activity to match someone else’s pace.',
 'Review today’s choices calmly. Let your plan guide the next session, not frustration.',
 'Check your latest published status. Resolve account-access issues promptly if any are shown.'
 ],
 middle:[
 'Review your progress against all the rules, including qualified trades and active days.',
 'Keep learning from each session. Look for repeated mistakes before adding more risk.',
 'Your trading journal and dashboard can reveal patterns. Take time to review both.',
 'Check your open positions and exposure before stepping away. Consistency includes managing risk.',
 'A useful review focuses on decisions you control. Prepare thoughtfully for the next session.',
 'Balance is only part of the picture. Check the rule flags and qualification details too.'
 ],
 penultimate:[
 'One trading day remains after today. Review your status and the closing deadline before the final session.',
 'Prepare for the final trading day with a clear plan. Do not force trades to satisfy missing requirements.',
 'Check qualified trades and active days now. The final session should be approached calmly.',
 'Review your remaining exposure before the final trading day. Keep the rules in view.',
 'The finish is near. Verify your dashboard status and plan around the actual challenge end time.',
 'Use this review to prepare for the last trading day. Discipline matters through the final decision.'
 ],
 final:[
 'The final trading day is drawing to a close. Check the deadline below and review your account status.',
 'Thank you for taking part. Final standings depend on synchronized history and completed evaluation.',
 'Keep your attention on the rules through the closing time. Check your dashboard for subsequent updates.',
 'Finish calmly and review your final activity. Published standings may change during final verification.',
 'Review your positions and qualification status before the deadline. Final evaluation follows the close.',
 'The closing stretch is here. Check the deadline and follow your dashboard for verified results.'
 ]}};
export function choosePost(slot:PostSlot,phase:PostPhase,used:string[],random=Math.random):{id:string;body:string}{
 const pool=messageBank[slot][phase].map((body,i)=>({id:`${slot}:${phase}:${i}`,body}));
 const fresh=pool.filter(m=>!used.includes(m.id));
 // Once exhausted, rotate out the oldest used template rather than repeat the latest one.
 const choices=fresh.length?fresh:pool.filter(m=>m.id!==used[used.length-1]);
 return choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
}
export function dailyChannels(day:number,total:number,main:string|number,challenge:string|number){
 return [...new Set(day===1||day===total?[main,challenge]:[challenge])];
}
export function renderDaily(c:any,day:number,total:number,slot:PostSlot,body:string):string{
 if(day<1||day>total)throw new Error('Day outside challenge');
 const zone=c.timezone||'Africa/Nairobi';
 const end=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'short'}).formatToParts(new Date(c.end_date)).find(p=>p.type==='timeZoneName')?.value;
 const heading=day===total?'🏁 FINAL TRADING DAY':slot==='morning'?'☀️ TRADING DAY':'🌙 DAILY REVIEW';
 const links=[c.pdf_url?`📄 <a href="${escapePost(c.pdf_url)}">Challenge rules</a>`:'',c.video_url?`🎥 <a href="${escapePost(c.video_url)}">Challenge guide</a>`:''].filter(Boolean).join('\n');
 return `<b>${heading} — ${day} OF ${total}</b>\n<b>${escapePost(c.title)}</b>\n\n${body}\n\n📅 Ends ${escapePost(formatInTimezone(c.end_date,zone))} ${end}.\n\n${dashboardCTA}${links?'\n\n'+links:''}`;
}
export function challengeBalanceSummary(c:any):string{
 return (c.type==='hybrid'?['real','demo']:[c.type]).map(category=>{
 const b=resolveCategoryBalances(c,category);
 const start=b.depositMode==='min_limit'?'Minimum starting balance':b.depositMode==='max_limit'?'Maximum starting balance':'Starting balance';
 const target=!b.targetEnabled?'No target':b.depositMode==='fixed'?`Target: $${b.targetBalance}`:`Target: ${b.targetPercent}% growth`;
 return `${category==='real'?'Real':'Demo'}: ${start} $${b.startingBalance} · ${target}`;
 }).join('\n');
}

/** Post at the usual local hour, adjusted to remain inside short first/last sessions. */
export function dailySlots(c:any,date:string,time:string):PostSlot[]{
 const zone=c.timezone||'Africa/Nairobi';
 const start=getLocalTime(new Date(c.start_date),zone),end=getLocalTime(new Date(c.end_date),zone);
 const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const lower=date===start.dateStr?minute(start.timeStr):0;
 const upper=date===end.dateStr?minute(end.timeStr)-1:1439;
 if(upper<lower)return [];
 const current=minute(time);
 return (['morning','evening'] as PostSlot[]).filter(slot=>{
   const target=Math.min(upper,Math.max(lower,slot==='morning'?480:1200));
   return current>=target && current<target+30 && current<=upper;
 });
}

export function postDate(date:Date|string,timezone='Africa/Nairobi'):string {
 return new Date(date).toLocaleString('en-US',{timeZone:timezone,month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
}
