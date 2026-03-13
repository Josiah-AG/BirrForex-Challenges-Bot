import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './db';

async function migrate() {
  try {
    console.log('Starting database migration...');
    
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Execute migration without logging schema content
    const result = await db.query(schema);
    
    console.log('✅ Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    // Don't expose detailed error information
    console.error('❌ Database migration failed');
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error details:', error);
    }
    process.exit(1);
  }
}

migrate();
