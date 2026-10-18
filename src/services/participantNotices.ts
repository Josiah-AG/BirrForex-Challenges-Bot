import {db} from '../database/db';
import {dashboardCTA,escapePost,postDate} from '../utils/challengePosts';

export function noticeRecipient(r:any):'telegram'|'email'|'discord'{
  if(r.host_id || r.source==='winnerpip' || r.source==='csv'){
    if(!r.email)throw new Error('Participant has no email address');return 'email';
  }
  if(r.source==='discord'){
    if(!/^\d+$/.test(String(r.user_id)) || BigInt(r.user_id)<=0n)throw new Error('Missing Discord recipient');return 'discord';
  }
  if(r.source && r.source!=='telegram')throw new Error('Unknown participant notification source');
  if(!/^\d+$/.test(String(r.user_id)) || BigInt(r.user_id)<=0n)throw new Error('Missing Telegram recipient');
  return 'telegram';
}
export function noticeIsCurrent(r:any):boolean{
  if(r.registration_status==='removed')return false;
  if(r.kind==='disqualified')return r.disqualified && String(r.payload.reason)===String(r.disqualified_reason || 'Rule violation');
  if(r.kind==='credential_failure')return !r.disqualified && ['password_changed','invalid_credentials'].includes(r.pull_status)
    && +new Date(r.payload.detectedAt)===+new Date(r.credential_failure_detected_at);
  if(r.kind==='credential_recovered')return !['password_changed','invalid_credentials'].includes(r.pull_status) && +new Date(r.event_key)===+new Date(r.connection_verified_at);
  return true;
}
export function noticeText(r:any):{title:string;body:string}{
  const p=r.payload,zone=r.timezone||'Africa/Nairobi';
  let title:string,body:string;
  if(r.kind==='drawdown'){
    title='Daily Drawdown Reached';
    const cap=Number(p.cap).toFixed(2),unit=p.isCent?'USC':'USD';
    const percent=p.percent?` (${Number(p.percent)}% of the day’s opening balance)`:'';
    body=`Your daily loss limit of ${unit} ${cap}${percent} was reached on ${p.day} at ${p.time} (${zone}).\n\nProfits from trades closed after this breach on that challenge date do not count toward your qualified balance. Losses still count. The daily limit resets at midnight in the challenge timezone; other eligibility rules still apply.`;
  }else if(r.kind==='credential_failure'){
    title='Account Access Issue';
    const regularDeadline=+new Date(p.detectedAt)+24*3600000;
    const beforeStart=r.challenge_status==='registration_open';
    const deadline=new Date(beforeStart ? Math.min(regularDeadline,+new Date(r.start_date)) : regularDeadline);
    body=`The broker rejected access to your MT5 account. Please update your investor password or correct your account details.\n\nRestore access by ${postDate(deadline,zone)}. ${beforeStart?'Access must be restored before the challenge starts.':'Your original 24-hour deadline is not extended by reminders.'} Unresolved access will lead to disqualification. If you did not change your password, contact support.`;
  }else if(r.kind==='credential_recovered'){
    title='Account Access Restored';body='Your credentials were verified and your recovered trade history was pulled, evaluated, and published. Check your dashboard for your current qualification and account status.';
  }else{
    title='Registration Disqualified';body=`Your registration has been disqualified.\n\nReason: ${p.reason}\n\nContact your challenge organizer if you believe this is incorrect.`;
  }
  return {title,body:`${title} — ${r.challenge_title}\nAccount: ${r.account_number}\n\n${body}\n\n${dashboardCTA}\nhttps://winnerpip.com/challenge/${r.challenge_id}`};
}
export async function queueParticipantNotice(registrationId:number,challengeId:number,kind:string,key:string,payload:any){
  await db.query(`INSERT INTO participant_notice_outbox(registration_id,challenge_id,kind,event_key,payload)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(registration_id,kind,event_key) DO NOTHING`,[registrationId,challengeId,kind,key,JSON.stringify(payload)]);
}
/** Resolve recipients from the registration, not a worker's cached user ID. Runs after transaction commit. */
export async function deliverParticipantNotices(telegram:any):Promise<void>{
 const client=await db.getClient();let locked=false;
 try{
  locked=(await client.query('SELECT pg_try_advisory_lock(26101102,0) AS locked')).rows[0].locked;if(!locked)return;
  const notices=(await db.query(`SELECT n.*,r.source,r.user_id,r.email,r.account_number,r.status AS registration_status,
    r.disqualified,r.disqualified_reason,r.pull_status,r.credential_failure_detected_at,r.connection_verified_at,c.title AS challenge_title,c.host_id,c.timezone,c.status AS challenge_status,c.start_date
    FROM participant_notice_outbox n JOIN trading_registrations r ON r.id=n.registration_id AND r.challenge_id=n.challenge_id
    JOIN trading_challenges c ON c.id=n.challenge_id
    WHERE n.sent_at IS NULL AND n.cancelled_at IS NULL AND n.available_at<=NOW() ORDER BY n.id LIMIT 25`)).rows;
  for(const r of notices){
   try{
    if(!noticeIsCurrent(r)){await db.query("UPDATE participant_notice_outbox SET cancelled_at=NOW(),error='Superseded' WHERE id=$1",[r.id]);continue;}
    const channel=noticeRecipient(r),text=noticeText(r);
    if(channel==='email'){
      if(!await require('./emailService').emailService.sendGeneric(r.email,text.title,escapePost(text.body).replace(/\n/g,'<br>'),`participant-notice-${r.id}`))throw new Error('Email delivery not accepted');
    }else if(channel==='discord'){
      await db.transaction(async()=>{
        await db.query(`INSERT INTO discord_dm_queue(discord_user_id,registration_id,challenge_id,notification_type,message_title,message_body)
          VALUES($1,$2,$3,$4,$5,$6)`,[String(r.user_id),r.registration_id,r.challenge_id,r.kind,text.title,text.body]);
        await db.query('UPDATE participant_notice_outbox SET sent_at=NOW(),error=NULL WHERE id=$1',[r.id]);
      });continue;
    }else{
      if(!telegram)throw new Error('Telegram unavailable');
      let options:any={link_preview_options:{is_disabled:true}};
      if(r.kind==='credential_failure'){
        const bot=await telegram.getMe();
        options.reply_markup={inline_keyboard:[[{text:'🔑 Update Investor Password',url:`https://t.me/${bot.username}?start=tc_update_password_${r.registration_id}`}]]};
      }
      await telegram.sendMessage(r.user_id,text.body,options);
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    await db.query('UPDATE participant_notice_outbox SET sent_at=NOW(),error=NULL WHERE id=$1',[r.id]);
   }catch(e:any){
    console.error(`Participant notice ${r.id} pending: ${String(e.message||'delivery failed').slice(0,200)}`);
    // Telegram retry_after is honored; blocked/missing chats stay visible, not marked delivered.
    const delay=Math.max(60,Math.min(86400,Number(e?.response?.parameters?.retry_after)||Math.min(3600,60*2**Math.min(6,Number(r.attempts||0)))));
    await db.query(`UPDATE participant_notice_outbox SET attempts=attempts+1,error=$2,available_at=NOW()+($3 * INTERVAL '1 second') WHERE id=$1`,[r.id,String(e.message||'Delivery failed').slice(0,500),delay]);
   }
  }
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(26101102,0)');client.release();}
}
