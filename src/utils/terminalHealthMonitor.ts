/** Alert state is independent from pull scheduling and uses one timestamped snapshot. */
export class TerminalHealthMonitor {
  private outages = new Map<number, { since: number; samples: number; announced: boolean }>();
  observe(ids: number[], healthyIds: number[], now: number, maintenance: number[] = []) {
    const down: { id: number; since: number }[] = [];
    const recovered: { id: number; since: number; recoveredAt: number }[] = [];
    for (const id of this.outages.keys()) {
      if (!ids.includes(id) || maintenance.includes(id)) this.outages.delete(id);
    }
    for (const id of ids.filter(id => !maintenance.includes(id))) {
      const incident = this.outages.get(id);
      if (healthyIds.includes(id)) {
        if (incident?.announced) recovered.push({ id, since: incident.since, recoveredAt: now });
        this.outages.delete(id);
      } else {
        const outage = incident || { since: now, samples: 0, announced: false };
        outage.samples++;
        if (outage.samples >= 2 && !outage.announced) {
          outage.announced = true;
          down.push({ id, since: outage.since });
        }
        this.outages.set(id, outage);
      }
    }
    return { down, recovered, confirmedDown: [...this.outages].filter(([, o]) => o.announced).map(([id]) => id) };
  }
  // An unavailable router is unknown, not evidence that every worker has failed.
  unknown() {
    for (const outage of this.outages.values()) if (!outage.announced) outage.samples = 0;
  }
}
export function outageDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s`;
}
