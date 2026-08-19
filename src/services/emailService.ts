import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_ADDRESS = 'WinnerPip <challenges@winnerpip.com>';

/**
 * Email Service for WinnerPip
 * Used for hosted challenge participant notifications
 */
class EmailService {

  private isConfigured(): boolean {
    return !!process.env.RESEND_API_KEY;
  }

  /**
   * Send registration confirmation email
   */
  async sendRegistrationConfirmation(to: string, data: {
    nickname: string;
    challengeTitle: string;
    accountNumber: string;
    accountType: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Registration Confirmed — ${data.challengeTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f1629; color: #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 24px; margin: 0;">WinnerPip</h1>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Trading Challenge Platform</p>
            </div>
            <div style="background: #1a1f3a; border-radius: 12px; padding: 24px; border: 1px solid rgba(255,255,255,0.1);">
              <h2 style="color: #22c55e; font-size: 18px; margin: 0 0 16px;">Registration Confirmed</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Hi <strong style="color: #fff;">${data.nickname}</strong>, you've been successfully registered for:
              </p>
              <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <p style="color: #a5b4fc; font-size: 16px; font-weight: bold; margin: 0;">${data.challengeTitle}</p>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr><td style="padding: 8px 0; color: #64748b;">Account</td><td style="padding: 8px 0; color: #fff; text-align: right;">${data.accountNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Type</td><td style="padding: 8px 0; color: #fff; text-align: right;">${data.accountType}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Nickname</td><td style="padding: 8px 0; color: #fff; text-align: right;">${data.nickname}</td></tr>
              </table>
              <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0; line-height: 1.5;">
                Your account has been verified and connected. You'll receive updates about the challenge via email.
              </p>
            </div>
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 16px 0 0;">WinnerPip — Trade. Compete. Win.</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email send error (registration):', error);
      return false;
    }
  }

  /**
   * Send balance warning email
   */
  async sendBalanceWarning(to: string, data: {
    nickname: string;
    challengeTitle: string;
    currentBalance: string;
    limit: string;
    startDate: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Balance Warning — ${data.challengeTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f1629; color: #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 24px; margin: 0;">WinnerPip</h1>
            </div>
            <div style="background: #1a1f3a; border-radius: 12px; padding: 24px; border: 1px solid rgba(245,158,11,0.3);">
              <h2 style="color: #f59e0b; font-size: 18px; margin: 0 0 16px;">&#9888; Balance Warning</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Hi <strong style="color: #fff;">${data.nickname}</strong>, your account balance exceeds the challenge limit.
              </p>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
                <tr><td style="padding: 8px 0; color: #64748b;">Your Balance</td><td style="padding: 8px 0; color: #f59e0b; text-align: right; font-weight: bold;">${data.currentBalance}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Challenge Limit</td><td style="padding: 8px 0; color: #fff; text-align: right;">${data.limit}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Challenge Starts</td><td style="padding: 8px 0; color: #fff; text-align: right;">${data.startDate}</td></tr>
              </table>
              <p style="color: #fbbf24; font-size: 13px; font-weight: 600; margin: 0;">
                Please adjust your balance before the challenge starts or you will be disqualified.
              </p>
            </div>
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 16px 0 0;">WinnerPip — Trade. Compete. Win.</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email send error (balance warning):', error);
      return false;
    }
  }

  /**
   * Send disqualification notification email
   */
  async sendDisqualification(to: string, data: {
    nickname: string;
    challengeTitle: string;
    reason: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Disqualified — ${data.challengeTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f1629; color: #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 24px; margin: 0;">WinnerPip</h1>
            </div>
            <div style="background: #1a1f3a; border-radius: 12px; padding: 24px; border: 1px solid rgba(239,68,68,0.3);">
              <h2 style="color: #ef4444; font-size: 18px; margin: 0 0 16px;">Disqualified</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Hi <strong style="color: #fff;">${data.nickname}</strong>, you have been disqualified from <strong>${data.challengeTitle}</strong>.
              </p>
              <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <p style="color: #fca5a5; font-size: 13px; margin: 0;"><strong>Reason:</strong> ${data.reason}</p>
              </div>
              <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
                If you believe this is an error, please contact the challenge host for more information.
              </p>
            </div>
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 16px 0 0;">WinnerPip — Trade. Compete. Win.</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email send error (DQ):', error);
      return false;
    }
  }

  /**
   * Send challenge started notification email
   */
  async sendChallengeStarted(to: string, data: {
    nickname: string;
    challengeTitle: string;
    endDate: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Challenge Started — ${data.challengeTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f1629; color: #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 24px; margin: 0;">WinnerPip</h1>
            </div>
            <div style="background: #1a1f3a; border-radius: 12px; padding: 24px; border: 1px solid rgba(34,197,94,0.3);">
              <h2 style="color: #22c55e; font-size: 18px; margin: 0 0 16px;">&#128640; Challenge is Live!</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Hi <strong style="color: #fff;">${data.nickname}</strong>, <strong>${data.challengeTitle}</strong> has officially started!
              </p>
              <p style="color: #94a3b8; font-size: 13px; margin: 0 0 8px;">
                The challenge ends on <strong style="color: #fff;">${data.endDate}</strong>.
              </p>
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                Trade according to the challenge rules. Your performance is being tracked automatically.
              </p>
            </div>
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 16px 0 0;">WinnerPip — Trade. Compete. Win.</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email send error (challenge started):', error);
      return false;
    }
  }

  /**
   * Send challenge ended notification email
   */
  async sendChallengeEnded(to: string, data: {
    nickname: string;
    challengeTitle: string;
  }): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject: `Challenge Ended — ${data.challengeTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f1629; color: #e2e8f0; border-radius: 16px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 24px; margin: 0;">WinnerPip</h1>
            </div>
            <div style="background: #1a1f3a; border-radius: 12px; padding: 24px; border: 1px solid rgba(99,102,241,0.3);">
              <h2 style="color: #a5b4fc; font-size: 18px; margin: 0 0 16px;">Challenge Ended</h2>
              <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
                Hi <strong style="color: #fff;">${data.nickname}</strong>, <strong>${data.challengeTitle}</strong> has ended.
              </p>
              <p style="color: #94a3b8; font-size: 13px; margin: 0;">
                Final results and the leaderboard are now available. Check the challenge page to see the winners and your final ranking.
              </p>
            </div>
            <p style="color: #475569; font-size: 11px; text-align: center; margin: 16px 0 0;">WinnerPip — Trade. Compete. Win.</p>
          </div>
        `,
      });
      return true;
    } catch (error) {
      console.error('Email send error (challenge ended):', error);
      return false;
    }
  }

  /**
   * Send a generic notification email
   */
  async sendGeneric(to: string, subject: string, htmlBody: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html: htmlBody,
      });
      return true;
    } catch (error) {
      console.error('Email send error (generic):', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
