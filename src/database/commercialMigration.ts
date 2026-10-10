import {db} from './db';
export async function migrateCommercial() {
  await db.query(`CREATE TABLE IF NOT EXISTS wp_commercial_coverage (
    registration_id INTEGER PRIMARY KEY REFERENCES trading_registrations(id),
    challenge_id INTEGER NOT NULL, cutoff TIMESTAMPTZ NOT NULL,
    trades JSONB NOT NULL DEFAULT '[]', captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS wp_commercial_reports (
    challenge_id INTEGER PRIMARY KEY REFERENCES trading_challenges(id),
    scope TEXT, report JSONB, scanned_through TIMESTAMPTZ,
    updated_at TIMESTAMPTZ, started_at TIMESTAMPTZ, error TEXT);
    CREATE TABLE IF NOT EXISTS wp_commercial_orders (
    challenge_id INTEGER NOT NULL, scope TEXT NOT NULL, account TEXT NOT NULL,
    order_id TEXT NOT NULL, partner_account TEXT NOT NULL, data JSONB NOT NULL,
    PRIMARY KEY(challenge_id,scope,account,order_id,partner_account));`);
}
