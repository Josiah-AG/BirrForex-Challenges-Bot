import {db} from './db';
export async function migrateParticipantNotices(){
 await db.query(`CREATE TABLE IF NOT EXISTS participant_notice_outbox(
   id BIGSERIAL PRIMARY KEY,registration_id INTEGER NOT NULL REFERENCES trading_registrations(id),
   challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id),kind TEXT NOT NULL,event_key TEXT NOT NULL,
   payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   attempts INTEGER NOT NULL DEFAULT 0,error TEXT,sent_at TIMESTAMPTZ,cancelled_at TIMESTAMPTZ,
   UNIQUE(registration_id,kind,event_key))`);
 await db.query(`CREATE INDEX IF NOT EXISTS participant_notices_pending ON participant_notice_outbox(available_at,id) WHERE sent_at IS NULL AND cancelled_at IS NULL`);
 // Queue in the same transaction as the decision. No historical backfill or unsolicited old notices.
 await db.query(`CREATE OR REPLACE FUNCTION queue_registration_notice() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE challenge_status TEXT;
 BEGIN
   IF NEW.status IS NOT DISTINCT FROM 'removed' THEN RETURN NEW; END IF;
   IF NEW.disqualified=true AND OLD.disqualified IS DISTINCT FROM true
      AND NEW.disqualified_source IS DISTINCT FROM 'partner_departure' THEN
     INSERT INTO participant_notice_outbox(registration_id,challenge_id,kind,event_key,payload)
     VALUES(NEW.id,NEW.challenge_id,'disqualified',COALESCE(NEW.disqualified_at::text,clock_timestamp()::text),
       jsonb_build_object('reason',COALESCE(NEW.disqualified_reason,'Rule violation'))) ON CONFLICT DO NOTHING;
   END IF;
   IF NEW.pull_status IN ('password_changed','invalid_credentials') AND NEW.credential_failure_detected_at IS NOT NULL
      AND (OLD.credential_failure_detected_at IS DISTINCT FROM NEW.credential_failure_detected_at
        OR OLD.pull_status IS NULL OR OLD.pull_status NOT IN ('password_changed','invalid_credentials')) THEN
     SELECT status INTO challenge_status FROM trading_challenges WHERE id=NEW.challenge_id;
     IF challenge_status='active' AND NEW.disqualified IS DISTINCT FROM true THEN
       INSERT INTO participant_notice_outbox(registration_id,challenge_id,kind,event_key,payload)
       VALUES(NEW.id,NEW.challenge_id,'credential_failure',NEW.credential_failure_detected_at::text,
         jsonb_build_object('detectedAt',to_char(NEW.credential_failure_detected_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) ON CONFLICT DO NOTHING;
     END IF;
   END IF;
   RETURN NEW;
 END $$`);
 await db.query(`DROP TRIGGER IF EXISTS registration_participant_notice ON trading_registrations;
   CREATE TRIGGER registration_participant_notice AFTER UPDATE ON trading_registrations FOR EACH ROW EXECUTE FUNCTION queue_registration_notice()`);
}
