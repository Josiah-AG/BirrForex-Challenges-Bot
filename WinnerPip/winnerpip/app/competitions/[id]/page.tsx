import type {Metadata} from 'next';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getPublicCompetitions,organizer,statusLabel,dateLabel,competitionData,jsonLd} from '@/lib/publicCompetitions';
export const revalidate=60;
async function find(id:string){if(!/^\d+$/.test(id))notFound();const c=(await getPublicCompetitions()).find(c=>String(c.id)===id);if(!c)notFound();return c;}
export async function generateMetadata({params}:{params:{id:string}}):Promise<Metadata>{const c=await find(params.id);const title=`${c.title} — Hosted by ${organizer(c)}`;const description=`${c.title} is a ${c.type} trading challenge hosted by ${organizer(c)} on WinnerPip. ${statusLabel(c)}. View official dates and registration details.`;return {title,description,alternates:{canonical:`/competitions/${c.id}`},openGraph:{title,description,url:`/competitions/${c.id}`},twitter:{card:'summary',title,description}};}
export default async function Page({params}:{params:{id:string}}){const c=await find(params.id);return <main className="min-h-screen bg-[#0a0e1a] text-white px-4 py-10"><article className="max-w-3xl mx-auto rounded-2xl border border-white/15 bg-[#141b2d] p-6 md:p-10">
<script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(competitionData(c))}}/>
<Link href="/competitions" className="text-blue-300 underline">All competitions and hosts</Link>
<p className="text-yellow-400 mt-8">{statusLabel(c)}</p><h1 className="text-3xl font-bold mt-3">{c.title}</h1>
<p className="text-xl mt-5">Hosted by <strong>{organizer(c)}</strong></p><p className="text-gray-300 mt-3">WinnerPip provides the competition platform and automated MT5 performance tracking. The organizer of this challenge is {organizer(c)}.</p>
<dl className="grid gap-5 sm:grid-cols-2 my-8">{[['Account category',c.type==='hybrid'?'Demo and real':c.type],['Registration deadline',dateLabel(c.registrationDeadline)],['Challenge starts',dateLabel(c.startDate)],['Challenge ends',dateLabel(c.endDate)]].map(([label,value])=><div key={label}><dt className="text-gray-400">{label}</dt><dd className="mt-1">{value}</dd></div>)}</dl>
{c.prizePoolText&&<p className="mb-6">Prizes: {c.prizePoolText}</p>}
<p className="text-gray-300 mb-6">Review the challenge rules and eligibility requirements before registering. Registration availability is checked when you enter the challenge.</p>
<Link href={`/challenge/${c.id}`} className="inline-block bg-blue-700 rounded-xl px-6 py-3">{c.status==='registration_open'?'View challenge and registration options':'View challenge'}</Link>
</article></main>;}
