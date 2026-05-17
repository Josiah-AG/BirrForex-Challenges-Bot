import axios from 'axios';
import { config } from '../config';

export interface VpsVerifyResult {
  success: boolean;
  status: 'connected' | 'invalid_credentials' | 'server_not_found' | 'timeout' | 'api_error';
  message: string;
  balance?: number;
  equity?: number;
  server?: string;
}

export interface VpsAccountInfo {
  login: number;
  server: string;
  balance: number;
  equity: number;
  name?: string;
  leverage?: number;
  currency?: string;
}

/**
 * Known MT5 servers for Exness — used for button selection and fuzzy matching.
 * Grouped by category (Demo/Trial vs Real).
 */
export const MT5_SERVERS = {
  demo: [
    'Exness-MT5Trial2',
    'Exness-MT5Trial3',
    'Exness-MT5Trial4',
    'Exness-MT5Trial5',
    'Exness-MT5Trial6',
    'Exness-MT5Trial7',
    'Exness-MT5Trial8',
    'Exness-MT5Trial9',
    'Exness-MT5Trial10',
    'Exness-MT5Trial11',
    'Exness-MT5Trial12',
    'Exness-MT5Trial13',
    'Exness-MT5Trial14',
  ],
  real: [
    'Exness-MT5Real2',
    'Exness-MT5Real3',
    'Exness-MT5Real4',
    'Exness-MT5Real5',
    'Exness-MT5Real6',
    'Exness-MT5Real7',
    'Exness-MT5Real8',
    'Exness-MT5Real9',
    'Exness-MT5Real10',
    'Exness-MT5Real11',
    'Exness-MT5Real12',
    'Exness-MT5Real13',
    'Exness-MT5Real14',
    'Exness-MT5Real15',
    'Exness-MT5Real16',
    'Exness-MT5Real17',
    'Exness-MT5Real18',
    'Exness-MT5Real19',
    'Exness-MT5Real20',
  ],
};

/**
 * Fuzzy match a user-typed server name against known servers.
 * Returns the best match or null if no reasonable match found.
 */
export function fuzzyMatchServer(input: string, accountType: 'demo' | 'real'): string | null {
  const servers = accountType === 'demo' ? MT5_SERVERS.demo : MT5_SERVERS.real;
  const normalized = input.trim().toLowerCase().replace(/\s+/g, '');

  // Exact match (case-insensitive)
  const exact = servers.find(s => s.toLowerCase() === normalized);
  if (exact) return exact;

  // Try matching just the number at the end
  const numMatch = normalized.match(/(\d+)\s*$/);
  if (numMatch) {
    const num = numMatch[1];
    const prefix = accountType === 'demo' ? 'Exness-MT5Trial' : 'Exness-MT5Real';
    const candidate = `${prefix}${num}`;
    if (servers.includes(candidate)) return candidate;
  }

  // Try partial match — user typed something like "trial9" or "real9" or "mt5trial9"
  const partialMatch = servers.find(s => {
    const sLower = s.toLowerCase().replace(/-/g, '');
    return sLower.includes(normalized) || normalized.includes(sLower);
  });
  if (partialMatch) return partialMatch;

  // Try matching with common typos: "exnesmt5" instead of "exness-mt5"
  const stripped = normalized.replace(/[-_]/g, '');
  const strippedMatch = servers.find(s => {
    const sStripped = s.toLowerCase().replace(/[-_]/g, '');
    return sStripped === stripped;
  });
  if (strippedMatch) return strippedMatch;

  // Levenshtein-based: if distance is small enough, accept it
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  for (const server of servers) {
    const dist = levenshtein(normalized, server.toLowerCase());
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = server;
    }
  }
  // Accept if distance is <= 3 (allows minor typos)
  if (bestDistance <= 3 && bestMatch) return bestMatch;

  return null;
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

class VpsService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.vpsApiUrl;
    this.apiKey = config.vpsApiKey;
  }

  /**
   * Verify MT5 connection via VPS API.
   * Attempts to log in with the provided credentials.
   */
  async verifyConnection(
    accountNumber: string,
    server: string,
    investorPassword: string
  ): Promise<VpsVerifyResult> {
    if (!this.baseUrl || !this.apiKey) {
      console.log('⚠️ VPS API not configured — skipping verification');
      return { success: true, status: 'connected', message: 'VPS verification skipped (not configured)' };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/verify`,
        {
          account: accountNumber,
          server: server,
          password: investorPassword,
          api_key: this.apiKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout — MT5 connections can be slow
        }
      );

      const data = response.data;

      if (data.success) {
        return {
          success: true,
          status: 'connected',
          message: 'Connection verified',
          balance: data.balance,
          equity: data.equity,
          server: data.server || server,
        };
      }

      // API returned success=false — parse error from message
      const errorMsg = (data.message || '').toLowerCase();
      if (errorMsg.includes('authorization failed') || errorMsg.includes('invalid') || errorMsg.includes('password')) {
        return { success: false, status: 'invalid_credentials', message: data.message || 'Invalid credentials' };
      }
      if (errorMsg.includes('server') || errorMsg.includes('not found')) {
        return { success: false, status: 'server_not_found', message: data.message || 'Server not found' };
      }
      if (errorMsg.includes('timeout')) {
        return { success: false, status: 'timeout', message: data.message || 'Connection timed out' };
      }

      return { success: false, status: 'api_error', message: data.message || 'Verification failed' };
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return { success: false, status: 'timeout', message: 'Connection timed out' };
      }
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        if (status === 401 || status === 403) {
          // Could mean invalid credentials or API key issue
          if (data?.error_code?.includes('credentials') || data?.message?.includes('password')) {
            return { success: false, status: 'invalid_credentials', message: data.message || 'Invalid credentials' };
          }
          return { success: false, status: 'api_error', message: 'API authentication error' };
        }
        if (status === 404) {
          return { success: false, status: 'server_not_found', message: data?.message || 'Server not found' };
        }
        if (status === 422) {
          return { success: false, status: 'invalid_credentials', message: data?.message || 'Invalid account details' };
        }
        return { success: false, status: 'api_error', message: data?.message || `API error (${status})` };
      }
      console.error('VPS verify error:', error.message);
      return { success: false, status: 'api_error', message: 'Could not reach VPS API' };
    }
  }

  /**
   * Check if VPS API is reachable
   */
  async healthCheck(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        headers: { 'X-API-Key': this.apiKey },
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const vpsService = new VpsService();
