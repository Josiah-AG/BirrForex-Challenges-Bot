// Run against a locally built frontend; all challenge API responses are mocked.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const base=process.env.FRONTEND_TEST_URL||'http://127.0.0.1:3100';
 for(const status of ['active','reviewing','registration_open','draft']) {
 const page=await browser.newPage();await page.route('**/api/challenges',r=>r.fulfill({json:{challenges:[{id:36,title:'TRIAL',status,hostId:1,registrationMode:'winnerpip',type:'demo'}]}}));
 await page.goto(`${base}/login?challenge=36`);
 const label=status==='registration_open'?'Register Now':status==='draft'?'Registration Not Open Yet':'Registration Closed';
 const control=page.getByRole(status==='registration_open'?'link':'button',{name:label,exact:true});await control.waitFor();
 if(status!=='registration_open')assert.equal(await control.isDisabled(),true);else assert.equal(await control.getAttribute('href'),'/challenge/36?register=true');
 assert.equal(await page.getByRole('button',{name:'Sign In',exact:true}).count(),1);
 console.log(status+': registration state correct; sign-in form present');await page.close();
 }
 const page=await browser.newPage();await page.route('**/api/challenges?*',r=>r.fulfill({json:{challenges:[{id:36,title:'TRIAL',status:'active',displayStatus:'ongoing',hostId:1,registrationMode:'winnerpip',type:'demo'}]}}));
 await page.goto(`${base}/challenge/36?register=true`);await page.getByRole('button',{name:'Sign In with Account'}).waitFor();assert(await page.getByRole('button',{name:'Registration Closed'}).isDisabled());assert.equal(await page.getByRole('link',{name:'Register via Telegram'}).count(),0);console.log('Closed direct link: sign-in visible, registration disabled, no Telegram fallback');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
