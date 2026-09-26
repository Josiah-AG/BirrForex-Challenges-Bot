/** Router inventory is authoritative; environment counts must not invent workers. */
export function terminalInventory(health: any): { ids: number[]; healthyIds: number[] } {
  const count = health?.terminals;
  if (!Number.isInteger(count) || count < 1 || count > 15 || !Array.isArray(health.healthy_terminals))
    throw new Error('VPS terminal inventory unavailable or invalid');
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  if (health.healthy_terminals.some((id: any) => !Number.isInteger(id) || !ids.includes(id)))
    throw new Error('VPS reported an invalid healthy terminal');
  return { ids, healthyIds: [...new Set<number>(health.healthy_terminals)].sort((a,b)=>a-b) };
}
