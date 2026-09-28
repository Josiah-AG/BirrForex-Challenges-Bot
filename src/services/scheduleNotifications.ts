import { db } from '../database/db';
import { config } from '../config';
import { emailService } from './emailService';
import { formatInTimezone } from '../utils/timezone';
const escape = (v: any) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Approval rows double as a durable outbox. Failed deliveries are retried after restart. */
export async function deliverScheduleNotifications(telegram: any): Promise<void> {
  await db.transaction(async()=>{
    const lock=await db.query('SELECT pg_try_advisory_xact_lock(26092802) AS locked');
    if(!lock.rows[0]?.locked)return;
    const rows=await db.query(`SELECT * FROM challenge_approvals WHERE kind='schedule_change' AND
      ((state='pending' AND message_id IS NULL) OR (state IN ('approved','rejected') AND COALESCE(payload->>'emailSent','false')!='true')) ORDER BY created_at LIMIT 10`);
    for(const row of rows.rows){
      const d=row.payload;
      try {
        const host=await db.query('SELECT email,display_name FROM hosts WHERE id=$1',[d.hostId]);
        const tz=d.fields.timezone || d.baseline.timezone || 'Africa/Addis_Ababa';
        const fmt=(value:any)=>value ? escape(formatInTimezone(value,tz)) : 'At challenge start';
        const dates=['start_date','end_date','registration_deadline'].map(k=>`${k==='start_date'?'Challenge start':k==='end_date'?'Challenge end':'Registration closes'}: ${fmt(d.baseline[k])} → ${fmt(d.fields[k] ?? d.baseline[k])}`).join('\n');
        if(row.state==='pending'){
          if(!telegram)continue;
          const extras=Object.keys(d.fields).filter(k=>!['start_date','end_date','registration_deadline','timezone'].includes(k));
          const msg=await telegram.sendMessage(config.adminUserId,
            `<b>Host schedule change</b>\n${escape(d.title)} (#${d.challengeId})\nHost: ${escape(host.rows[0]?.display_name)}\nTimezone: ${escape(tz)}\n\n${dates}\n${extras.length ? '\nOther settings submitted:\n'+extras.map(k=>escape(k)+': '+escape(JSON.stringify(d.fields[k]))).join('\n') : ''}\nCurrent settings remain active until approved.`,
            {parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Approve schedule',callback_data:`gate_approve_${row.token}`}],[{text:'Reject',callback_data:`gate_reject_${row.token}`}]]}});
          await db.query('UPDATE challenge_approvals SET message_id=$2 WHERE token=$1',[row.token,msg.message_id]);
        }else if(host.rows[0]?.email){
          const approved=row.state==='approved';
          const sent=await emailService.sendGeneric(host.rows[0].email,`Schedule ${approved?'approved':'rejected'} — ${d.title}`,
            `<h2>Schedule change ${approved?'approved':'rejected'}</h2><p>Hi ${escape(host.rows[0].display_name)},</p><p>${escape(d.title)}: ${approved?'The approved schedule has been applied.':'Your request was rejected. The existing schedule has not been changed by this request.'}</p><p>Requested schedule (${escape(tz)}):</p><p>${dates.replace(/\n/g,'<br>')}</p><p><a href="https://winnerpip.com/host/dashboard">View your challenge</a></p>`, `schedule-${row.token}-${row.state}`);
          if(sent)await db.query(`UPDATE challenge_approvals SET payload=jsonb_set(payload,'{emailSent}','true'::jsonb) WHERE token=$1`,[row.token]);
        }
      }catch(e){console.error('Schedule notification retry pending:',row.token,(e as Error).message);}
    }
  });
}
