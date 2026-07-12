/**
 * English translations — Registration, Submission, and DM notifications
 */
export const en: Record<string, string> = {
  // Language selection
  lang_prompt: 'Choose your language (<b>English Recommended!</b>):',

  // Username required
  username_required_title: '⚠️ <b>Telegram Username Required</b>',
  username_required_body: 'You need to set a Telegram username before registering.\n\n<b>How to set a username:</b>\n1. Open Telegram Settings\n2. Tap on your profile\n3. Set a username (e.g., @yourname)\n\nOnce done, tap "Join Challenge" again.',

  // Hybrid category selection
  hybrid_title: '<b>🎯 BIRRFOREX TRADING CHALLENGE</b>\n<b>{title}</b>',
  hybrid_body: 'This is a <b>Hybrid Challenge</b> — you can participate\nwith either a <b>Demo</b> or <b>Real</b> account.\n\n⚠️ <i>You can only compete in one category.</i>',
  hybrid_choose: 'Choose your category:',
  hybrid_demo_btn: '🏦 Demo Account Challenge',
  hybrid_real_btn: '💰 Real Account Challenge',

  // Email step
  email_prompt: '📧 Please send your <b>Exness email address:</b>',
  email_invalid: '❌ Invalid email format. Please send a valid email address.',
  email_already_registered: '⚠️ <b>This email is already registered for this challenge.</b>\n\nIf you have another email, submit it below.\n<i>Contact @birrFXadmin if this is an error.</i>',
  email_verifying: '⏳ <b>Verifying your account...</b>',

  // Account number step
  account_number_prompt: 'Enter your <b>MT5 account number:</b>',
  account_number_invalid: '❌ Account number must be numeric. Try again:',
  account_verifying: '⏳ <b>Verifying account allocation...</b>',

  // Server selection
  server_prompt: '🖥️ Select your <b>MT5 Server:</b>',
  server_type_manually: 'Type manually',
  server_confirm: 'Is your server <b>{name}</b>?',
  server_yes: '✅ Yes',
  server_no: '❌ No, let me type again',
  server_not_found: '❌ Could not match "<b>{input}</b>" to a known server.\n\nPlease select from the buttons or type the exact server name:',

  // Investor password
  password_prompt: '🔑 Enter your <b>Investor (Read-Only) Password</b>\n\nThis allows view-only access to your MT5 account.\n⚠️ <i>NOT your master/trading password.</i>\n\nSend your investor password:',
  password_too_short: '❌ Password seems too short. Please enter your investor password:',
  password_confirm_prompt: '🔑 Enter the investor password <b>again</b> to confirm:',
  password_mismatch: '❌ <b>Passwords don\'t match.</b> Please enter your investor password again:',

  // VPS verification
  vps_verifying: '⏳ <b>Verifying MT5 connection...</b>\n<i>This may take up to 30 seconds.</i>',
  vps_connected: '✅ <b>Connected!</b> Your account is verified and linked.',
  vps_invalid_credentials: '❌ <b>Connection failed</b> — Invalid credentials.',
  vps_server_error: '❌ <b>Connection failed</b> — Could not reach MT5 server.',

  // Nickname
  nickname_prompt: '🏷️ Almost done! Choose a <b>Challenge Nickname</b>\n\nThis will be displayed on the leaderboard instead of your real name.\n• 3-20 characters\n• Letters, numbers, underscores only\n• Must be unique\n\nSend your nickname:',
  nickname_too_short: '❌ Nickname must be 3-20 characters. Try again:',
  nickname_invalid_chars: '❌ Only letters, numbers, and underscores allowed. Try again:',
  nickname_blocked: '❌ You cannot use that nickname — it\'s too similar to our brand. Please choose a different nickname:',
  nickname_taken: '❌ <b>"{name}"</b> is already taken. Choose a different nickname:',

  // Registration complete
  reg_complete: '✅ <b>Registration Complete!</b>\n\n📋 <b>Your Registration:</b>\n🏷️ <b>Nickname:</b> {nick}\n📧 <b>Email:</b> {email}\n🏦 <b>{type} Account:</b> {number}\n🖥️ <b>Server:</b> {server}\n📊 <b>Type:</b> {type}\n🔑 <b>Investor Password:</b> ✅ Saved\n\n⏳ <b>Challenge starts:</b> {startDate}\n\n⚠️ <b>IMPORTANT:</b> Do NOT change your investor password until the challenge ends and winners are announced. We pull your trade data automatically — if we can\'t access your account, you risk disqualification.\n\n⚠️ <i>Please read the rules before starting the challenge!</i>\n\nYou can change your account number before the challenge starts.',
  reg_change_account_btn: '🔄 Change Account Number',
  reg_switch_real_btn: '🔀 Switch to Real Account',
  reg_switch_demo_btn: '🔀 Switch to Demo Account',

  // Submission flow
  submit_email_prompt: '📧 Please enter your <b>Exness email</b> to verify your identity:',
  submit_email_not_found: '❌ <b>This email is not registered for this challenge.</b>\n\nPlease check your email and try again.',
  submit_email_wrong_user: '❌ <b>This email is registered under a different account.</b>\n\nUse the Telegram account you registered with.',
  submit_email_verified: '✅ <b>Identity verified!</b>',
  submit_balance_prompt: '💰 What is your final account balance?\n<i>(Enter the number only, e.g., 67.50)</i>',
  submit_balance_invalid: '❌ Please enter a valid number.',
  submit_balance_below_target: '❌ The target is <b>${target}</b>. Your balance of <b>${balance}</b> has not reached the target.\n\n<i>Better luck next time!</i> 💪',
  submit_screenshot_prompt: '📸 Upload a <b>screenshot</b> of your final balance.\n\nMake sure it clearly shows:\n➡️ Account number\n➡️ Final balance/equity',
  submit_complete: '✅ <b>Results Submitted Successfully!</b>\n\n📋 <b>Your Submission:</b>\n📧 <b>Email:</b> {email}\n🏦 <b>Account:</b> {number}\n🖥️ <b>Server:</b> {server}\n📊 <b>Type:</b> {type}\n💰 <b>Final Balance:</b> ${balance}\n📸 <b>Screenshot:</b> ✅\n\n⏳ Our team will review and announce results.\n<i>Thank you for participating!</i> 🎉',

  // Balance warning DM
  balance_warning_title: '⚠️ <b>Balance Too High</b>',
  balance_warning_body: 'Your account <b>{number}</b> currently has <b>{balance}</b> but the challenge starting limit is <b>{limit}</b>.\n\nPlease reduce your balance to <b>{limit}</b> or below before the challenge starts.\n\n💸 <b>Excess:</b> {excess}\n📋 <b>Challenge:</b> {title}\n📅 <b>Starts:</b> {startDate}\n\n🚫 If your balance is still above <b>{limit}</b> at challenge start, you will be <b>automatically disqualified</b>.',
  balance_ok: '✅ <b>Balance OK</b>\n\nYour account <b>{number}</b> balance is now within the allowed limit. You\'re all set for the challenge! 👍',

  // Password update DM
  password_update_prompt: '⚠️ Your investor password needs to be updated.\n\nEnter your new investor password:',
  password_update_success: '✅ <b>Password updated successfully!</b>\n\nYour account is now accessible again. We\'re pulling your full trade history now.\n\n⚠️ <b>Remember:</b> Do NOT change your investor password again until the challenge ends.',

  // Change account flow
  change_acct_title: '🔄 <b>Change Account Number</b>\n\n📋 Current: {number} ({server})\n\nSend your new <b>MT5 {type} Account Number:</b>\n⚠️ <i>Must be an MT5 trading account.</i>',
  change_acct_number_invalid: '❌ Account number must be numeric. Try again:',
  change_acct_password_prompt: '🖥️ Server: <b>{server}</b>\n\n🔑 Enter the <b>Investor (Read-Only) Password</b> for the new account:\n⚠️ <i>NOT your master/trading password.</i>',
  change_acct_password_too_short: '❌ Password seems too short. Please enter the investor password:',
  change_acct_password_confirm: '🔑 Enter the investor password <b>again</b> to confirm:',
  change_acct_password_mismatch: '❌ <b>Passwords don\'t match.</b> Please enter the investor password again:',
  change_acct_success: '✅ <b>Account Changed Successfully!</b>\n\n🏦 New account: <b>{number}</b>\n🖥️ Server: <b>{server}</b>\n\n⚠️ Do NOT change your investor password until the challenge ends.',

  // Verification errors
  email_verified: '✅ <b>Email verified!</b>\n\nNow send your <b>MT5 {type} Account Number:</b>\n⚠️ Must be an MT5 trading account.\n<i>Only numeric account numbers accepted.</i>',
  not_allocated: '⚠️ Your Exness account is not registered under BirrForex.\n\nFirst, make sure you spelled your email correctly.\n\n✨ <b>Option 1: Create a New Exness Account</b>\n🔗 {signupLink}\n\n🔄 <b>Option 2: Change Your Partner to BirrForex</b>\n➡️ Log in → Live Chat → "Change Partner"\n➡️ Paste: {partnerLink}\n\nAfter completing, try again:',
  kyc_failed: '❌ Your Exness account is not fully verified.\n\nPlease complete KYC:\n➡️ Exness → Settings → Verification\n\nOnce verified, try again:',
  real_acct_not_mt5: '⚠️ <b>This account is not MT5.</b> Only MT5 accounts allowed.\nCreate a new MT5 Real account and try again.',
  real_acct_not_allocated: '⚠️ <b>This real account is not under BirrForex.</b>\nCreate a new Real Account within your Exness and transfer funds there.',
  real_acct_not_allocated_retry: '⚠️ <b>Account not yet under BirrForex.</b>\nIt may take a few minutes. Come back after 15 minutes.',
  acct_ownership_mismatch: '⚠️ <b>This account does not belong to the email you registered with.</b>\n\nSend your correct MT5 Real Account Number:',
  system_busy_retry: '⚠️ System busy. Trying again in 3 seconds...',
  system_busy_later: '⚠️ System busy. Please try again after 30 minutes.',
  manual_verification: '⚠️ Automatic verification unavailable. We\'ll verify manually.\n\n📧 Email: {email}\n\nPlease send your <b>MT5 account number:</b>',

  // Errors
  error_challenge_not_found: '❌ Challenge not found.',
  error_registration_closed: '❌ <b>Registration is closed.</b>\nThis challenge has already started.\n\nStay tuned for the next challenge on <b>@BirrForex!</b>',
  error_not_accepting: '❌ This challenge is not accepting registrations.',
  error_already_registered: '⚠️ You are already registered for this challenge.',
  error_registration_failed: '❌ Error completing registration. Please try again.',
  error_submission_deadline: '❌ <b>Submission deadline has passed.</b>\n<i>Late submissions are not accepted.</i>',
};
