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

export class ExnessService {
  private clientIds: Promise<string[]> | null = null;
  private clientIdsAt = 0;
  private authPending: Promise<boolean> | null = null;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private baseUrl: string;

  constructor(private credentials = { email: config.exnessPartnerEmail, password: config.exnessPartnerPassword }) {
    this.baseUrl = config.exnessApiBaseUrl;
  }

  private async authenticate(): Promise<boolean> {
    if(!this.authPending)this.authPending=this.authenticateOnce().finally(()=>{this.authPending=null;});
    return this.authPending;
  }

  private async authenticateOnce(): Promise<boolean> {
    if (!this.credentials.email || !this.credentials.password) {
      console.error('❌ Exness API credentials not configured');
      return false;
    }

    try {
      const response = await axios.post<AuthResponse>(
        `${this.baseUrl}/api/v2/auth/`,
        { login: this.credentials.email, password: this.credentials.password },
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

  private async verificationRequest(method: 'get'|'post', endpoint: string, data?: any): Promise<any> {
    for(let attempt=0;attempt<2;attempt++) {
      try {return await axios.request({method,url:this.baseUrl+endpoint,headers:{...this.getHeaders(),'Content-Type':'application/json'},timeout:15000,...(method==='get'?{params:data}:{data})});}
      catch(error:any) {
        if(attempt===0 && error.response?.status===401 && await this.authenticate())continue;
        throw error;
      }
    }
  }

  private getHeaders() {
    return { Authorization: `JWT ${this.token}` };
  }

  /** Read-only paginated partner reports. Never expose credentials or axios config in errors. */
  async commercialReport(path: string, params: Record<string, any>): Promise<any> {
    if (!['/api/reports/clients/accounts/', '/api/reports/orders/'].includes(path)) throw new Error('Unsupported commercial report');
    if (!await this.ensureAuth()) throw new Error('Exness authentication unavailable');
    for (let attempt=0; attempt<3; attempt++) {
      try { return (await axios.get(this.baseUrl+path,{headers:this.getHeaders(),params,timeout:25000})).data; }
      catch (e:any) {
        const status=e.response?.status;
        if (attempt<2 && [429,502,503,504].includes(status)) {await new Promise(r=>setTimeout(r,2000*(attempt+1)));continue;}
        throw new Error(`Exness report unavailable (${status || 'timeout'})`);
      }
    }
  }
  commercialScope(): string {
    return require('crypto').createHash('sha256').update(this.credentials.email+'\n'+this.credentials.password).digest('hex');
  }

  /**
   * Check if email is allocated under BirrForex partnership
   */
  async checkAllocation(email: string): Promise<AffiliationResponse | null> {
    if (!await this.ensureAuth()) return null;

    try {
      const response = await this.verificationRequest('post','/api/partner/affiliation/',{email});
      return response.data;
    } catch (error: any) {
      console.error('❌ Allocation check error:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get full UUID from short UID
   */
  async getFullUuid(shortUid: string): Promise<string | null> {
    if (!await this.ensureAuth()) return null;

    try {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shortUid)) return shortUid;
      const cached=!!this.clientIds && Date.now()-this.clientIdsAt<=300000;
      const load=()=>{
        this.clientIdsAt=Date.now();
        this.clientIds=this.verificationRequest('get','/api/v2/reports/clients/filters/')
          .then(response=>response.data?.client_uid || []).catch(error=>{this.clientIds=null;throw error;});
        return this.clientIds;
      };
      let ids=await (cached?this.clientIds!:load());
      const match=(values:string[])=>values.filter(uid=>uid===shortUid || uid.startsWith(shortUid));
      let matches=match(ids);
      // A new partner client can appear while the five-minute report cache is warm.
      if(matches.length===0 && cached){ids=await load();matches=match(ids);}
      if(matches.length!==1)console.warn('Exness client lookup unresolved',{matches:matches.length,cached});
      return matches.length===1 ? matches[0] : null;
    } catch (error: any) {
      console.error('❌ Get full UUID error:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get KYC status and client details
   */
  async getKycStatus(fullUuid: string): Promise<ClientData | null> {
    if (!await this.ensureAuth()) return null;

    try {
      const response = await this.verificationRequest('get','/api/v2/reports/clients/',{client_uid:fullUuid,limit:1});

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
      return { success: false, status: 'api_error', message: 'Exness partnership lookup or authentication unavailable' };
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
      return { success: false, status: 'api_error', message: 'Exness client identifier is missing or ambiguous in the partner report' };
    }

    // Step 3: Get KYC status
    const clientInfo = await this.getKycStatus(fullUuid);
    if (!clientInfo) {
      return { success: false, status: 'api_error', message: 'Exness verification report is unavailable or has not listed this client yet' };
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
    if (this.credentials.email && this.credentials.password) {
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
