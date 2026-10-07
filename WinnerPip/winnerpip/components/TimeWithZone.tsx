import React from 'react';
/** Keep timezone visible without giving it the same visual weight as the timestamp. */
export default function TimeWithZone({text,timezone}:{text:string;timezone?:string}) {
 const match=text.match(/^(.*?)\s+(GMT(?:[+-]\d{1,2}(?::\d{2})?)?|UTC|EAT|BST|CAT|SAST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|CET|CEST|IST)$/);
 const zone=match?.[2] || (timezone ? new Intl.DateTimeFormat('en-US',{timeZone:timezone,timeZoneName:'short'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName')?.value : '');
 return <span>{match?.[1] || text}{zone && text && text!=='—' && <small className="ml-1 text-[0.75em] font-normal opacity-70 whitespace-nowrap" title={timezone}>{zone}</small>}</span>;
}
