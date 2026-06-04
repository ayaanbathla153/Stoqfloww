// Smart compact product names.
// "Bathla Chocolate Protein Shake 250ml" -> "Chocolate · 250ml"

const SIZE_RE = /\b(\d+(?:\.\d+)?)\s?(ml|l|ltr|litre|g|gm|gms|kg|pcs?|pack|pkt|box|jar|bottle)\b/i;
const GENERIC = new Set([
  "the","a","of","with","and","for","plus","new","pure","premium","classic","original",
  "shake","powder","drink","juice","tea","coffee","milk","water","biscuit","biscuits",
  "soap","oil","cream","lotion","spray","jar","jars","bottle","pack","packet","box",
  "protein","instant","ready","fresh","natural","organic",
]);

export interface ParsedName {
  brand?: string;
  variant?: string;
  size?: string;
  full: string;
}

export function parseName(name: string, brandHints: string[] = []): ParsedName {
  const full = (name || "").trim();
  if (!full) return { full: "" };
  const tokens = full.split(/\s+/);

  let size: string | undefined;
  const m = full.match(SIZE_RE);
  if (m) size = `${m[1]}${m[2].toLowerCase()}`;

  const lower = tokens.map((t) => t.toLowerCase());
  let brand: string | undefined;
  if (brandHints.some((b) => lower[0] === b.toLowerCase())) brand = tokens[0];
  else if (tokens.length >= 3) brand = tokens[0]; // best-effort: first word

  // variant = first interesting non-brand, non-generic word
  const variant = tokens.find((t, i) => {
    if (brand && i === 0) return false;
    const l = t.toLowerCase();
    if (GENERIC.has(l)) return false;
    if (SIZE_RE.test(t)) return false;
    return /^[a-zA-Z]/.test(t);
  });

  return { brand, variant, size, full };
}

/** Compact display: "Chocolate · 250ml" — falls back gracefully. */
export function compactName(name: string, brandHints: string[] = []): string {
  const p = parseName(name, brandHints);
  const parts: string[] = [];
  if (p.variant) parts.push(p.variant);
  if (p.size) parts.push(p.size);
  if (parts.length === 0) {
    // middle-truncate fallback
    if (p.full.length <= 22) return p.full;
    return p.full.slice(0, 12) + "…" + p.full.slice(-8);
  }
  return parts.join(" · ");
}

/** Detect brand from a catalog (most common first word, if it appears in >50% of names). */
export function detectBrandHints(names: string[]): string[] {
  const counts: Record<string, number> = {};
  names.forEach((n) => {
    const first = (n || "").trim().split(/\s+/)[0];
    if (first) counts[first] = (counts[first] ?? 0) + 1;
  });
  const total = names.length || 1;
  return Object.entries(counts)
    .filter(([, c]) => c / total >= 0.4)
    .map(([w]) => w);
}
