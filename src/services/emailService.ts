import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_ADDRESS = 'WinnerPip <challenges@winnerpip.com>';
const LOGO_URL = 'https://winnerpip.com/winnerpip-icon.png';

/**
 * Base email wrapper
 * Header: dark purple/blue with logo, "WinnerPip" text, slogan
 * Body: white background with professional content
 * Footer: dark purple/blue with "Powered by BirrForex"
 */
function wrapEmail(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f0f0f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0f0f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.12);">

          <!-- HEADER: Dark purple/blue -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0f1629 0%, #1a1040 50%, #0f1629 100%); padding: 36px 32px 28px;">
              <img src="${LOGO_URL}" alt="WinnerPip" width="52" height="52" style="display: block; border-radius: 14px; margin: 0 auto 12px;" />
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.5px;">WinnerPip</h1>
              <p style="color: #a5b4fc; font-size: 12px; margin: 0; font-weight: 500; letter-spacing: 1px;">TRADE &middot; COMPETE &middot; WIN</p>
            </td>
          </tr>

          <!-- BODY: White background -->
          <tr>
            <td style="background-color: #ffffff; padding: 32px;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER: Dark purple/blue -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0f1629 0%, #1a1040 50%, #0f1629 100%); padding: 20px 32px;">
              <a href="https://linktr.ee/birrforex" target="_blank" rel="noopener noreferrer" style="color: #94a3b8; font-size: 12px; text-decoration: none;">
                Powered by <strong style="color: #ffffff;">BirrForex</strong>
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email Service for WinnerPip
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
      const content = `
        <h2 style="color: #16a34a; font-size: 20px; margin: 0 0 8px; font-weight: 700;">Registration Confirmed</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Hi <strong>${data.nickname}</strong>, you've been successfully registered.
        </p>

        <div style="background: #f8fafc; border-radius: 10px; padding: 16px 20px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
          <p style="color: #6366f1; font-size: 15px; font-weight: 700; margin: 0 0 2px;">${data.challengeTitle}</p>
          <p style="color: #64748b; font-size: 12px; margin: 0;">Your spot is confirmed</p>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Account</td><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #111827; font-size: 13px; text-align: right; font-weight: 600;">${data.accountNumber}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Type</td><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #111827; font-size: 13px; text-align: right; font-weight: 600;">${data.accountType.charAt(0).toUpperCase() + data.accountType.slice(1)}</td></tr>
          <tr><td style="padding: 10px 0; color: #64748b; font-size: 13px;">Nickname</td><td style="padding: 10px 0; color: #111827; font-size: 13px; text-align: right; font-weight: 600;">${data.nickname}</td></tr>
        </table>

        <p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.5;">
          Your account has been verified and connected. You'll receive updates about the challenge via email.
        </p>
      `;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject: `Registration Confirmed — ${data.challengeTitle}`, html: wrapEmail(content) });
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
      const content = `
        <h2 style="color: #d97706; font-size: 20px; margin: 0 0 8px; font-weight: 700;">&#9888;&#65039; Balance Warning</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Hi <strong>${data.nickname}</strong>, your account balance exceeds the challenge limit.
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Your Balance</td><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #d97706; font-size: 14px; text-align: right; font-weight: 700;">${data.currentBalance}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #64748b; font-size: 13px;">Challenge Limit</td><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #111827; font-size: 13px; text-align: right; font-weight: 600;">${data.limit}</td></tr>
          <tr><td style="padding: 10px 0; color: #64748b; font-size: 13px;">Challenge Starts</td><td style="padding: 10px 0; color: #111827; font-size: 13px; text-align: right; font-weight: 600;">${data.startDate}</td></tr>
        </table>

        <div style="background: #fffbeb; border-radius: 8px; padding: 14px 16px; border: 1px solid #fde68a;">
          <p style="color: #92400e; font-size: 13px; font-weight: 600; margin: 0;">
            Please adjust your balance before the challenge starts or you will be automatically disqualified.
          </p>
        </div>
      `;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject: `Balance Warning — ${data.challengeTitle}`, html: wrapEmail(content) });
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
      const content = `
        <h2 style="color: #dc2626; font-size: 20px; margin: 0 0 8px; font-weight: 700;">Disqualified</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Hi <strong>${data.nickname}</strong>, you've been disqualified from <strong>${data.challengeTitle}</strong>.
        </p>

        <div style="background: #fef2f2; border-radius: 8px; padding: 14px 16px; border: 1px solid #fecaca; margin-bottom: 20px;">
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px; font-weight: 600;">Reason</p>
          <p style="color: #991b1b; font-size: 14px; margin: 0; line-height: 1.5;">${data.reason}</p>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.5;">
          If you believe this is an error, please contact the challenge host for more information.
        </p>
      `;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject: `Disqualified — ${data.challengeTitle}`, html: wrapEmail(content) });
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
      const content = `
        <h2 style="color: #16a34a; font-size: 20px; margin: 0 0 8px; font-weight: 700;">&#128640; Challenge is Live!</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Hi <strong>${data.nickname}</strong>, the challenge has officially started.
        </p>

        <div style="background: #f0fdf4; border-radius: 10px; padding: 16px 20px; border: 1px solid #bbf7d0; margin-bottom: 20px;">
          <p style="color: #166534; font-size: 15px; font-weight: 700; margin: 0 0 4px;">${data.challengeTitle}</p>
          <p style="color: #4b5563; font-size: 13px; margin: 0;">Ends on <strong>${data.endDate}</strong></p>
        </div>

        <p style="color: #6b7280; font-size: 13px; margin: 0; line-height: 1.6;">
          Trade according to the challenge rules. Your performance is being tracked automatically. Good luck!
        </p>
      `;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject: `Challenge Started — ${data.challengeTitle}`, html: wrapEmail(content) });
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
      const content = `
        <h2 style="color: #4f46e5; font-size: 20px; margin: 0 0 8px; font-weight: 700;">Challenge Ended</h2>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Hi <strong>${data.nickname}</strong>, <strong>${data.challengeTitle}</strong> has ended.
        </p>

        <div style="background: #eef2ff; border-radius: 10px; padding: 16px 20px; border: 1px solid #c7d2fe; margin-bottom: 20px;">
          <p style="color: #374151; font-size: 14px; margin: 0; line-height: 1.6;">
            Final results and the leaderboard are now available. Visit the challenge page to see the winners and your final ranking.
          </p>
        </div>
      `;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject: `Challenge Ended — ${data.challengeTitle}`, html: wrapEmail(content) });
      return true;
    } catch (error) {
      console.error('Email send error (challenge ended):', error);
      return false;
    }
  }

  /**
   * Send a generic notification email
   */
  async sendGeneric(to: string, subject: string, bodyContent: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const content = `<div style="color: #374151; font-size: 14px; line-height: 1.6;">${bodyContent}</div>`;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject, html: wrapEmail(content) });
      return true;
    } catch (error) {
      console.error('Email send error (generic):', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
