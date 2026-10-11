/** Recover only the fields carried by our old Telegram review notice. No credentials. */
export function parseManualReviewNotice(text:string,userId:number):any|null {
 if(!text.includes('MANUAL REVIEW REQUIRED'))return null;
 const id=text.match(/ID:\s*(\d+)/)?.[1];
 const email=text.match(/📧\s*([^\s]+@[^\s]+)/)?.[1];
 const account=text.match(/🏦\s*(\d+)/)?.[1];
 const server=text.match(/🖥️?\s*([^\n]+)/)?.[1]?.trim();
 const type=text.match(/📊\s*(Demo|Real)/)?.[1]?.toLowerCase();
 if(Number(id)!==userId||!email||!account||!server||server==='N/A'||!type)return null;
 return {user_id:userId,username:text.match(/👤\s*@([^\s]+)/)?.[1]||null,email,account_number:account,mt5_server:server,account_type:type,lang:'en',verification_error:'Recovered older manual-review notice; original error unavailable'};
}
