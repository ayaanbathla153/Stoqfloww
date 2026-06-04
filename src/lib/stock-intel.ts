// Pure helpers for the Estimated Stock & Sales Intelligence System.
// No DB calls — caller passes data in. Keeps logic testable & UI-agnostic.

export type Confidence = "high" | "medium" | "low";

export interface InventoryRow {
  stock_quantity: number | string;
  last_verified_at?: string | null;
  avg_daily_sales?: number | string | null;
}

export function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export function confidenceFor(row: InventoryRow): Confidence {
  const d = daysSince(row.last_verified_at ?? null);
  if (d === null) return "low";
  let base: Confidence = d <= 7 ? "high" : d <= 20 ? "medium" : "low";
  // Downgrade if estimated stock is negative (impossible)
  if (Number(row.stock_quantity) < 0 && base !== "low") {
    base = base === "high" ? "medium" : "low";
  }
  return base;
}

export function confidenceMeta(c: Confidence) {
  switch (c) {
    case "high":   return { label: "High confidence",   dot: "bg-success", text: "text-success" };
    case "medium": return { label: "Medium confidence", dot: "bg-warning", text: "text-warning" };
    case "low":    return { label: "Needs verification", dot: "bg-destructive", text: "text-destructive" };
  }
}

export function lastVerifiedLabel(iso?: string | null): string {
  const d = daysSince(iso ?? null);
  if (d === null) return "Never verified";
  if (d === 0) return "Verified today";
  if (d === 1) return "Verified yesterday";
  if (d < 30) return `Verified ${d} days ago`;
  const m = Math.floor(d / 30);
  return `Verified ${m} month${m > 1 ? "s" : ""} ago`;
}

// days_of_cover = stock / avg_daily_sales
export function daysOfCover(row: InventoryRow): number | null {
  const ads = Number(row.avg_daily_sales ?? 0);
  if (!ads) return null;
  return Number(row.stock_quantity) / ads;
}

export function refillHint(row: InventoryRow): string | null {
  const c = daysOfCover(row);
  if (c === null) return null;
  if (c < 3) return "High stockout risk";
  if (c <= 14) return `Refill in ~${Math.round(c)} days`;
  if (c > 60) return "Overstocked";
  return null;
}

export type MovementClass = "fast" | "medium" | "slow" | "dead";

// Classify per supplier: top 25% = fast, bottom 25% (>0) = slow, 0 sales for >60d = dead.
export function classifyMovement(rows: { avg_daily_sales: number; last_verified_at?: string | null }[]) {
  const ads = rows.map((r) => Number(r.avg_daily_sales ?? 0)).filter((n) => n > 0).sort((a, b) => a - b);
  if (ads.length === 0) return { fastCut: Infinity, slowCut: 0 };
  const q = (p: number) => ads[Math.min(ads.length - 1, Math.floor(ads.length * p))];
  return { fastCut: q(0.75), slowCut: q(0.25) };
}

export function movementClass(
  ads: number,
  lastSale: string | null | undefined,
  cuts: { fastCut: number; slowCut: number },
): MovementClass {
  if (ads <= 0) {
    const d = daysSince(lastSale ?? null);
    if (d === null || d > 60) return "dead";
    return "slow";
  }
  if (ads >= cuts.fastCut) return "fast";
  if (ads <= cuts.slowCut) return "slow";
  return "medium";
}

// Detect anomalies on a saved verification cycle.
export function detectAnomaly(o: {
  opening: number; delivered: number; returned: number; closing: number;
}): string | null {
  const expected = o.opening + o.delivered - o.returned;
  if (o.closing > expected + 0.5) return "Counted more than possible — recount?";
  if (o.returned > 0 && o.delivered > 0 && o.returned / o.delivered > 0.3) return "High return rate this cycle";
  if (expected > 0 && (expected - o.closing) / expected > 0.7 && o.delivered === 0) {
    return "Unusual stock drop detected";
  }
  return null;
}
