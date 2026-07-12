/**
 * Amharic translations — Registration, Submission, and DM notifications
 */
export const am: Record<string, string> = {
  // Language selection
  lang_prompt: 'ቋንቋ ይምረጡ:',

  // Username required
  username_required_title: '⚠️ <b>የTelegram ስም ያስፈልጋል</b>',
  username_required_body: 'ለመመዝገብ የTelegram ስም (Username) ማዘጋጀት ያስፈልግዎታል።\n\n<b>ስም ለማዘጋጀት:</b>\n1. የTelegram ማቀናበሪያ (Setting) ይክፈቱ\n2. ፕሮፋይልዎን ይንኩ\n3. ስም (Username) ያስገቡ (ለምሳሌ: @yourname)\n\nሲጨርሱ "Join Challenge" ን እንደገና ይጫኑ።',

  // Hybrid category selection
  hybrid_title: '<b>🎯 BirrForex የትሬዲንግ ቻሌንጅ</b>\n<b>{title}</b>',
  hybrid_body: 'ይህ <b>ድርብ ቻሌንጅ</b> ነው — በ<b>Demo</b> ወይም <b>Real</b> አካውንት መሳተፍ ይችላሉ።\n\n⚠️ <i>በአንድ ምድብ ብቻ መወዳደር ይችላሉ።</i>',
  hybrid_choose: 'ምድብዎን ይምረጡ:',
  hybrid_demo_btn: '🏦 Demo አካውንት ቻሌንጅ',
  hybrid_real_btn: '💰 Real አካውንት ቻሌንጅ',

  // Email step
  email_prompt: '📧 እባክዎ የ<b>Exness ኢሜልዎን</b> ያስገቡ:',
  email_invalid: '❌ ያስገቡት ኢሜል ትክክል አይደለም። ትክክለኛ ኢሜል ያስገቡ።',
  email_already_registered: '⚠️ <b>ይህ ኢሜል ለዚህ ቻሌንጅ ቀድሞ ተመዝግቧል።</b>\n\nሌላ ኢሜል ካለዎት ከታች ያስገቡ።\n<i>ስህተት ከሆነ @birrFXadmin ያግኙ።</i>',
  email_verifying: '⏳ <b>አካውንትዎ እየተረጋገጠ ነው...</b>',

  // Account number step
  account_number_prompt: 'የ<b>MT5 አካውንት ቁጥርዎን</b> ያስገቡ:',
  account_number_invalid: '❌ የአካውንት ቁጥር ቁጥር ብቻ መሆን አለበት። እንደገና ሞክሩ:',
  account_verifying: '⏳ <b>የአካውንት ምደባ እየተረጋገጠ ነው...</b>',

  // Server selection
  server_prompt: '🖥️ የ<b>MT5 ሰርቨርዎን</b> ይምረጡ:',
  server_type_manually: 'በእጅ ይጻፉ',
  server_confirm: 'ሰርቨርዎ <b>{name}</b> ነው?',
  server_yes: '✅ አዎ',
  server_no: '❌ አይደለም፣ እንደገና ልጻፍ',
  server_not_found: '❌ ከሚታወቁ ሰርቨሮች ጋር ማዛመድ አልተቻለም።\n\nከአማራጮቹ ይምረጡ ወይም ሰርቨሩን በትክክል ይጻፉ:',

  // Investor password
  password_prompt: '🔑 የ<b>Investor (Read-Only) ፓስዎርድዎን</b> ያስገቡ\n\nይህ MT5 አካውንትዎን ለማየት ብቻ ያስችላል።\n⚠️ <i>ዋና የአካውንቶ ፓስዎርድዎ አይደለም።</i>\n\nInvestor ፓስዎርድዎን ይላኩ:',
  password_too_short: '❌ ፓስዎርድ አጭር ይመስላል። Investor ፓስዎርድዎን ያስገቡ:',
  password_confirm_prompt: '🔑 ለማረጋገጥ Investor ፓስዎርድዎን <b>እንደገና</b> ያስገቡ:',
  password_mismatch: '❌ <b>ፓስዎርዶች አይዛመዱም።</b> Investor ፓስዎርድዎን እንደገና ያስገቡ:',

  // VPS verification
  vps_verifying: '⏳ <b>የMT5 ግንኙነት እየተረጋገጠ ነው...</b>\n<i>እስከ 30 ሰከንድ ሊወስድ ይችላል።</i>',
  vps_connected: '✅ <b>ተገናኝቷል!</b> አካውንትዎ ተረጋግጧል ።',
  vps_invalid_credentials: '❌ <b>ግንኙነት አልተሳካም</b> — ልክ ያልሆነ ፓስዎርድ።',
  vps_server_error: '❌ <b>ግንኙነት አልተሳካም</b> — MT5 ሰርቨር ማግኘት አልተቻለም።',

  // Nickname
  nickname_prompt: '🏷️ ማጠናቀቅ ላይ ነዎት! የ<b>ቻሌንጅ ስም</b> ይምረጡ\n\nይህ በደረጃ ሰንጠረዥ ላይ ከእውነተኛ ስምዎ ይልቅ ይታያል።\n• 3-20 ፊደላት\n• ፊደላት፣ ቁጥሮች፣ underscore ብቻ\n• ልዩ መሆን አለበት\n\nስምዎን ይላኩ:',
  nickname_too_short: '❌ ስም 3-20 ፊደላት መሆን አለበት። እንደገና ሞክሩ:',
  nickname_invalid_chars: '❌ ፊደላት፣ ቁጥሮች እና underscore ብቻ ይፈቀዳሉ። እንደገና ሞክሩ:',
  nickname_blocked: '❌ ያንን ስም መጠቀም አይቻልም — ከብራንዳችን ጋር ይመሳሰላል። ሌላ ስም ይምረጡ:',
  nickname_taken: '❌ <b>"{name}"</b> ቀድሞ ተይዟል። ሌላ ስም ይምረጡ:',

  // Registration complete
  reg_complete: '✅ <b>ምዝገባ ተጠናቅቋል!</b>\n\n📋 <b>ምዝገባዎ:</b>\n🏷️ <b>ስም:</b> {nick}\n📧 <b>ኢሜል:</b> {email}\n🏦 <b>{type} አካውንት:</b> {number}\n🖥️ <b>ሰርቨር:</b> {server}\n📊 <b>ዓይነት:</b> {type}\n🔑 <b>Investor ፓስዎርድ:</b> ✅ ተቀምጧል\n\n⏳ <b>ቻሌንጅ የሚጀምረው:</b> {startDate}\n\n⚠️ <b>ማስጠንቀቂያ:</b> ፈተናው እስኪጠናቀቅ እና አሸናፊዎች እስኪገለጹ ድረስ investor ፓስዎርድዎን አይቀይሩ። የትሬድ መረጃዎን አውቶማቲካሊ እንወስዳለን — አካውንትዎ አክሰስ ማረግ ካልቻልን ከቻሌንጁ ሊሰረዙ ይችላሉ።\n\n⚠️ <i>ቻሌንጁን ከመጀመርዎ በፊት ደንቦቹን ያንብቡ!</i>\n\nቻሌንጁ ከመጀመሩ በፊት አካውንት ቁጥርዎን መቀየር ይችላሉ።',
  reg_change_account_btn: '🔄 አካውንት ቁጥር ቀይር',
  reg_switch_real_btn: '🔀 ወደ Real አካውንት ቀይር',
  reg_switch_demo_btn: '🔀 ወደ Demo አካውንት ቀይር',

  // Submission flow
  submit_email_prompt: '📧 ማንነትዎን ለማረጋገጥ የ<b>Exness ኢሜልዎን</b> ያስገቡ:',
  submit_email_not_found: '❌ <b>ይህ ኢሜል ለዚህ ፈተና አልተመዘገበም።</b>\n\nኢሜልዎን ያረጋግጡና እንደገና ይሞክሩ።',
  submit_email_wrong_user: '❌ <b>ይህ ኢሜል በሌላ አካውንት ተመዝግቧል።</b>\n\nየተመዘገቡበትን የTelegram አካውንት ይጠቀሙ።',
  submit_email_verified: '✅ <b>ማንነት ተረጋግጧል!</b>',
  submit_balance_prompt: '💰 የመጨረሻ ሂሳብዎ ስንት ነው?\n<i>(ቁጥር ብቻ ያስገቡ፣ ለምሳሌ 67.50)</i>',
  submit_balance_invalid: '❌ እባክዎ ትክክለኛ ቁጥር ያስገቡ።',
  submit_balance_below_target: '❌ ግቡ <b>${target}</b> ነው። ሂሳብዎ <b>${balance}</b> ግቡን አልደረሰም።\n\n<i>በሚቀጥለው ጊዜ መልካም ዕድል!</i> 💪',
  submit_screenshot_prompt: '📸 የመጨረሻ ሂሳብዎን <b>ስክሪን-ሾት</b> አፕሎድ ያርጉ።\n\nየሚከተሉትን በግልጽ ማሳየት አለበት:\n➡️ የአካውንት ቁጥር\n➡️ የመጨረሻ ሂሳብ',
  submit_complete: '✅ <b>ውጤቶች በተሳካ ሁኔታ ቀርበዋል!</b>\n\n📋 <b>ያቀረቡት:</b>\n📧 <b>ኢሜል:</b> {email}\n🏦 <b>አካውንት:</b> {number}\n🖥️ <b>ሰርቨር:</b> {server}\n📊 <b>ዓይነት:</b> {type}\n💰 <b>የመጨረሻ ሂሳብ:</b> ${balance}\n📸 <b>ስክሪን-ሾት ምስል:</b> ✅\n\n⏳ ቡድናችን ውጤቶችን ይገመግማል።\n<i>ስለተሳተፉ እናመሰግናለን!</i> 🎉',

  // Balance warning DM
  balance_warning_title: '⚠️ <b>ባላንስ ከፍ ያለ ነው</b>',
  balance_warning_body: 'አካውንትዎ <b>{number}</b> አሁን <b>{balance}</b> አለው ግን ቻሌንጅ የሚጀምርበት ገደብ <b>{limit}</b> ነው።\n\nእባክዎ ቻሌንጅ ከመጀመሩ በፊት ሂሳብዎን ወደ <b>{limit}</b> ወይም ከዚያ በታች ይቀንሱ።\n\n💸 <b>ትርፍ:</b> {excess}\n📋 <b>ቻሌንጅ:</b> {title}\n📅 <b>ቻሌንጅ ሚጀምረው:</b> {startDate}\n\n🚫 ቻሌንጅ ሲጀምር ሂሳብዎ ከ<b>{limit}</b> በላይ ከሆነ <b>ከቻሌንጁ ይሰረዛሉ</b>።',
  balance_ok: '✅ <b>ሂሳብ ትክክል ነው</b>\n\nየአካውንትዎ <b>{number}</b> ሂሳብ አሁን በተፈቀደው ገደብ ውስጥ ነው። ለፈተናው ዝግጁ ነዎት! 👍',

  // Password update DM
  password_update_prompt: '⚠️ Investor ፓስዎርድዎ መዘመን አለበት።\n\nአዲሱን investor ፓስዎርድዎን ያስገቡ:',
  password_update_success: '✅ <b>ፓስዎርድ በተሳካ ሁኔታ ተዘምኗል!</b>\n\nአካውንትዎ አሁን ተደራሽ ነው። የትሬድ ታሪክዎን እየወሰድን ነው።\n\n⚠️ <b>ያስታውሱ:</b> ቻሌንጁ እስኪጠናቀቅ ድረስ investor ፓስዎርድዎን እንደገና አይቀይሩ።',

  // Errors
  error_challenge_not_found: '❌ ቻሌንጅ አልተገኘም።',
  error_registration_closed: '❌ <b>ምዝገባ ተዘግቷል።</b>\nይህ ቻሌንጅ ቀድሞ ጀምሯል።\n\nለሚቀጥለው ቻሌንጅ ይጠብቁ <b>@BirrForex!</b>',
  error_not_accepting: '❌ ይህ ቻሌንጅ ምዝገባ እየተቀበለ አይደለም።',
  error_already_registered: '⚠️ ለዚህ ቻሌንጅ ቀድመው ተመዝግበዋል።',
  error_registration_failed: '❌ ምዝገባ ማጠናቀቅ አልተቻለም ። እባክዎ እንደገና ይሞክሩ።',
  error_submission_deadline: '❌ <b>የማስገባት ጊዜ አልፏል።</b>\n<i>ዘግይተው ያቀረቡትን አንቀበልም፤፤</i>',
};
