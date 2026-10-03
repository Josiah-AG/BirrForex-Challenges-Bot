/** Resend only: never grants a new grace period or changes account state. */
export async function resendCredentialWarning(registration: any, email: any, telegram: any): Promise<string> {
  if (!['password_changed', 'invalid_credentials'].includes(registration.pull_status)) throw new Error('No credential failure');
  if (registration.host_id != null) {
    if (!registration.email) throw new Error('No email address');
    const delivered = await email.sendCredentialFailure(registration.email, {
      nickname: registration.nickname || 'Trader', challengeTitle: registration.challenge_title,
      challengeId: registration.challenge_id, hostName: registration.host_name, hostLink: registration.host_link,
    });
    if (!delivered) throw new Error('Email delivery rejected');
    return 'email';
  }
  if (registration.source !== 'telegram' || !registration.user_id || !telegram) throw new Error('No Telegram recipient');
  const escape = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bot = await telegram.getMe();
  await telegram.sendMessage(registration.user_id,
    `⚠️ <b>Account Access Issue — ${escape(registration.challenge_title)}</b>\n\n` +
    `We still cannot access your MT5 account <b>${escape(registration.account_number)}</b>.\n\n` +
    `Please update your investor password using the button below. This reminder does not extend your original deadline.\n\n` +
    `If you need help, contact @birrFXadmin.`, {
      parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{
        text: '🔑 Update Investor Password', url: `https://t.me/${bot.username}?start=tc_update_password_${registration.id}`,
      }]] },
    });
  return 'Telegram DM';
}
