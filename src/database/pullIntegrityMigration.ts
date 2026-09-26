import { db } from './db';

/** Additive only: no historical balances, trades or rankings are rewritten. */
export async function migratePullIntegrity() {
  await db.query(`
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS reconciliation_status TEXT;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_verified_through TIMESTAMPTZ;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_verified_balance NUMERIC;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_verified_at TIMESTAMPTZ;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_published_at TIMESTAMPTZ;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_sync_state TEXT;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_sync_error TEXT;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_retry_at TIMESTAMPTZ;
    ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS history_retry_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS commission NUMERIC;
    ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS swap NUMERIC;
    ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS fee NUMERIC;
    ALTER TABLE wp_deals ADD COLUMN IF NOT EXISTS time_msc BIGINT;
    CREATE TABLE IF NOT EXISTS wp_pull_operations (
      id BIGSERIAL PRIMARY KEY, release_id TEXT NOT NULL, registration_id INTEGER NOT NULL, challenge_id INTEGER NOT NULL,
      transaction_id BIGINT NOT NULL, before_state JSONB NOT NULL, after_state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), restored_at TIMESTAMPTZ,
      UNIQUE(release_id,registration_id,transaction_id)
    );
    CREATE TABLE IF NOT EXISTS wp_history_snapshots (
      id BIGSERIAL PRIMARY KEY, registration_id INTEGER NOT NULL, challenge_id INTEGER NOT NULL,
      request_id TEXT NOT NULL UNIQUE, source_cutoff TIMESTAMPTZ NOT NULL,
      balance NUMERIC NOT NULL, history_digest TEXT NOT NULL, history_count INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'verified', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      published_at TIMESTAMPTZ, terminal_id INTEGER, before_state JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wp_account_publications (
      registration_id INTEGER PRIMARY KEY, challenge_id INTEGER NOT NULL,
      trades JSONB NOT NULL, balance_ops JSONB NOT NULL, published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE wp_account_publications ADD COLUMN IF NOT EXISTS registration_state JSONB;
    CREATE OR REPLACE FUNCTION wp_visible_trades_for(reg_id integer) RETURNS SETOF wp_trades LANGUAGE sql STABLE AS $f$
      SELECT t.* FROM wp_trades t WHERE t.registration_id=reg_id AND NOT EXISTS(SELECT 1 FROM wp_account_publications p WHERE p.registration_id=reg_id)
      UNION ALL SELECT t.* FROM wp_account_publications p CROSS JOIN LATERAL jsonb_populate_recordset(NULL::wp_trades,p.trades) t WHERE p.registration_id=reg_id
    $f$;
    CREATE OR REPLACE FUNCTION wp_visible_balance_ops_for(reg_id integer) RETURNS SETOF wp_balance_ops LANGUAGE sql STABLE AS $f$
      SELECT o.* FROM wp_balance_ops o WHERE o.registration_id=reg_id AND NOT EXISTS(SELECT 1 FROM wp_account_publications p WHERE p.registration_id=reg_id)
      UNION ALL SELECT o.* FROM wp_account_publications p CROSS JOIN LATERAL jsonb_populate_recordset(NULL::wp_balance_ops,p.balance_ops) o WHERE p.registration_id=reg_id
    $f$;
    CREATE OR REPLACE VIEW wp_visible_trades AS
      SELECT t.* FROM wp_trades t WHERE NOT EXISTS (SELECT 1 FROM wp_account_publications p WHERE p.registration_id=t.registration_id)
      UNION ALL
      SELECT t.* FROM wp_account_publications p CROSS JOIN LATERAL jsonb_populate_recordset(NULL::wp_trades,p.trades) t;
    CREATE OR REPLACE VIEW wp_visible_balance_ops AS
      SELECT o.* FROM wp_balance_ops o WHERE NOT EXISTS (SELECT 1 FROM wp_account_publications p WHERE p.registration_id=o.registration_id)
      UNION ALL
      SELECT o.* FROM wp_account_publications p CROSS JOIN LATERAL jsonb_populate_recordset(NULL::wp_balance_ops,p.balance_ops) o;
    CREATE INDEX IF NOT EXISTS wp_history_snapshots_registration ON wp_history_snapshots(registration_id,id DESC);
    CREATE INDEX IF NOT EXISTS registration_history_retry ON trading_registrations(history_retry_at)
      WHERE history_sync_state IN ('incomplete','verified','evaluation_failed');
  `);
}
