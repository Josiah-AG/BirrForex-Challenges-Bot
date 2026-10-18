interface ListedChallenge { status:string; displayStatus?:string; winnersPostedAt?:string|null; endDate:string }
export function hasEnded(c:ListedChallenge):boolean {
  return ['ended','completed'].includes(c.displayStatus || c.status) || c.status==='completed';
}
export function isPastChallenge(c:ListedChallenge,now=Date.now()):boolean {
  if(!hasEnded(c))return false;
  if(c.winnersPostedAt)return now-new Date(c.winnersPostedAt).getTime()>7*86400000;
  // Finalized results stay current until publication. Preserve old completed archives.
  return c.status==='completed' && now-new Date(c.endDate).getTime()>14*86400000;
}
