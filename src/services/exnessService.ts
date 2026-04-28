import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

interface AuthResponse {
  token: string;
}

interface AffiliationResponse {
  affiliation: boolean;
  client_uid?: string;
  accounts?: any[];
}

interface ClientData {
  kyc_passed: boolean;
  client_status: string;
  client_balance: number;
  ftd_received: boolean;
  ftt_made: boolean;
  reg_date: string;
}

interface AccountData {
  client_account: string;
  client_account_type: string;
  platform: string | null;
  client_country: string;
  client_uid: string;
}

interface AccountCheckResult {
  allocated: boolean;
  isMT5: boolean;
  data: AccountData | null;
}

export interface VerifyEmailResult {
  success: boolean;
  status: 'verified' | 'not_allocated' | 'kyc_failed' | 'balance_failed' | 'api_error';
  message: string;
  clientUid?: string;
  kycPassed?: boolean;
  balanceRange?: number;
  ftdReceived?: boolean;
}

export interface VerifyAccountResult {
  success: boolean;
  status: 'allocated_mt5' | 'allocated_not_mt5' | 'not_allocated' | 'api_error';
  message: string;
  platform?: string | null;
  data?: { client_uid?: string } | null;
}

class ExnessService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private baseUrl: string;
  // Cache for full UUID list (refreshed per screening run)
  private uuidCache: string[] | null = null;
  private uuidCacheExpiry: Date | null = null;

  constructor() {
    this.baseUrl = config.exnessApiBaseUrl;
  }

  private async authenticate(): Promise<boolean> {
    if (!config.exnessPartnerEmail || !config.exnessPartnerPassword) {
      console.error('❌ Exness API credentials not configured');
      return false;
    }

    try {
      const response = await axios.post<AuthResponse>(
        `${this.baseUrl}/api/v2/auth/`,
        { login: config.exnessPartnerEmail, password: config.exnessPartnerPassword },
        { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
      );

      this.token = response.data.token;
      // Refresh after 5 hours (token valid for 6)
      this.tokenExpiry = new Date(Date.now() + 5 * 60 * 60 * 1000);
      console.log('✅ Exness API authenticated');
      return true;
    } catch (error: any) {
      console.error('❌ Exness API auth failed:', error.response?.status || error.message);
      return false;
    }
  }

  private async ensureAuth(): Promise<boolean> {
    if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      return this.authenticate();
    }
    return true;
  }

  private getHeaders() {
    return { Authorization: `JWT ${this.token}` };
  }

  /**
   * Check if email is allocated under BirrForex partnership
   */
  async checkAllocation(email: string): Promise<AffiliationResponse | null> {
    if (!await this.ensureAuth()) return null;

    try {
      const response = await axios.post<AffiliationResponse>(
        `${this.baseUrl}/api/partner/affiliation/`,
        { email },
        { headers: { ...this.getHeaders(), 'Content-Type': 'application/json' }, timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Allocation check error:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get full UUID from short UID (uses cached list, refreshes every 30 min)
   */
  async getFullUuid(shortUid: string): Promise<string | null> {
    if (!await this.ensureAuth()) return null;

    // Use cached list if available and fresh (30 min TTL)
    if (this.uuidCache && this.uuidCacheExpiry && new Date() < this.uuidCacheExpiry) {
      const fullUuid = this.uuidCache.find((uid: string) => uid.startsWith(shortUid));
      return fullUuid || null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v2/reports/clients/filters/`, {
        headers: this.getHeaders(),
        timeout: 30000,
      });

      const clientUids: string[] = response.data?.client_uid || [];
      // Cache the list for 30 minutes
      this.uuidCache = clientUids;
      this.uuidCacheExpiry = new Date(Date.now() + 30 * 60 * 1000);
      console.log(`🔑 UUID cache refreshed: ${clientUids.length} UIDs`);

      const fullUuid = clientUids.find((uid: string) => uid.startsWith(shortUid));
      return fullUuid || null;
    } catch (error: any) {
      console.error('❌ Get full UUID error:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Clear UUID cache (call before screening to ensure fresh data)
   */
  clearUuidCache(): void {
    this.uuidCache = null;
    this.uuidCacheExpiry = null;
  }

  /**
   * Get KYC status and client details
   */
  async getKycStatus(fullUuid: string): Promise<ClientData | null> {
    if (!await this.ensureAuth()) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/api/v2/reports/clients/`, {
        headers: this.getHeaders(),
        params: { client_uid: fullUuid, limit: 1 },
        timeout: 10000,
      });

      const data = response.data?.data;
      if (data && data.length > 0) {
        return data[0] as ClientData;
      }
      return null;
    } catch (error: any) {
      console.error('❌ KYC status error:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Check if a specific trading account is allocated under BirrForex and is MT5
   */
  async checkAccount(accountNumber: string): Promise<AccountCheckResult> {
    if (!await this.ensureAuth()) {
      return { allocated: false, isMT5: false, data: null };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/reports/clients/accounts/`, {
        headers: this.getHeaders(),
        params: { client_account: accountNumber },
        timeout: 10000,
      });

      const data = response.data?.data;
      if (data && data.length > 0) {
        const account = data[0] as AccountData;
        return {
          allocated: true,
          isMT5: account.platform !== 'mt4',
          data: account,
        };
      }

      return { allocated: false, isMT5: false, data: null };
    } catch (error: any) {
      console.error('❌ Account check error:', error.response?.status || error.message);
      return { allocated: false, isMT5: false, data: null };
    }
  }

  /**
   * Full email verification flow for registration
   * Demo: allocation + KYC
   * Real: allocation + KYC + balance
   */
  async verifyEmail(email: string, accountType: 'demo' | 'real'): Promise<VerifyEmailResult> {
    // Step 1: Check allocation
    const affiliation = await this.checkAllocation(email);
    if (!affiliation) {
      return { success: false, status: 'api_error', message: 'API error' };
    }

    if (!affiliation.affiliation) {
      return { success: false, status: 'not_allocated', message: 'Email not under BirrForex' };
    }

    const shortUid = affiliation.client_uid;
    if (!shortUid) {
      return { success: false, status: 'api_error', message: 'No client UID returned' };
    }

    // Step 2: Get full UUID
    const fullUuid = await this.getFullUuid(shortUid);
    if (!fullUuid) {
      return { success: false, status: 'api_error', message: 'Could not resolve UUID' };
    }

    // Step 3: Get KYC status
    const clientInfo = await this.getKycStatus(fullUuid);
    if (!clientInfo) {
      return { success: false, status: 'api_error', message: 'Could not get KYC status' };
    }

    if (!clientInfo.kyc_passed) {
      // Fallback: if FTD or FTT is true, treat as verified
      if (!clientInfo.ftd_received && !clientInfo.ftt_made) {
        return { success: false, status: 'kyc_failed', message: 'KYC not verified' };
      }
    }

    // Step 4: Balance check (real only, if enabled)
    if (accountType === 'real' && config.realAccountEquityCheck) {
      if (clientInfo.client_balance === 0 || !clientInfo.ftd_received) {
        return { success: false, status: 'balance_failed', message: 'No positive equity' };
      }
    }

    return {
      success: true,
      status: 'verified',
      message: 'All checks passed',
      clientUid: shortUid,
      kycPassed: clientInfo.kyc_passed,
      balanceRange: clientInfo.client_balance,
      ftdReceived: clientInfo.ftd_received,
    };
  }

  /**
   * Verify a real account number (allocation + MT5 check)
   */
  async verifyRealAccount(accountNumber: string): Promise<VerifyAccountResult> {
    const result = await this.checkAccount(accountNumber);

    if (!result.data && !result.allocated) {
      // Could be API error or not allocated — check if we got auth
      if (!this.token) {
        return { success: false, status: 'api_error', message: 'API unavailable' };
      }
      return { success: false, status: 'not_allocated', message: 'Account not under BirrForex' };
    }

    if (result.allocated && !result.isMT5) {
      return {
        success: false,
        status: 'allocated_not_mt5',
        message: 'Account is not MT5',
        platform: result.data?.platform,
      };
    }

    if (result.allocated && result.isMT5) {
      return {
        success: true,
        status: 'allocated_mt5',
        message: 'Account verified',
        platform: 'mt5',
        data: result.data ? { client_uid: result.data.client_uid } : null,
      };
    }

    return { success: false, status: 'not_allocated', message: 'Account not under BirrForex' };
  }

  /**
   * Initialize — authenticate on startup
   */
  async initialize(): Promise<void> {
    if (config.exnessPartnerEmail && config.exnessPartnerPassword) {
      const success = await this.authenticate();
      if (!success) {
        console.log('⚠️ Exness API auth failed on startup — will retry on first use');
      }
    } else {
      console.log('⚠️ Exness API credentials not set — trading challenge registration will use manual verification');
    }
  }
}

export const exnessService = new ExnessService();
