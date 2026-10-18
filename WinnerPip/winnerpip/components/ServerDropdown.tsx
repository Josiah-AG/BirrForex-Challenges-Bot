'use client';
import {useState,useRef,useEffect} from 'react';
import {serverChoices} from '../lib/exnessServers';
export default function ServerDropdown({ value, accountType, onChange, disabled }: { value: string; accountType: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const previousType = useRef(accountType);
  const filtered = serverChoices(search, accountType);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { if (value) setSearch(value); }, [value]);
  useEffect(() => { if (previousType.current !== accountType) { previousType.current = accountType; setSearch(''); onChange(''); } }, [accountType, onChange]);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={search}
        onChange={e => { setSearch(e.target.value); if (value) onChange(''); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm outline-none focus:border-royal/50 transition-all"
        placeholder="Search and select your MT5 server"
        disabled={disabled}
      />
      {open && filtered.length === 0 && <div className="mt-1 p-3 text-sm text-gray-400">No matching server. Choose a server from the available list.</div>}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-xl bg-[#1a2235] border border-white/15 shadow-xl">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setSearch(s); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-royal/20 transition-all ${s === value ? 'bg-royal/10 text-royal font-medium' : 'text-gray-300'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
