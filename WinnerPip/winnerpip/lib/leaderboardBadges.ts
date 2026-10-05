// Presentation only: a trophy marks a current prize position, not a final award.
const value = (o: any, key: string) => o?.[key] ?? o?.[key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())];
const bool = (v: any, fallback: boolean) => v == null ? fallback : v === true || v === "true" || v === 1;
const number = (v: any) => v == null || v === "" ? NaN : Number(v);

export function leaderboardBadges(entry: any, challenge: any, preStart = false) {
  const empty = { highlight: false, trophy: false };
  if (!challenge || preStart || entry.isDisqualified || entry.isWithdrawn || entry.isBlown || entry.notYetEvaluated) return empty;
  const category = entry.accountType;
  if (category !== "demo" && category !== "real") return empty;
  const split = challenge.type === "hybrid" && bool(value(challenge, "split_category_settings"), false);
  const setting = (key: string) => value(challenge, split ? `${category}_${key}` : key);
  const rank = number(entry.categoryRank ?? entry.rank);
  const count = number(value(challenge, `${category}_winners_count`));
  const top = rank > 0 && count > 0 && rank <= count;
  const balance = number(entry.adjustedBalance) - Number(entry.totalWithdrawn || 0);
  if (!Number.isFinite(balance)) return empty;
  const centOnly = challenge.type === "real" && bool(value(challenge, "only_cent_account"), false);
  const factor = entry.isCent && !centOnly ? 100 : 1;
  const targetEnabled = bool(setting("target_enabled"), true);
  let highlight = false;
  if (!targetEnabled) {
    // With the floor disabled, highlight prize positions even when losing.
    const floor = entry.actualStartingBalance != null ? number(entry.actualStartingBalance) : number(setting("starting_balance")) * factor;
    highlight = bool(setting("allow_below_start"), false) ? top : Number.isFinite(floor) && balance >= floor;
  } else if ((setting("deposit_mode") ?? "fixed") !== "fixed" && number(setting("target_percent")) > 0) {
    highlight = number(entry.growthPercent) >= number(setting("target_percent"));
  } else {
    const target = number(setting("target_balance")) * factor;
    highlight = Number.isFinite(target) && target > 0 && balance >= target;
  }
  return { highlight, trophy: highlight && top };
}
