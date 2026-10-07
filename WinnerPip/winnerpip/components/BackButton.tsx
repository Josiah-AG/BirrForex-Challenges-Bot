"use client";
import {useRouter} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
export default function BackButton({fallback='/challenges'}:{fallback?:string}) {
 const router=useRouter();
 return <button type="button" onClick={()=>{if(window.history.length>1) router.back(); else router.push(fallback);}} className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-white mb-4"><ArrowLeft size={18}/>Back</button>;
}
