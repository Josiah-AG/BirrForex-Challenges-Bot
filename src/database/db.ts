import { AsyncLocalStorage } from 'async_hooks';
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';

class Database {
  private pool: Pool;
  private context = new AsyncLocalStorage<PoolClient>();

  constructor() {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }

  async query(text: string, params?: any[]): Promise<QueryResult> {
    const start = Date.now();
    try {
      const result = await (this.context.getStore() || this.pool).query(text, params);
      const duration = Date.now() - start;
      
      // Only log query details in development, sanitize in production
      if (process.env.NODE_ENV !== 'production') {
        console.log('Executed query', { text, duration, rows: result.rowCount });
      } else {
        // In production, only log query type and performance metrics
        const queryType = text.trim().split(' ')[0].toUpperCase();
        console.log('Query executed', { type: queryType, duration, rows: result.rowCount });
      }
      
      return result;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Database query error:', error);
      } else {
        // Log error message (not the query text) so we can diagnose in Railway logs
        console.error('Database query failed:', (error as any)?.message || String(error));
      }
      throw error;
    }
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.context.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async close() {
    await this.pool.end();
  }
}

export const db = new Database();
