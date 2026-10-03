import {cache} from 'react';
export const SITE='https://winnerpip.com';
export interface PublicCompetition {id:number;title:string;type:string;status:string;startDate:string;endDate:string;registrationDeadline?:string;hostId?:number|null;hostDisplayName?:string|null;prizePoolText?:string|null;}
export const getPublicCompetitions=cache(async():Promise<PublicCompetition[]>=>{
 const r=await fetch(`${process.env.NEXT_PUBLIC_API_URL||'https://api.winnerpip.com'}/api/challenges?include_past=true`,{next:{revalidate:60},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('Challenge directory unavailable');const d=await r.json();if(!Array.isArray(d.challenges))throw new Error('Invalid directory');
 return d.challenges.filter((c:PublicCompetition)=>Number.isInteger(c.id)&&['registration_open','active','submission_open','reviewing','completed'].includes(c.status));
});
export function organizer(c:PublicCompetition){return c.hostId?c.hostDisplayName||'Independent host':'BirrForex';}
export function statusLabel(c:PublicCompetition){return ({registration_open:'Registration open',active:'Challenge in progress',submission_open:'Registration closed — results under review',reviewing:'Registration closed — results under review',completed:'Completed'} as Record<string,string>)[c.status]||'Registration closed';}
export function dateLabel(v?:string){return v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'}).format(new Date(v))+' UTC':'To be announced';}
export function competitionData(c:PublicCompetition){return {'@context':'https://schema.org','@type':'Event','@id':`${SITE}/competitions/${c.id}#event`,name:c.title,description:`${c.title} is a ${c.type} trading challenge hosted by ${organizer(c)} on WinnerPip. ${statusLabel(c)}.`,url:`${SITE}/competitions/${c.id}`,startDate:c.startDate,endDate:c.endDate,eventAttendanceMode:'https://schema.org/OnlineEventAttendanceMode',location:{'@type':'VirtualLocation',url:`${SITE}/competitions/${c.id}`},organizer:{'@type':'Organization',name:organizer(c)},image:`${SITE}/winnerpip_512.png`};}
export function jsonLd(d:unknown){return JSON.stringify(d).replace(/</g,'\\u003c');}
