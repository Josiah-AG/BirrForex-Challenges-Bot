import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './db';

async function migrate() {
  try {
    console.log('Running database migration...');
    
    // Run weekly quiz schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    await db.query(schema);
    console.log('✅ Weekly quiz schema OK');

    // Run trading challenge schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
    const tradingSchemaPath = join(__dirname, 'trading_schema.sql');
    try {
      const tradingSchema = readFileSync(tradingSchemaPath, 'utf-8');
      await db.query(tradingSchema);
      console.log('✅ Trading challenge schema OK');

      // Add prize_pool_text column if missing (safe migration for existing DBs)
      await db.query(`
        ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS prize_pool_text TEXT;
      `).catch(() => { /* column already exists or table doesn't exist yet */ });
      // Add screenshot_link column if missing
      await db.query(`
        ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS screenshot_link TEXT;
      `).catch(() => { /* column already exists */ });
      await db.query(`
        ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS screenshot_message_id INTEGER;
      `).catch(() => { /* column already exists */ });
      await db.query(`
        ALTER TABLE trading_daily_stats ADD COLUMN IF NOT EXISTS allocation_recoveries INTEGER DEFAULT 0;
      `).catch(() => {});
      await db.query(`
        ALTER TABLE trading_daily_stats ADD COLUMN IF NOT EXISTS kyc_recoveries INTEGER DEFAULT 0;
      `).catch(() => {});
      await db.query(`
        ALTER TABLE trading_daily_stats ADD COLUMN IF NOT EXISTS real_acct_recoveries INTEGER DEFAULT 0;
      `).catch(() => {});
      // Failed attempts table columns
      await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS engage_count INTEGER DEFAULT 0;`).catch(() => {});
      await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS last_engaged_at TIMESTAMP;`).catch(() => {});
      await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS engage_successful BOOLEAN DEFAULT false;`).catch(() => {});
      await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS converted BOOLEAN DEFAULT false;`).catch(() => {});
      await db.query(`ALTER TABLE trading_failed_attempts ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;`).catch(() => {});
      // Partner screening columns on registrations
      await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS partner_status VARCHAR(30);`).catch(() => {});
      await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS partner_warned_at TIMESTAMP;`).catch(() => {});
      await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS disqualified BOOLEAN DEFAULT false;`).catch(() => {});
      await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS disqualified_at TIMESTAMP;`).catch(() => {});
      await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS disqualified_reason TEXT;`).catch(() => {});
      // Screening results extra columns
      await db.query(`ALTER TABLE trading_screening_results ADD COLUMN IF NOT EXISTS changing_users JSONB;`).catch(() => {});
      await db.query(`ALTER TABLE trading_screening_results ADD COLUMN IF NOT EXISTS left_users JSONB;`).catch(() => {});
      await db.query(`ALTER TABLE trading_screening_results ADD COLUMN IF NOT EXISTS cleared_users JSONB;`).catch(() => {});
      await db.query(`ALTER TABLE trading_screening_results ADD COLUMN IF NOT EXISTS report_sent BOOLEAN DEFAULT false;`).catch(() => {});
      // Screening mode column for twice-daily screening (night/day)
      await db.query(`ALTER TABLE trading_screening_results ADD COLUMN IF NOT EXISTS screening_mode VARCHAR(10) DEFAULT 'night';`).catch(() => {});
      // Update unique constraint to include screening_mode (drop old, add new)
      await db.query(`ALTER TABLE trading_screening_results DROP CONSTRAINT IF EXISTS trading_screening_results_challenge_id_screening_date_key;`).catch(() => {});
      await db.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'trading_screening_results_challenge_id_screening_date_scree_key'
          ) THEN
            ALTER TABLE trading_screening_results ADD CONSTRAINT trading_screening_results_challenge_id_screening_date_scree_key UNIQUE (challenge_id, screening_date, screening_mode);
          END IF;
        END $$;
      `).catch(() => {});
      // Evaluation tables (new — CREATE TABLE IF NOT EXISTS in schema handles it)
      // Just ensure indexes and columns exist
      await db.query(`ALTER TABLE trading_evaluations ADD COLUMN IF NOT EXISTS email VARCHAR(500);`).catch(() => {});
      await db.query(`ALTER TABLE trading_evaluations_test ADD COLUMN IF NOT EXISTS email VARCHAR(500);`).catch(() => {});
      await db.query(`CREATE INDEX IF NOT EXISTS idx_te_challenge ON trading_evaluations(challenge_id);`).catch(() => {});
      await db.query(`CREATE INDEX IF NOT EXISTS idx_te_account ON trading_evaluations(account_number);`).catch(() => {});
      await db.query(`CREATE INDEX IF NOT EXISTS idx_te_qualified ON trading_evaluations(challenge_id, is_qualified);`).catch(() => {});
      // Resubmission columns on submissions table
      await db.query(`ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS is_resubmission BOOLEAN DEFAULT false;`).catch(() => {});
      await db.query(`ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMP;`).catch(() => {});
      await db.query(`ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS account_changed BOOLEAN DEFAULT false;`).catch(() => {});
      await db.query(`ALTER TABLE trading_submissions ADD COLUMN IF NOT EXISTS original_account_number VARCHAR(50);`).catch(() => {});
      console.log('✅ Trading schema migrations OK');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('⏭️ Trading schema file not found, skipping');
      } else {
        throw err;
      }
    }

    // Run WinnerPip schema (real-time trade monitoring tables)
    try {
      const wpSchemaPath = join(__dirname, 'wp_schema.sql');
      const wpSchema = readFileSync(wpSchemaPath, 'utf-8');
      await db.query(wpSchema);
      console.log('✅ WinnerPip schema OK');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('⏭️ WinnerPip schema file not found, skipping');
      } else {
        throw err;
      }
    }

    // Nickname & VPS migration (safe to re-run)
    await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);`).catch(() => {});
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tr_challenge_nickname ON trading_registrations(challenge_id, nickname) WHERE nickname IS NOT NULL;`).catch(() => {});
    await db.query(`ALTER TABLE wp_leaderboard ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);`).catch(() => {});
    // Challenge rules unique constraint for upsert
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wp_rules_challenge_code ON wp_challenge_rules(challenge_id, rule_code);`).catch(() => {});
    console.log('✅ Nickname & rules migration OK');

    // Evaluation type & winners_posted_at migration
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS evaluation_type VARCHAR(20) DEFAULT 'winnerpip';`).catch(() => {});
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS winners_posted_at TIMESTAMP;`).catch(() => {});
    // Backfill: mark old completed/reviewing challenges that already had winners posted
    // If status is 'completed' or 'reviewing' and end_date is more than 7 days ago, assume winners were posted
    await db.query(`
      UPDATE trading_challenges 
      SET winners_posted_at = end_date, status = 'completed'
      WHERE winners_posted_at IS NULL 
        AND status IN ('completed', 'reviewing')
        AND end_date < NOW() - INTERVAL '7 days'
    `).catch(() => {});
    console.log('✅ Evaluation type migration OK');

    // Discord integration migration
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'telegram';`).catch(() => {});
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS team_only BOOLEAN DEFAULT false;`).catch(() => {});
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP;`).catch(() => {});
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS discord_channel_message_id VARCHAR(50);`).catch(() => {});
    await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS discord_user_id BIGINT;`).catch(() => {});
    await db.query(`ALTER TABLE trading_registrations ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'telegram';`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tc_source ON trading_challenges(source);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tc_team_only ON trading_challenges(team_only);`).catch(() => {});
    await db.query(`CREATE INDEX IF NOT EXISTS idx_tr_discord_user ON trading_registrations(discord_user_id);`).catch(() => {});
    console.log('✅ Discord integration migration OK');

    // Leaderboard timing migration (v2 pull scheduler)
    await db.query(`ALTER TABLE trading_challenges ADD COLUMN IF NOT EXISTS leaderboard_updated_at TIMESTAMP;`).catch(() => {});
    console.log('✅ Leaderboard timing migration OK');

    console.log('✅ Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database migration failed');
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error details:', error);
    }
    process.exit(1);
  }
}

migrate();
