import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');

const FROM_ADDRESS = 'WinnerPip <challenges@winnerpip.com>';
const LOGO_URL = 'https://winnerpip.com/winnerpip-icon.png';

/**
 * Base email wrapper — consistent WinnerPip branded layout
 */
function wrapEmail(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #060a14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #060a14; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: linear-gradient(135deg, #0f1629 0%, #131a30 100%); border-radius: 20px; border: 1px solid rgba(99,102,241,0.15); box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden;">
          <!-- Header with gradient bar -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, #6366f1, #8b5cf6, #d4af37);"></td>
          </tr>
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 32px 32px 0;">
              <img src="${LOGO_URL}" alt="WinnerPip" width="48" height="48" style="display: block; border-radius: 12px; margin-bottom: 8px;" />
              <p style="color: #fff; font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">WinnerPip</p>
              <p style="color: #64748b; font-size: 12px; margin: 4px 0 0; letter-spacing: 0.5px;">TRADING CHALLENGE PLATFORM</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; text-align: center;">
                    <p style="color: #475569; font-size: 11px; margin: 0 0 8px;">Trade. Compete. Win.</p>
                    <a href="https://linktr.ee/birrforex" target="_blank" rel="noopener noreferrer" style="color: #64748b; font-size: 11px; text-decoration: none;">
                      Powered by <strong style="color: #94a3b8;">BirrForex</strong>
                    </a>
                  </td>
                </tr>
              </table>
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
 * Styled card block for content sections
 */
function card(borderColor: string, content: string): string {
  return `<div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 20px; border: 1px solid ${borderColor}; margin-bottom: 16px;">${content}</div>`;
}

/**
 * Info row (label: value)
 */
function infoRow(label: string, value: string): string {
  return `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">${label}</td><td style="padding: 6px 0; color: #fff; font-size: 13px; text-align: right; font-weight: 500;">${value}</td></tr>`;
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
        <h2 style="color: #22c55e; font-size: 18px; margin: 0 0 12px; font-weight: 600;">&#10003; Registration Confirmed</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong style="color: #fff;">${data.nickname}</strong>, you're in!
        </p>
        ${card('rgba(99,102,241,0.3)', `
          <p style="color: #a5b4fc; font-size: 15px; font-weight: 700; margin: 0 0 4px;">${data.challengeTitle}</p>
          <p style="color: #64748b; font-size: 12px; margin: 0;">Your spot is confirmed</p>
        `)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
          ${infoRow('Account', data.accountNumber)}
          ${infoRow('Type', data.accountType.charAt(0).toUpperCase() + data.accountType.slice(1))}
          ${infoRow('Nickname', data.nickname)}
        </table>
        <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
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
        <h2 style="color: #f59e0b; font-size: 18px; margin: 0 0 12px; font-weight: 600;">&#9888;&#65039; Balance Warning</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong style="color: #fff;">${data.nickname}</strong>, your account balance needs attention.
        </p>
        ${card('rgba(245,158,11,0.3)', `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${infoRow('Your Balance', `<span style="color: #f59e0b; font-weight: 700;">${data.currentBalance}</span>`)}
            ${infoRow('Challenge Limit', data.limit)}
            ${infoRow('Starts On', data.startDate)}
          </table>
        `)}
        <div style="background: rgba(245,158,11,0.1); border-radius: 8px; padding: 12px; border: 1px solid rgba(245,158,11,0.2);">
          <p style="color: #fbbf24; font-size: 13px; font-weight: 600; margin: 0;">
            &#9888; Please adjust your balance before the challenge starts or you will be disqualified.
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
        <h2 style="color: #ef4444; font-size: 18px; margin: 0 0 12px; font-weight: 600;">Disqualified</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong style="color: #fff;">${data.nickname}</strong>, you've been disqualified from <strong>${data.challengeTitle}</strong>.
        </p>
        ${card('rgba(239,68,68,0.3)', `
          <p style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Reason</p>
          <p style="color: #fca5a5; font-size: 14px; margin: 0; line-height: 1.5;">${data.reason}</p>
        `)}
        <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
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
        <h2 style="color: #22c55e; font-size: 18px; margin: 0 0 12px; font-weight: 600;">&#128640; Challenge is Live!</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong style="color: #fff;">${data.nickname}</strong>, it's go time.
        </p>
        ${card('rgba(34,197,94,0.3)', `
          <p style="color: #86efac; font-size: 15px; font-weight: 700; margin: 0 0 8px;">${data.challengeTitle}</p>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">Ends on <strong style="color: #fff;">${data.endDate}</strong></p>
        `)}
        <p style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.6;">
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
        <h2 style="color: #a5b4fc; font-size: 18px; margin: 0 0 12px; font-weight: 600;">Challenge Ended</h2>
        <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
          Hi <strong style="color: #fff;">${data.nickname}</strong>, <strong>${data.challengeTitle}</strong> has ended.
        </p>
        ${card('rgba(99,102,241,0.3)', `
          <p style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.6;">
            Final results and the leaderboard are now available. Visit the challenge page to see the winners and your final ranking.
          </p>
        `)}
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
      const content = `<div style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">${bodyContent}</div>`;
      await resend.emails.send({ from: FROM_ADDRESS, to, subject, html: wrapEmail(content) });
      return true;
    } catch (error) {
      console.error('Email send error (generic):', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
