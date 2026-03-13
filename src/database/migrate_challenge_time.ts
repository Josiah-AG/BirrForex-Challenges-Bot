import { db } from './db';

async function migrateChallengeTime() {
  try {
    console.log('Adding challenge_time column to challenges table...');
    
    await db.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS challenge_time TIME DEFAULT '20:00:00'
    `);
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrateChallengeTime();
