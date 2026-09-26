import { readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';
import { db } from './db';

/** Additive, required schema. No score/data rewrite on startup. */
export async function migrateHardening(): Promise<void> {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(26092601)');
    await client.query('ALTER TABLE wp_pull_batches ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMPTZ');
    await client.query('ALTER TABLE hosts ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0');
    await client.query('ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS configuration_frozen_at TIMESTAMPTZ');
    await client.query(`CREATE TABLE IF NOT EXISTS challenge_approvals (
      token TEXT PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ, message_id BIGINT, result JSONB
    )`);
    await client.query('ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS disqualified_source TEXT');
    await client.query('ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS credential_failure_detected_at TIMESTAMPTZ');
    await client.query('ALTER TABLE wp_trades ADD COLUMN IF NOT EXISTS position_max_volume NUMERIC');
    await client.query(`CREATE TABLE IF NOT EXISTS challenge_pull_jobs (
      id BIGSERIAL PRIMARY KEY, challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id),
      slot TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), error TEXT,
      UNIQUE(challenge_id,slot)
    )`);
    await client.query('ALTER TABLE challenge_pull_jobs ADD COLUMN IF NOT EXISTS override_lock BOOLEAN NOT NULL DEFAULT false');
    await client.query('ALTER TABLE challenge_pull_jobs ADD COLUMN IF NOT EXISTS include_disqualified BOOLEAN NOT NULL DEFAULT false');
    await client.query('ALTER TABLE challenge_pull_jobs ADD COLUMN IF NOT EXISTS full_history BOOLEAN NOT NULL DEFAULT false');
    await client.query('ALTER TABLE wp_leaderboard ADD COLUMN IF NOT EXISTS previous_rank INTEGER');
    await client.query(`CREATE TABLE IF NOT EXISTS challenge_result_snapshots (
      id BIGSERIAL PRIMARY KEY,challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reason TEXT NOT NULL,winners JSONB NOT NULL
    )`);
    await client.query(readFileSync(join(__dirname,'hardening_guards.sql'),'utf8'));
    await client.query('ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS position_id BIGINT');
    await client.query('ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS entry INTEGER');
    await client.query('ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS funding_origin TEXT');
    await client.query(`CREATE TABLE IF NOT EXISTS credential_recovery_jobs (
      registration_id INTEGER PRIMARY KEY REFERENCES trading_registrations(id),
      challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id), source TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS challenge_lifecycle_events (
      id BIGSERIAL PRIMARY KEY,challenge_id INTEGER NOT NULL REFERENCES trading_challenges(id),destination TEXT NOT NULL,
      payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ,error TEXT,
      UNIQUE(challenge_id,destination)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS challenge_lifecycle_deliveries (
      event_id BIGINT NOT NULL REFERENCES challenge_lifecycle_events(id),recipient TEXT NOT NULL,sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(event_id,recipient)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const registrationIndexes=await client.query("SELECT 1 FROM app_schema_migrations WHERE name='active_registration_identity_v1'");
    if(!registrationIndexes.rows.length){
      await client.query('ALTER TABLE trading_registrations DROP CONSTRAINT IF EXISTS trading_registrations_challenge_id_email_key');
      await client.query('ALTER TABLE trading_registrations DROP CONSTRAINT IF EXISTS trading_registrations_challenge_id_user_id_key');
      await client.query('DROP INDEX IF EXISTS idx_tr_challenge_nickname');
      await client.query(`CREATE UNIQUE INDEX idx_tr_challenge_nickname ON trading_registrations(challenge_id,lower(trim(nickname))) WHERE nickname IS NOT NULL AND status IS DISTINCT FROM 'removed'`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS wp_active_registration_email ON trading_registrations(challenge_id,lower(trim(email))) WHERE email IS NOT NULL AND trim(email)<>'' AND status IS DISTINCT FROM 'removed'`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS wp_active_registration_user ON trading_registrations(challenge_id,user_id) WHERE user_id IS NOT NULL AND status IS DISTINCT FROM 'removed'`);
      await client.query("INSERT INTO app_schema_migrations(name) VALUES('active_registration_identity_v1')");
    }
    // Recover pre-upgrade host requests that lived only in process memory.
    const orphaned=await client.query(`SELECT id,title,type,host_id FROM trading_challenges c WHERE status='pending_approval'
      AND NOT EXISTS(SELECT 1 FROM challenge_approvals a WHERE a.kind='create' AND a.state='pending' AND a.payload->>'challenge_id'=c.id::text) FOR UPDATE`);
    for(const challenge of orphaned.rows)await client.query(`INSERT INTO challenge_approvals(token,kind,payload) VALUES($1,'create',$2)`,
      [randomBytes(16).toString('hex'),JSON.stringify({already_inserted:true,challenge_id:challenge.id,title:challenge.title,type:challenge.type,host_id:challenge.host_id,recovered_by:'2026-09-26-hardening'})]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
