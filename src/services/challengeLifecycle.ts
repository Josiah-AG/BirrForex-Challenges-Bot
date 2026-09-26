import { db } from '../database/db';
import { config } from '../config';
import { formatInTimezone } from '../utils/timezone';

/** Durable per-recipient delivery; no external calls occur inside status transactions. */
export async function deliverLifecycleEvents(telegram: any): Promise<void> {
  const lease=await db.getClient();
  let acquired=false;
  try {
    acquired=(await lease.query('SELECT pg_try_advisory_lock(26092605,0) AS locked')).rows[0].locked;
    if(!acquired)return;
    const events=await db.query(`SELECT * FROM challenge_lifecycle_events WHERE completed_at IS NULL ORDER BY id LIMIT 10`);
    for(const event of events.rows){
      try {
        const c=event.payload,started=event.destination==='active';
        const deliver=async(key:string,send:()=>Promise<any>)=>{
          const previous=await db.query('SELECT 1 FROM challenge_lifecycle_deliveries WHERE event_id=$1 AND recipient=$2',[event.id,key]);
          if(previous.rows.length)return;
          const result=await send();
          if(result===false)throw new Error(`Lifecycle delivery failed: ${key}`);
          await db.query('INSERT INTO challenge_lifecycle_deliveries(event_id,recipient) VALUES($1,$2) ON CONFLICT DO NOTHING',[event.id,key]);
        };
        const text=started ? `🚀 ${c.title} has started. Follow your progress on WinnerPip. Ends ${formatInTimezone(c.end_date,c.timezone)}.` : `🏁 ${c.title} has ended. Final history synchronization and evaluation are in progress.`;
        if(!c.host_id && c.source!=='discord'){
          for(const channel of new Set([config.mainChannelId,config.challengeChannelId]))await deliver(`telegram:${channel}`,()=>telegram.sendMessage(channel,text));
        }
        if(c.source==='discord' && process.env.DISCORD_CHALLENGE_WEBHOOK){
          await deliver('discord',()=>require('axios').post(process.env.DISCORD_CHALLENGE_WEBHOOK,{content:text,allowed_mentions:{parse:[]}},{timeout:10000}));
        }
        if(process.env.RESEND_API_KEY){
          const registrations=await db.query(`SELECT id,email,nickname FROM trading_registrations WHERE challenge_id=$1
            AND source IN ('winnerpip','csv') AND email IS NOT NULL AND status IS DISTINCT FROM 'removed' AND disqualified=false`,[c.id]);
          const {emailService}=require('./emailService');
          for(const r of registrations.rows)await deliver(`email:${r.id}`,()=>started
            ? emailService.sendChallengeStarted(r.email,{nickname:r.nickname,challengeTitle:c.title,endDate:formatInTimezone(c.end_date,c.timezone)})
            : emailService.sendChallengeEnded(r.email,{nickname:r.nickname,challengeTitle:c.title}));
        }
        await deliver('admin',()=>telegram.sendMessage(config.adminUserId,`${text}\nChallenge ID: ${c.id}. Update queued.`));
        await db.query('UPDATE challenge_lifecycle_events SET completed_at=NOW(),error=NULL WHERE id=$1',[event.id]);
      }catch(error){await db.query('UPDATE challenge_lifecycle_events SET error=$2 WHERE id=$1',[event.id,(error as Error).message]);}
    }
  } finally {if(acquired)await lease.query('SELECT pg_advisory_unlock(26092605,0)');lease.release();}
}
