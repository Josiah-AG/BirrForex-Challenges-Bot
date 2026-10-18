import { terminalInventory } from '../utils/terminalInventory';
import axios from '../services/workloadAxios';
import { config } from '../config';

export interface VpsVerifyResult {
  success: boolean;
  status: 'connected' | 'invalid_credentials' | 'server_not_found' | 'timeout' | 'api_error';
  message: string;
  balance?: number;
  equity?: number;
  server?: string;
  currency?: string;
  account_subtype?: string;
  trade_mode?: number;
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

export { MT5_SERVERS, serverChoices, selectedServer } from '../utils/exnessServers';
import { serverChoices, selectedServer } from '../utils/exnessServers';
export function fuzzyMatchServer(input: string, accountType: 'demo' | 'real'): string | null {
  const exact = selectedServer(input, accountType);
  if (exact) return exact;
  const choices = serverChoices(input, accountType);
  return choices.length === 1 ? choices[0] : null;
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
   * Distributes requests across all terminals (random start, round-robin on failure).
   * Only credential/server errors are definitive. Timeout/terminal errors retry on another terminal.
   */
  async verifyConnection(
    accountNumber: string,
    server: string,
    investorPassword: string
  ): Promise<VpsVerifyResult> {
    if (!this.baseUrl || !this.apiKey) {
      console.log('⚠️ VPS API not configured — skipping verification');
      return { success: false, status: 'api_error', message: 'VPS verification is unavailable; registration cannot be confirmed' };
    }

    try {
      // Pick a random starting terminal and try up to 3 different terminals
      const health = await axios.get(`${this.baseUrl}/health`, {timeout:15000});
      const terminalIds = terminalInventory(health.data).healthyIds;
      if(!terminalIds.length)return {success:false,status:'api_error',message:'No healthy VPS terminals available'};
      const maxAttempts = Math.min(3, terminalIds.length);
      const startTerminal = Math.floor(Math.random() * terminalIds.length);
      let lastResult: any = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const terminalId = terminalIds[(startTerminal + attempt) % terminalIds.length];

        try {
          const response = await axios.post(
            `${this.baseUrl}/verify`,
            {
              account: accountNumber,
              server: server,
              password: investorPassword,
              api_key: this.apiKey,
              terminal_id: terminalId,
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 195000, // shared admission + worker execution
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
              currency: data.currency || undefined,
              account_subtype: data.account_subtype || undefined,
              trade_mode: data.trade_mode,
            };
          }

          lastResult = data;

          // Definitive credential/server failure — don't retry on another terminal
          // Check error_type field first (preferred), then fall back to message parsing
          const errorMsg = (data.message || '').toLowerCase();
          if (data.error_type === 'credential_failure' || errorMsg.includes('authorization') || errorMsg.includes('invalid') || errorMsg.includes('password') || errorMsg.includes('credential')) {
            return { success: false, status: 'invalid_credentials', message: data.message || 'Invalid credentials' };
          }
          if (errorMsg.includes('server') || errorMsg.includes('not found')) {
            return { success: false, status: 'server_not_found', message: data.message || 'Server not found' };
          }

          // Terminal/timeout error — retry on next terminal after brief delay
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (innerErr: any) {
          // Network/timeout error for this terminal — try next
          lastResult = { message: innerErr.code === 'ECONNABORTED' ? 'Connection timed out' : (innerErr.response?.data?.message || innerErr.message || 'Connection error') };
          if (innerErr.response) {
            const status = innerErr.response.status;
            const data = innerErr.response.data;
            if (status === 401 || status === 403) {
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
          }
          if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // All attempts failed — parse the final error
      const errorMsg = (lastResult?.message || '').toLowerCase();
      if (lastResult?.error_type === 'credential_failure' || errorMsg.includes('authorization') || errorMsg.includes('invalid') || errorMsg.includes('password') || errorMsg.includes('credential')) {
        return { success: false, status: 'invalid_credentials', message: lastResult?.message || 'Invalid credentials' };
      }
      if (errorMsg.includes('server') || errorMsg.includes('not found')) {
        return { success: false, status: 'server_not_found', message: lastResult?.message || 'Server not found' };
      }
      if (errorMsg.includes('timeout')) {
        return { success: false, status: 'timeout', message: lastResult?.message || 'Connection timed out' };
      }

      return { success: false, status: 'api_error', message: lastResult?.message || 'Verification failed' };
    } catch (error: any) {
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

  /**
   * VPS telemetry — read-only. These read the router's report endpoints directly
   * so the WinnerPip health page is independent of myFXpath. The router expects
   * the api key as a query param on these GET endpoints. Returns null on any error
   * so the page can render gracefully when the router is unreachable.
   */
  async getVpsReport(): Promise<any | null> {
    if (!this.baseUrl || !this.apiKey) return null;
    try {
      const response = await axios.get(`${this.baseUrl}/vps-report`, {
        params: { api_key: this.apiKey },
        timeout: 8000,
      });
      return response.data?.report || null;
    } catch {
      return null;
    }
  }

  async getVpsSnapshots(): Promise<{ snapshots: any[]; current: any } | null> {
    if (!this.baseUrl || !this.apiKey) return null;
    try {
      const response = await axios.get(`${this.baseUrl}/vps-report/snapshots`, {
        params: { api_key: this.apiKey },
        timeout: 8000,
      });
      return {
        snapshots: response.data?.snapshots || [],
        current: response.data?.current || null,
      };
    } catch {
      return null;
    }
  }
}

export const vpsService = new VpsService();
