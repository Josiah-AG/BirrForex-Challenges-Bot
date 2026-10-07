export function nextPullTime(challenge:any, now=new Date()):string {
 if(!challenge || !['active','reviewing'].includes(challenge.status) || challenge.leaderboard_locked_at || (challenge.status==='reviewing' && (challenge.winners_posted_at || new Date(challenge.end_date || challenge.endDate).getTime()<=now.getTime()-48*60*60*1000))) return 'Not scheduled';
 const tz=challenge.timezone || 'Africa/Nairobi';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(now);
 const part=(name:string)=>parts.find(p=>p.type===name)?.value || '';
 const current=`${part('hour')}:${part('minute')}`;
 const slots=(challenge.pull_times || challenge.pullTimes || ['00:00','04:00','08:00','12:00','16:00','20:00']).filter((s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)).sort();
 if(!slots.length)return 'Not scheduled';
 const next=slots.find((s:string)=>s>current);
 return `${next ? '' : 'Tomorrow '}${next || slots[0]} ${tz==='Africa/Nairobi'||tz==='Africa/Addis_Ababa'?'EAT':part('timeZoneName')}`;
}
