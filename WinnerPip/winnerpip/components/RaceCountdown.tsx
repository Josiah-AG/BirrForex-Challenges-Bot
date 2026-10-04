"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

export default function RaceCountdown({ startDate }: { startDate: string }) {
  const target = Date.parse(startDate);
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [target]);
  if (!Number.isFinite(target)) return null;
  const values = remaining === null ? null : [
    Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24,
    Math.floor(remaining / 60) % 60, remaining % 60,
  ];
  return (
    <div className="mb-5 rounded-xl border border-royal/30 bg-gradient-to-br from-royal/15 to-gold/5 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-blue-300">
        <Timer size={15} aria-hidden="true" />
        <span>{remaining === 0 ? "Scheduled start reached" : "Race starts in"}</span>
      </div>
      <div role="timer" aria-label="Time until challenge starts" aria-live="off" className="grid grid-cols-4 gap-2">
        {["Days", "Hours", "Minutes", "Seconds"].map((label, index) => (
          <div key={label} className="min-w-0 rounded-lg border border-white/10 bg-black/15 py-2 text-center">
            <span className="block text-xl sm:text-2xl font-bold tabular-nums text-white">{values ? String(values[index]).padStart(2, "0") : "--"}</span>
            <span className="block mt-0.5 text-[10px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
