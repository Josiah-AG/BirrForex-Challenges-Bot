import BackButton from '@/components/BackButton';
import type {Metadata} from 'next';
import Link from 'next/link';
import PublicCompetitionDirectory from '@/components/PublicCompetitionDirectory';
export const revalidate=60;
export const metadata:Metadata={title:'Trading Challenges and Hosts',description:'Explore WinnerPip trading competitions, their organizers, registration status and official challenge dates.',alternates:{canonical:'/competitions'},openGraph:{url:'/competitions',title:'Trading Challenges and Hosts | WinnerPip'}};
export default function Page(){return <main className="min-h-screen bg-[#0a0e1a] text-white"><nav className="max-w-6xl mx-auto p-4"><BackButton fallback="/"/><br/><Link href="/">WinnerPip</Link> · <Link href="/challenges">Sign in or register for a challenge</Link></nav><h1 className="max-w-6xl mx-auto px-4 pt-8 text-3xl font-bold">Trading competitions on WinnerPip</h1><PublicCompetitionDirectory/></main>;}
