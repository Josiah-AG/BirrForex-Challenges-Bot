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

  // Change account flow
  change_acct_title: '🔄 <b>አካውንት ቁጥር ቀይር</b>\n\n📋 አሁን ያለው: {number} ({server})\n\nአዲሱን <b>MT5 {type} አካውንት ቁጥር</b> ያስገቡ:\n⚠️ <i>MT5 ትሬዲንግ አካውንት መሆን አለበት።</i>',
  change_acct_number_invalid: '❌ የአካውንት ቁጥር ቁጥር ብቻ መሆን አለበት። እንደገና ሞክሩ:',
  change_acct_password_prompt: '🖥️ ሰርቨር: <b>{server}</b>\n\n🔑 ለአዲሱ አካውንት የ<b>Investor (Read-Only) ፓስዎርድ</b> ያስገቡ:\n⚠️ <i>ዋና የአካውንቶ ፓስዎርድዎ አይደለም።</i>',
  change_acct_password_too_short: '❌ ፓስዎርድ አጭር ይመስላል። Investor ፓስዎርድዎን ያስገቡ:',
  change_acct_password_confirm: '🔑 ለማረጋገጥ Investor ፓስዎርድዎን <b>እንደገና</b> ያስገቡ:',
  change_acct_password_mismatch: '❌ <b>ፓስዎርዶች አይዛመዱም።</b> Investor ፓስዎርድዎን እንደገና ያስገቡ:',
  change_acct_success: '✅ <b>አካውንት በተሳካ ሁኔታ ተቀይሯል!</b>\n\n🏦 አዲስ አካውንት: <b>{number}</b>\n🖥️ ሰርቨር: <b>{server}</b>\n\n⚠️ ቻሌንጁ እስኪጠናቀቅ ድረስ investor ፓስዎርድዎን አይቀይሩ።',

  // Verification errors
  email_verified: '✅ <b>ኢሜል ተረጋግጧል!</b>\n\nአሁን የ<b>MT5 {type} አካውንት ቁጥርዎን</b> ያስገቡ:\n⚠️ MT5 ትሬዲንግ አካውንት መሆን አለበት።\n<i>ቁጥር ብቻ ይቀበላል።</i>',
  not_allocated: '⚠️ <b>የExness አካውንትዎ በBirrForex ስር አልተመዘገበም።</b>\n\nበመጀመሪያ ኢሜልዎን በትክክል መጻፍዎን ያረጋግጡ።\nስህተት ከነበረ ከታች እንደገና ማስገባት ይችላሉ።\n\nኢሜልዎ ትክክል ከሆነ ሁለት አማራጮች አሉዎት:\n\n✨ <b>አማራጭ 1: አዲስ Exness አካውንት ይፍጠሩ</b>\n➡️ ከታች ባለው የፓርትነር ሊንክ አዲስ አካውንት ይክፈቱ\n➡️ የተለየ ኢሜል መጠቀም ይችላሉ\n➡️ ያው ስልክ ቁጥር እና ዶክመንቶች ሊጠቀሙ ይችላሉ\n🔗 {signupLink}\n\n🔄 <b>አማራጭ 2: ፓርትነርዎን ወደ BirrForex ይቀይሩ</b>\n➡️ ወደ Exness አካውንትዎ ይግቡ\n➡️ Live Chat ይክፈቱ → "Change Partner" ብለው ይጻፉ\n➡️ ይህን ሊንክ በቅጹ ላይ ይለጥፉ:\n{partnerLink}\n➡️ በSMS ኮድ ያረጋግጡ\n➡️ ማረጋገጫ ይጠብቁ (ብዙውን ጊዜ ከ24 ሰዓት ውስጥ)\n\n{guideLink}\n\nከላይ ካሉት አማራጮች አንዱን ካጠናቀቁ በኋላ እንደገና ይሞክሩ:',
  kyc_failed: '❌ <b>የExness አካውንትዎ ሙሉ በሙሉ ቬሪፋይድ አይደለም።</b>\n\nእባክዎ በመጀመሪያ KYC ማረጋገጫዎን ያጠናቅቁ:\n➡️ ወደ <b>Exness Personal Area</b> ይግቡ\n➡️ <b>Settings → Verification</b> ይሂዱ\n➡️ መታወቂያዎን እና የአድራሻ ማረጋገጫ ያስገቡ\n➡️ ማጽደቅ ይጠብቁ (ብዙውን ጊዜ ጥቂት ደቂቃዎች)\n\nቬሪፊኬሽን ሲጨርሱ እንደገና ይሞክሩ:',
  real_acct_not_mt5: '⚠️ <b>ይህ አካውንት MT5 አይደለም።</b>\n\nለዚህ ቻለንጅ MT5 አካውንት ብቻ ነው የሚፈቀደው።\nእባክዎ በExness ውስጥ አዲስ <b>MT5 Real አካውንት</b> ይክፈቱ እና እንደገና ይሞክሩ።',
  real_acct_not_allocated: '⚠️ <b>ይህ real አካውንት በBirrForex ስር አይደለም።</b>\n\nእባክዎ በExness ውስጥ <b>አዲስ Real Account</b> ይክፈቱ (አዲስ Exness አካውንት ማለት አይደለም — ባለዎት Exness ውስጥ አዲስ Real trading account ይክፈቱ) እና ገንዘብዎን ወደዚያ ያስተላልፉ።\n\nአዲሱ real አካውንት <b>ለመመዝገብ በተጠቀሙት ኢሜል ስር</b> መሆኑን ያረጋግጡ።',
  real_acct_not_allocated_retry: '⚠️ <b>ይህ አካውንት ገና በBirrForex ስር አልተመዘገበም።</b>\n\nአዲስ የተፈጠረ አካውንት ሊያያዝ ጥቂት ደቂቃዎች ሊወስድ ይችላል።\nእባክዎ ከ<b>15 ደቂቃ</b> በኋላ ተመልሰው ይሞክሩ።\n\nያስገቡት real አካውንት ለመመዝገብ በተጠቀሙት ኢሜል ስር መሆኑን ያረጋግጡ።',
  acct_ownership_mismatch: '⚠️ <b>ይህ አካውንት ከተመዘገቡበት ኢሜል ጋር አይዛመድም።</b>\n\nእባክዎ ያስገቡት real አካውንት ከኢሜልዎ Exness ፕሮፋይል ስር የተፈጠረ መሆኑን ያረጋግጡ።\n\nትክክለኛውን <b>MT5 Real አካውንት ቁጥር</b> ያስገቡ:',
  system_busy_retry: '⚠️ ሲስተም ተጨናንቋል። ከ3 ሰከንድ በኋላ እንደገና ይሞክራል...',
  system_busy_later: '⚠️ ሲስተም ተጨናንቋል። ከ30 ደቂቃ በኋላ እንደገና ይሞክሩ።',
  manual_verification: '⚠️ አውቶማቲክ ማረጋገጫ እየሰራ አይደለም። ማኗል እናረጋግጣለን።\n\n📧 ኢሜል: {email}\n\nየ<b>MT5 አካውንት ቁጥርዎን</b> ያስገቡ:',

  // Errors
  error_challenge_not_found: '❌ ቻሌንጅ አልተገኘም።',
  error_registration_closed: '❌ <b>ምዝገባ ተዘግቷል።</b>\nይህ ቻሌንጅ ቀድሞ ጀምሯል።\n\nለሚቀጥለው ቻሌንጅ ይጠብቁ <b>@BirrForex!</b>',
  error_not_accepting: '❌ ይህ ቻሌንጅ ምዝገባ እየተቀበለ አይደለም።',
  error_already_registered: '⚠️ ለዚህ ቻሌንጅ ቀድመው ተመዝግበዋል።',
  error_registration_failed: '❌ ምዝገባ ማጠናቀቅ አልተቻለም ። እባክዎ እንደገና ይሞክሩ።',
  error_submission_deadline: '❌ <b>የማስገባት ጊዜ አልፏል።</b>\n<i>ዘግይተው ያቀረቡትን አንቀበልም፤፤</i>',

  // VPS verification — account type / balance checks
  acct_subtype_not_allowed: '❌ <b>የአካውንት ዓይነት አይፈቀድም</b>\n\nአካውንትዎ <b>{subtype}</b> ነው። ይህ ቻሌንጅ <b>{accepted}</b> አካውንቶችን ብቻ ይቀበላል።\n\n📋 <b>Standard አካውንት ለመፍጠር:</b>\n1. Exness → My Accounts ይክፈቱ\n2. Create New Account → "Standard" ይምረጡ\n3. MT5 ይምረጡ\n\nሲዘጋጁ አካውንትዎን ያስገቡ:',
  balance_mismatch_demo: '❌ <b>ባላንስ አይዛመድም</b>\n\nየDemo አካውንትዎ ባላንስ <b>{actual}</b> ነው ግን ቻሌንጁ <b>{expected}</b> ይፈልጋል።\n\nእባክዎ ባላንስዎን ወደ <b>{expected}</b> ያድርጉና እንደገና ይሞክሩ።',
  only_cent_allowed: '❌ <b>Cent አካውንቶች ብቻ ይፈቀዳሉ</b>\n\nይህ ቻሌንጅ <b>Cent Account</b> (ምንዛሬ: USC) ይፈልጋል።\n\nአካውንትዎ Standard (ምንዛሬ: USD) ይመስላል።\n\n📋 <b>Cent Account ለመፍጠር:</b>\n1. Exness → My Accounts ይክፈቱ\n2. Create New Account → "Standard Cent" ይምረጡ\n3. MT5 ይምረጡ\n4. ገንዘብ ያስገቡ\n\nሲዘጋጁ Cent አካውንትዎን ያስገቡ:',
  balance_too_high: '❌ <b>ባላንስ ከፍ ያለ ነው</b>\n\nየአካውንትዎ ባላንስ <b>{balance}</b> ነው ይህም ከመጀመሪያ ባላንስ <b>{limit}</b> ይበልጣል።\n\nእባክዎ ባላንስዎን ወደ <b>{limit}</b> ወይም ከዚያ በታች ያውርዱ ከዚያ እንደገና ይመዝገቡ።',
  balance_zero_warning: '✅ <b>የMT5 ግንኙነት ተረጋግጧል!</b>\n\n⚠️ የአካውንትዎ ባላንስ <b>{zero}</b> ነው።\n\nእባክዎ ቻሌንጁ ከመጀመሩ በፊት ገንዘብ ያስገቡ።',
  balance_below_start: '✅ <b>የMT5 ግንኙነት ተረጋግጧል!</b>\n\nℹ️ ባላንስዎ <b>{balance}</b> ነው። የቻሌንጅ መጀመሪያ ባላንስ <b>{start}</b> ነው።\n\nአሁንም መሳተፍ ይችላሉ — ግቡ ምንም ቢጀምሩ አንድ ነው።\n\nተጨማሪ ማስገባት ከፈለጉ ቻሌንጁ ከመጀመሩ በፊት ያድርጉት። ቻሌንጁ ከጀመረ በኋላ ተጨማሪ ገንዘብ ማስገባት ያስወግድዎታል።',
  balance_ok_exact: '✅ <b>የMT5 ግንኙነት ተረጋግጧል!</b> ባላንስ: <b>{balance}</b> ✓',
  submit_another_acct_btn: '📝 ሌላ አካውንት ያስገቡ',
  submit_cent_acct_btn: '📝 Cent አካውንት ያስገቡ',
  new_acct_prompt: 'አዲስ <b>MT5 {type} አካውንት ቁጥር</b> ያስገቡ:\n⚠️ <i>MT5 ትሬዲንግ አካውንት መሆን አለበት።</i>',

  // Pre-start 2AM check — credential failure DMs
  prestart_credential_fail_demo: '⚠️ <b>የአካውንት ተደራሽነት ችግር — {title}</b>\n\nየDemo አካውንትዎን <b>{account}</b> ማግኘት አልቻልንም።\n\nይህ ሊሆን ይችላል:\n• Demo አካውንትዎ ተሰርዟል\n• Investor ፓስዎርድዎ ተቀይሯል\n\nDemo አካውንትዎ ከተሰረዘ አዲስ አካውንት ያስገቡ።\nአካውንትዎ ካለ investor ፓስዎርድዎን ያዘምኑ።\n\n⏰ <b>እባክዎ ቻሌንጁ ከመጀመሩ በፊት ያስተካክሉ ያለበለዚያ ከቻሌንጁ ይሰረዛሉ።</b>',
  prestart_credential_fail_real: '⚠️ <b>የአካውንት ተደራሽነት ችግር — {title}</b>\n\nየMT5 አካውንትዎን <b>{account}</b> ማግኘት አልቻልንም።\n\nInvestor ፓስዎርድዎ የተቀየረ ይመስላል።\nእባክዎ investor ፓስዎርድዎን ያዘምኑ።\n\n⏰ <b>እባክዎ ቻሌንጁ ከመጀመሩ በፊት ያስተካክሉ ያለበለዚያ ከቻሌንጁ ይሰረዛሉ።</b>',
  btn_change_account: '🔄 አካውንት ቁጥር ቀይር',
  btn_update_password: '🔑 ፓስዎርድ አዘምን',

  // VPS verification failures (registration flow)
  vps_credential_fail: '❌ <b>ግንኙነት አልተሳካም — ልክ ያልሆነ ፓስዎርድ ወይም አካውንት</b>\n\nInvestor ፓስዎርድ ወይም አካውንት ቁጥር/ሰርቨር ትክክል አይደለም።\n\nእባክዎ የሚከተሉትን ያረጋግጡ:\n• <b>አካውንት ቁጥር</b>\n• <b>ሰርቨር</b>\n• <b>Investor (Read-Only) ፓስዎርድ</b>\n\nየ<b>MT5 {type} አካውንት ቁጥርዎን</b> ያስገቡ:',
  vps_system_busy: '⚠️ <b>ሲስተም ተጨናንቋል።</b> እባክዎ እንደገና ይመዝገቡ።',

  // Pre-start 2AM check — balance warnings
  prestart_balance_warning: '⚠️ <b>ባላንስ ከፍ ያለ ነው</b>\n\nአካውንትዎ <b>{account}</b> አሁን <b>{balance}</b> አለው ግን የቻሌንጅ መጀመሪያ ገደብ <b>{limit}</b> ነው።\n\nእባክዎ ቻሌንጅ ከመጀመሩ በፊት ባላንስዎን ወደ <b>{limit}</b> ወይም ከዚያ በታች ይቀንሱ።\n\n💸 <b>ትርፍ:</b> {excess}\n📋 <b>ቻሌንጅ:</b> {title}\n📅 <b>ቻሌንጅ ሚጀምረው:</b> {startDate}\n\n🚫 ቻሌንጅ ሲጀምር ባላንስዎ ከ<b>{limit}</b> በላይ ከሆነ <b>ከቻሌንጁ ይሰረዛሉ</b>።',
  prestart_balance_ok: '✅ <b>ባላንስ ትክክል ነው</b>\n\nየአካውንትዎ <b>{account}</b> ባላንስ አሁን በተፈቀደው ገደብ ውስጥ ነው። ለቻሌንጁ ዝግጁ ነዎት! 👍',

  // Post password-update / account-change — WinnerPip login info
  winnerpip_login_updated: '\n\n📊 <b>WinnerPip:</b> የWinnerPip መግቢያዎ አሁን አዲሱ አካውንት ቁጥር እና ፓስዎርድ ነው።',
};
