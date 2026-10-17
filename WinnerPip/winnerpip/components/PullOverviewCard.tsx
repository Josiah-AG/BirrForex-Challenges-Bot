import {Activity} from 'lucide-react';
export default function PullOverviewCard({today,success,failed,passwordChanged,next}:{today:number;success:number;failed:number;passwordChanged:number;next:string}){
 return <div className="min-w-0 max-w-full [overflow-wrap:anywhere] glass rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 text-left">
 <div className="flex items-center gap-1.5 mb-2 text-blue-400"><Activity size={16} className="shrink-0"/><p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider font-medium">Pull Activity</p></div>
 <div className="flex flex-wrap gap-x-5 gap-y-2"><div className="min-w-0"><p className="text-[9px] sm:text-[10px] text-gray-400">Pulls today</p><strong className="block text-lg sm:text-2xl md:text-3xl text-blue-400 leading-snug tabular-nums">{today.toLocaleString()}</strong></div><div className="min-w-0"><p className="text-[9px] sm:text-[10px] text-gray-400">Successful</p><strong className="block text-lg sm:text-2xl md:text-3xl text-emerald-400 leading-snug tabular-nums">{success.toLocaleString()}</strong></div></div>
 <p className="text-[9px] sm:text-[10px] text-gray-500 mt-1 flex flex-wrap gap-x-2"><span>Failed: {failed}</span><span>PW changed: {passwordChanged}</span></p>
 <p className="text-[9px] sm:text-[10px] text-blue-300 mt-1">Next: {next}</p>
 </div>;
}
