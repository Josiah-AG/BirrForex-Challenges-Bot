import { Trophy } from 'lucide-react';
export default function NoTargetOverviewCard({summary}:{summary:{value:string;sub:string}}){
 return <div className="min-w-0 max-w-full [overflow-wrap:anywhere] glass rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-white/10 text-left">
  <div className="flex items-center gap-1.5 mb-1.5 text-gold"><Trophy size={16}/><p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider font-medium">Qualified</p></div>
  <p className="text-lg sm:text-2xl md:text-3xl font-bold text-gold">{summary.value}</p>
  {summary.sub && <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{summary.sub}</p>}
 </div>;
}
