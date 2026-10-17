export const balanceRanges:Record<number,string>={1:'$0–10',2:'$10–50',3:'$50–250',4:'$250–1,000',5:'$1,000–5,000',6:'Over $5,000'};
export function newClientReport(c:any,participants:any[],clients:any[],now=Date.now()) {
 const start=c.registration_opened_at||c.first_registration;
 const end=Math.min(+new Date(c.registration_deadline||c.start_date),+new Date(c.start_date));
 const lower=+new Date(start),upper=Math.min(end,now);
 if(!start||!Number.isFinite(lower)||!Number.isFinite(end))return {rows:[],count:null,partial:true,unresolved:participants.length,notice:'Registration window unavailable',updatedAt:new Date(now).toISOString()};
 const directory=new Map<string,any>();
 for(const client of clients){const uid=String(client.client_uid||'').toLowerCase();if(uid)directory.set(uid,client);}
 const periodRegistrations=[...directory.values()].filter(client=>{const date=Date.parse(client.reg_date);return Number.isFinite(date)&&date>=lower&&date<upper;}).length;
 let unresolved=0;const matched=new Map<string,any>();
 for(const p of participants){
  if(+new Date(p.registered_at)>=end)continue;
  const key=String(p.client_uid||'').trim().toLowerCase();
  const matches=key?[...directory.keys()].filter(uid=>uid===key||(key.length>=8&&uid.startsWith(key))):[];
  if(matches.length!==1){unresolved++;continue;}
  const uid=matches[0],client=directory.get(uid),registered=Date.parse(client.reg_date);
  if(!Number.isFinite(registered)){unresolved++;continue;}
  if(registered<lower||registered>=upper||registered>+new Date(p.registered_at))continue;
  const row=matched.get(uid);
  if(row){if(!row.accounts.includes(p.account_number))row.accounts.push(p.account_number);continue;}
  const range=Number(client.client_balance);
  matched.set(uid,{nickname:p.nickname||p.username||'Participant',email:p.email||null,accounts:[p.account_number],category:p.account_type,registeredAt:client.reg_date,joinedAt:p.registered_at,balanceRange:balanceRanges[range]||'Unavailable',balanceOrder:balanceRanges[range]?range:0});
 }
 const rows=[...matched.values()].sort((a,b)=>b.balanceOrder-a.balanceOrder||a.nickname.localeCompare(b.nickname));
 return {rows,count:rows.length,periodRegistrations,conversionPercent:periodRegistrations>0?Math.round(rows.length/periodRegistrations*10000)/100:null,partial:!c.registration_opened_at||unresolved>0,unresolved,windowStart:start,windowEnd:new Date(end).toISOString(),historical:!c.registration_opened_at,
 notice:!c.registration_opened_at?'Historical partial: counted from the first recorded challenge registration; the original opening time was not saved.':null,
 updatedAt:new Date(now).toISOString(),nextRefreshAt:now<end?new Date(now+3600000).toISOString():null};
}
