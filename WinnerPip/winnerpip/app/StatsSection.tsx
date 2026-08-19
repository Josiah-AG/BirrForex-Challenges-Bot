"use client";

import { useState, useEffect } from "react";

export function StatsSection() {
  const [stats, setStats] = useState({ challengesCompleted: 0, totalParticipants: 0, totalCashPrizes: 0, hasInKindPrizes: false });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.winnerpip.com";
    fetch(`${apiUrl}/api/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <section className="py-16 md:py-20 relative" aria-label="Platform statistics">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Our <span className="gradient-text">Track Record</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Real numbers from real challenges
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-4xl mx-auto">
          <div className="glass rounded-2xl p-6 text-center border border-white/10">
            <p className="text-3xl md:text-4xl font-bold gradient-text">{loaded ? stats.challengesCompleted : "..."}</p>
            <p className="text-sm text-gray-400 mt-2">Challenges Run</p>
          </div>
          <div className="glass rounded-2xl p-6 text-center border border-white/10">
            <p className="text-3xl md:text-4xl font-bold text-profit">{loaded ? stats.totalParticipants.toLocaleString() : "..."}</p>
            <p className="text-sm text-gray-400 mt-2">Total Registrations</p>
          </div>
          <div className="glass rounded-2xl p-6 text-center border border-white/10">
            <p className="text-3xl md:text-4xl font-bold text-gold">{loaded ? `$${stats.totalCashPrizes.toLocaleString()}+` : "..."}</p>
            <p className="text-sm text-gray-400 mt-2">Prizes Given</p>
            {stats.hasInKindPrizes && loaded && <p className="text-[10px] text-gold mt-1">+ iPhones and other prizes</p>}
          </div>
          <div className="glass rounded-2xl p-6 text-center border border-white/10">
            <p className="text-3xl md:text-4xl font-bold text-royal">24/7</p>
            <p className="text-sm text-gray-400 mt-2">Monitoring</p>
          </div>
        </div>
      </div>
    </section>
  );
}
