import { db } from '../database/db';
import { config } from '../config';

export const reminderDay = (date: Date, zone: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
export function reminderDue(start: Date, close: Date, now: Date, zone: string, used: string[] = []) {
  if (![start, close, now].every(d => Number.isFinite(+d)) || +now >= +close || +now < +start + 3600000) return null;
  // Midnight closure belongs to the preceding registration day.
  if (reminderDay(now, zone) === reminderDay(new Date(+close - 1), zone)) return used.includes('final') ? null : 'final';
  for (const hours of [72, 24, 1]) {
    const due = new Date(+start + hours * 3600000);
    // Missed days never create a backlog of stale reminders.
    if (+now >= +due && reminderDay(now, zone) === reminderDay(due, zone)) return used.includes(`${hours}h`) ? null : `${hours}h`;
  }
  return null;
}

export async function migrateRegistrationReminders() {
  await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS registration_started_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE trading_failed_attempts ALTER COLUMN registration_started_at SET DEFAULT NOW()`);
  await db.query(`UPDATE trading_failed_attempts SET registration_started_at=attempted_at AT TIME ZONE 'UTC' WHERE registration_started_at IS NULL`);
  await db.query(`CREATE TABLE IF NOT EXISTS registration_reminder_history (
    id BIGSERIAL PRIMARY KEY, challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id), telegram_id BIGINT NOT NULL,
    stage TEXT NOT NULL, day DATE NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    state TEXT NOT NULL DEFAULT 'claimed', sent_at TIMESTAMPTZ, message_id BIGINT,
    UNIQUE(challenge_id,telegram_id,stage), UNIQUE(telegram_id,day)
  )`);
  // Preserve the latest legacy delivery day on upgrade; never resend on that day.
  await db.query(`INSERT INTO registration_reminder_history(challenge_id,telegram_id,stage,day,state,sent_at)
    SELECT DISTINCT ON (fa.telegram_id, ((fa.last_engaged_at AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(c.timezone,$1))::date)
      fa.challenge_id,fa.telegram_id,'legacy',((fa.last_engaged_at AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(c.timezone,$1))::date,
      'legacy',fa.last_engaged_at AT TIME ZONE 'UTC'
    FROM trading_failed_attempts fa JOIN trading_challenges c ON c.id=fa.challenge_id
    WHERE fa.last_engaged_at IS NOT NULL ON CONFLICT DO NOTHING`, [config.timezone]);
}

export async function startRegistrationReminders(challengeId: number, userId: number, username: string | null) {
  await db.query(`INSERT INTO trading_failed_attempts(challenge_id,telegram_id,username,failure_type,registration_started_at)
    SELECT id,$2,$3,'abandoned',NOW() FROM trading_challenges c
    WHERE id=$1 AND status='registration_open' AND NOT COALESCE(configuration_frozen_at IS NOT NULL,false)
      AND NOW()<LEAST(COALESCE(registration_deadline,start_date),start_date)
      AND NOT EXISTS(SELECT 1 FROM wp_current_registrations r WHERE r.challenge_id=c.id AND r.user_id=$2 AND r.status IS DISTINCT FROM 'removed')
    ON CONFLICT(challenge_id,telegram_id) DO NOTHING`,[challengeId,userId,username]);
}

async function eligible(challengeId: number, userId: number) {
  return (await db.query(`SELECT fa.*,c.title,c.timezone,LEAST(COALESCE(c.registration_deadline,c.start_date),c.start_date) AS closes_at
    FROM trading_failed_attempts fa JOIN trading_challenges c ON c.id=fa.challenge_id
    WHERE fa.challenge_id=$1 AND fa.telegram_id=$2 AND fa.converted=false AND c.status='registration_open'
      AND c.host_id IS NULL AND c.source IS DISTINCT FROM 'discord' AND c.configuration_frozen_at IS NULL
      AND NOW()<LEAST(COALESCE(c.registration_deadline,c.start_date),c.start_date)
      AND NOT EXISTS(SELECT 1 FROM wp_current_registrations r WHERE r.challenge_id=c.id AND r.user_id=fa.telegram_id AND r.status IS DISTINCT FROM 'removed')`,[challengeId,userId])).rows[0];
}

/** Commit a durable claim BEFORE Telegram. Ambiguous network failures are not retried:
 * Telegram has no idempotency key, so retrying could send the same DM twice. */
export async function deliverRegistrationReminder(challengeId: number, userId: number,
  send: (user: any, stage: string) => Promise<{message_id: number}>) {
  const claim = await db.transaction(async () => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`registration-reminder:${userId}`]);
    const user = await eligible(challengeId,userId);
    if (!user) return null;
    const history=(await db.query('SELECT stage FROM registration_reminder_history WHERE challenge_id=$1 AND telegram_id=$2',[challengeId,userId])).rows;
    const used=history.map(r=>r.stage);
    // Old count is retained only until the new ledger takes over; no replay after deployment.
    if (used.includes('legacy')) used.push(...['1h','24h','72h'].slice(0,Math.min(3,user.engage_count || 0)));
    const now=new Date(), zone=user.timezone || config.timezone;
    if (user.last_engaged_at && reminderDay(new Date(user.last_engaged_at),zone) === reminderDay(now,zone)) return null;
    const stage=reminderDue(new Date(user.registration_started_at),new Date(user.closes_at),now,zone,used);
    if (!stage) return null;
    const row=(await db.query(`INSERT INTO registration_reminder_history(challenge_id,telegram_id,stage,day)
      VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,[challengeId,userId,stage,reminderDay(now,zone)])).rows[0];
    return row ? {id:row.id,user,stage} : null;
  });
  if (!claim) return 'skipped';
  const fresh=await eligible(challengeId,userId);
  if (!fresh) {
    await db.query("UPDATE registration_reminder_history SET state='cancelled' WHERE id=$1",[claim.id]);
    return 'cancelled';
  }
  try {
    const message=await send(fresh,claim.stage);
    await db.query("UPDATE registration_reminder_history SET state='sent',sent_at=NOW(),message_id=$2 WHERE id=$1",[claim.id,message.message_id]);
    await db.query('UPDATE trading_failed_attempts SET engaged=true,last_engaged_at=NOW(),engage_successful=true WHERE challenge_id=$1 AND telegram_id=$2',[challengeId,userId]);
    return 'sent';
  } catch(error) {
    await db.query("UPDATE registration_reminder_history SET state='uncertain' WHERE id=$1 AND state='claimed'",[claim.id]);
    console.error('Registration reminder delivery failed; durable claim retained', {challengeId,userId});
    return 'failed';
  }
}
