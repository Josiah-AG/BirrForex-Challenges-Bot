import ChallengesClient from './ChallengesClient';
import Link from 'next/link';
export const revalidate=60;
export default async function Page({searchParams}:{searchParams:{winners?:string}}){
 let challenges=[];
 try {const res=await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api.winnerpip.com'}/api/challenges?include_past=true`,{next:{revalidate:60},signal:AbortSignal.timeout(10000)});if(res.ok){const data=await res.json();if(Array.isArray(data.challenges))challenges=data.challenges;}}catch{}
 return <><ChallengesClient initialChallenges={challenges} winnersId={Number(searchParams.winners) || undefined}/><nav className="bg-[#0a0e1a] text-center p-6"><Link href="/competitions" className="text-blue-300 underline">Public challenge details, dates and hosts</Link></nav></>;
}
