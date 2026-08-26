import { db } from '../database/db';
import bcrypt from 'bcrypt';
import { generateIV, encrypt, decrypt } from '../utils/encryption';

export interface Host {
  id: number;
  display_name: string;
  email: string;
  has_broker_integration: boolean;
  active: boolean;
  max_concurrent_challenges: number;
  created_at: Date;
  last_login_at: Date | null;
}

export interface HostWithStats extends Host {
  active_challenges: number;
  total_challenges: number;
  total_logins: number;
  last_login_ip: string | null;
}

const SALT_ROUNDS = 12;

class HostService {

  /**
   * Create a new host account
   */
  async createHost(data: {
    displayName: string;
    email: string;
    password: string;
  }): Promise<Host> {
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const result = await db.query(
      `INSERT INTO hosts (display_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, display_name, email, has_broker_integration, active, max_concurrent_challenges, created_at, last_login_at`,
      [data.displayName, data.email.toLowerCase().trim(), passwordHash]
    );

    return result.rows[0];
  }

  /**
   * Get host by ID
   */
  async getHostById(id: number): Promise<Host | null> {
    const result = await db.query(
      `SELECT id, display_name, email, has_broker_integration, active, max_concurrent_challenges, created_at, last_login_at
       FROM hosts WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get host by email (for login)
   */
  async getHostByEmail(email: string): Promise<{ id: number; display_name: string; email: string; password_hash: string; active: boolean } | null> {
    const result = await db.query(
      `SELECT id, display_name, email, password_hash, active FROM hosts WHERE email = $1`,
      [email.toLowerCase().trim()]
    );
    return result.rows[0] || null;
  }

  /**
   * Verify host password
   */
  async verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }

  /**
   * Get all hosts with stats (for admin management)
   */
  async getAllHostsWithStats(): Promise<HostWithStats[]> {
    const result = await db.query(
      `SELECT h.id, h.display_name, h.email, h.has_broker_integration, h.active,
              h.max_concurrent_challenges, h.created_at, h.last_login_at, h.contact_link, h.support_link, h.main_link,
              COALESCE(c_active.cnt, 0) as active_challenges,
              COALESCE(c_total.cnt, 0) as total_challenges,
              COALESCE(l.cnt, 0) as total_logins,
              l_last.ip_address as last_login_ip
       FROM hosts h
       LEFT JOIN (SELECT host_id, COUNT(*) as cnt FROM trading_challenges WHERE status IN ('active', 'registration_open') GROUP BY host_id) c_active ON h.id = c_active.host_id
       LEFT JOIN (SELECT host_id, COUNT(*) as cnt FROM trading_challenges WHERE host_id IS NOT NULL GROUP BY host_id) c_total ON h.id = c_total.host_id
       LEFT JOIN (SELECT host_id, COUNT(*) as cnt FROM host_login_history GROUP BY host_id) l ON h.id = l.host_id
       LEFT JOIN LATERAL (SELECT ip_address FROM host_login_history WHERE host_id = h.id ORDER BY login_at DESC LIMIT 1) l_last ON true
       ORDER BY h.created_at DESC`
    );
    return result.rows;
  }

  /**
   * Update host display name
   */
  async updateDisplayName(hostId: number, displayName: string): Promise<void> {
    await db.query(`UPDATE hosts SET display_name = $1 WHERE id = $2`, [displayName, hostId]);
  }

  /**
   * Reset host password
   */
  async resetPassword(hostId: number, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query(`UPDATE hosts SET password_hash = $1 WHERE id = $2`, [passwordHash, hostId]);
  }

  /**
   * Activate/deactivate host
   */
  async setActive(hostId: number, active: boolean): Promise<void> {
    await db.query(`UPDATE hosts SET active = $1 WHERE id = $2`, [active, hostId]);
  }

  /**
   * Delete host (cascade deletes login history, nullifies challenge host_id)
   */
  async deleteHost(hostId: number): Promise<void> {
    await db.query(`DELETE FROM hosts WHERE id = $1`, [hostId]);
  }

  /**
   * Set broker integration credentials (encrypted)
   */
  async setBrokerCredentials(hostId: number, data: {
    brokerEmail: string;
    brokerPassword: string;
    brokerApiKey: string;
  }): Promise<void> {
    const iv = generateIV();
    const encEmail = encrypt(data.brokerEmail, iv);
    const encPassword = encrypt(data.brokerPassword, iv);
    const encApiKey = encrypt(data.brokerApiKey, iv);

    await db.query(
      `UPDATE hosts SET
        has_broker_integration = true,
        broker_email_encrypted = $1,
        broker_password_encrypted = $2,
        broker_api_key_encrypted = $3,
        encryption_iv = $4
       WHERE id = $5`,
      [encEmail, encPassword, encApiKey, iv, hostId]
    );
  }

  /**
   * Get decrypted broker credentials (only call when needed for allocation check)
   */
  async getBrokerCredentials(hostId: number): Promise<{ email: string; password: string; apiKey: string } | null> {
    const result = await db.query(
      `SELECT broker_email_encrypted, broker_password_encrypted, broker_api_key_encrypted, encryption_iv
       FROM hosts WHERE id = $1 AND has_broker_integration = true`,
      [hostId]
    );

    if (!result.rows[0] || !result.rows[0].encryption_iv) return null;

    const row = result.rows[0];
    try {
      return {
        email: decrypt(row.broker_email_encrypted, row.encryption_iv),
        password: decrypt(row.broker_password_encrypted, row.encryption_iv),
        apiKey: decrypt(row.broker_api_key_encrypted, row.encryption_iv),
      };
    } catch (error) {
      console.error(`Failed to decrypt broker credentials for host ${hostId}:`, error);
      return null;
    }
  }

  /**
   * Remove broker integration
   */
  async removeBrokerCredentials(hostId: number): Promise<void> {
    await db.query(
      `UPDATE hosts SET
        has_broker_integration = false,
        broker_email_encrypted = NULL,
        broker_password_encrypted = NULL,
        broker_api_key_encrypted = NULL,
        encryption_iv = NULL
       WHERE id = $1`,
      [hostId]
    );
  }

  /**
   * Record login (for audit trail)
   */
  async recordLogin(hostId: number, ipAddress: string, userAgent: string): Promise<void> {
    await db.query(
      `INSERT INTO host_login_history (host_id, ip_address, user_agent) VALUES ($1, $2, $3)`,
      [hostId, ipAddress, userAgent || '']
    );
    await db.query(`UPDATE hosts SET last_login_at = NOW() WHERE id = $1`, [hostId]);
  }

  /**
   * Get login history for a host
   */
  async getLoginHistory(hostId: number, limit: number = 20): Promise<any[]> {
    const result = await db.query(
      `SELECT login_at, ip_address, user_agent FROM host_login_history
       WHERE host_id = $1 ORDER BY login_at DESC LIMIT $2`,
      [hostId, limit]
    );
    return result.rows;
  }

  /**
   * Get challenges owned by a host
   */
  async getHostChallenges(hostId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT id, title, type, status, start_date, end_date, starting_balance, target_balance,
              deposit_mode, target_percent, timezone, registration_mode, created_at
       FROM trading_challenges
       WHERE host_id = $1
       ORDER BY created_at DESC`,
      [hostId]
    );
    return result.rows;
  }
}

export const hostService = new HostService();
