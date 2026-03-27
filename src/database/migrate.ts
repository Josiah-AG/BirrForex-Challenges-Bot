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
