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
      // Also drop the long-named constraint from previous migration attempt
      await db.query(`ALTER TABLE trading_screening_results DROP CONSTRAINT IF EXISTS trading_screening_results_challenge_id_screening_date_scree_key;`).catch(() => {});
      // Add new unique constraint — simple approach, catch if already exists
      await db.query(`ALTER TABLE trading_screening_results ADD CONSTRAINT tsr_challenge_date_mode_key UNIQUE (challenge_id, screening_date, screening_mode);`).catch((e: any) => {
        // Constraint already exists — that's fine
        if (!e.message?.includes('already exists')) {
          console.error('Constraint migration note:', e.message);
        }
      });
      console.log('✅ Trading schema migrations OK');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log('⏭️ Trading schema file not found, skipping');
      } else {
        throw err;
      }
    }

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
