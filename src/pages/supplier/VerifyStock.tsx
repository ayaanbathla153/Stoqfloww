import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ShieldCheck, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ConfidenceDot } from "@/components/ConfidenceDot";
import { lastVerifiedLabel, detectAnomaly } from "@/lib/stock-intel";
import { compactName } from "@/lib/product-name";

interface Row {
  product_id: string;
  product: any;
  inv: any | null;        // retailer_inventory row (may be null)
  expected: number;       // current estimated stock
  delivered: number;      // since last verification
  returned: number;       // since last verification
  opening: number;        // opening at start of cycle
  prevAt: string | null;
  actual: string;         // user input
}

export default function VerifyStock() {
  const { user } = useAuth();
  const { retailerId } = useParams();
  const navigate = useNavigate();
  const [retailer, setRetailer] = useState<any>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsFirst, setNeedsFirst] = useState(true);

  useEffect(() => { if (user && retailerId) void load(); }, [user, retailerId]);

  const load = async () => {
    const [{ data: r }, { data: prods }, { data: inv }] = await Promise.all([
      supabase.from("profiles").select("id, name, shop_name, phone").eq("id", retailerId!).maybeSingle(),
      supabase.from("products").select("*").eq("supplier_id", user!.id).order("name"),
      supabase.from("retailer_inventory").select("*").eq("retailer_id", retailerId!),
    ]);
    setRetailer(r);
    const invByProd = new Map((inv ?? []).map((x: any) => [x.product_id, x]));

    // For each product, sum inventory_logs since last_verified_at
    const builtRows: Row[] = [];
    for (const p of prods ?? []) {
      const ir = invByProd.get(p.id) ?? null;
      const since = ir?.last_verified_at ?? null;
      let delivered = 0;
      let returned = 0;
      const q = supabase.from("inventory_logs")
        .select("change_type, quantity, created_at")
        .eq("supplier_id", user!.id)
        .eq("retailer_id", retailerId!)
        .eq("product_id", p.id);
      const { data: logs } = since ? await q.gt("created_at", since) : await q;
      (logs ?? []).forEach((l: any) => {
        const qn = Number(l.quantity);
        if (l.change_type === "in") delivered += qn;
        else if (l.change_type === "out") returned += qn;
      });
      const opening = ir?.last_verified_qty != null
        ? Number(ir.last_verified_qty)
        : Math.max(0, Number(ir?.stock_quantity ?? 0) - delivered + returned);
      builtRows.push({
        product_id: p.id,
        product: p,
        inv: ir,
        expected: Number(ir?.stock_quantity ?? 0),
        delivered, returned, opening,
        prevAt: since,
        actual: "",
      });
    }
    // Show only products the retailer has touched, OR all if none
    const stocked = builtRows.filter((b) => b.inv);
    setRows(stocked.length ? stocked : builtRows);
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) => x.product.name.toLowerCase().includes(q));
    }
    if (needsFirst) {
      r = [...r].sort((a, b) => {
        const da = a.prevAt ? Date.parse(a.prevAt) : 0;
        const db = b.prevAt ? Date.parse(b.prevAt) : 0;
        return da - db;
      });
    }
    return r;
  }, [rows, search, needsFirst]);

  const editedCount = rows.filter((r) => r.actual !== "").length;

  const setActual = (pid: string, v: string) => {
    setRows((prev) => prev.map((r) => r.product_id === pid ? { ...r, actual: v.replace(/[^\d.]/g, "") } : r));
  };

  const save = async () => {
    if (!editedCount) return toast.error("Enter at least one count");
    setSaving(true);
    let anomalies = 0;
    let totalSales = 0;
    try {
      for (const r of rows) {
        if (r.actual === "") continue;
        const closing = Math.max(0, Number(r.actual) || 0);
        const cycleDays = r.prevAt
          ? Math.max(1, Math.round((Date.now() - Date.parse(r.prevAt)) / 86_400_000))
          : 7;
        const estSales = Math.max(0, r.opening + r.delivered - r.returned - closing);
        const ads = estSales / cycleDays;
        const anomaly = detectAnomaly({ opening: r.opening, delivered: r.delivered, returned: r.returned, closing });
        if (anomaly) anomalies++;
        totalSales += estSales * Number(r.product.price ?? 0);

        // Insert verification snapshot
        await supabase.from("stock_verifications").insert({
          retailer_id: retailerId!,
          product_id: r.product_id,
          supplier_id: user!.id,
          verified_by: user!.id,
          opening_stock: r.opening,
          delivered_qty: r.delivered,
          returned_qty: r.returned,
          closing_stock: closing,
          cycle_days: cycleDays,
          avg_daily_sales: ads,
          anomaly,
        });

        // Update / upsert retailer_inventory with new estimated stock + verification metadata
        if (r.inv) {
          await supabase.from("retailer_inventory").update({
            stock_quantity: closing,
            last_verified_at: new Date().toISOString(),
            last_verified_qty: closing,
            avg_daily_sales: ads,
            updated_at: new Date().toISOString(),
          }).eq("id", r.inv.id);
        } else {
          await supabase.from("retailer_inventory").insert({
            retailer_id: retailerId!,
            product_id: r.product_id,
            stock_quantity: closing,
            last_verified_at: new Date().toISOString(),
            last_verified_qty: closing,
            avg_daily_sales: ads,
          });
        }
      }
      toast.success(`${editedCount} products verified · est. sales ₹${Math.round(totalSales).toLocaleString()}`, {
        description: anomalies ? `${anomalies} anomaly flagged for review` : "All clean",
      });
      navigate(`/retailers/${retailerId}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save verification");
    } finally {
      setSaving(false);
    }
  };

  if (!retailer) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const lastAny = rows.reduce<string | null>((acc, r) => {
    if (!r.prevAt) return acc;
    if (!acc || Date.parse(r.prevAt) > Date.parse(acc)) return r.prevAt;
    return acc;
  }, null);

  return (
    <div className="pb-24 animate-fade-in">
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-xl border-b border-border/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/retailers/${retailerId}`)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="font-bold truncate">Verify stock · {retailer.shop_name || retailer.name}</div>
            <div className="text-xs text-muted-foreground">{lastVerifiedLabel(lastAny)}</div>
          </div>
        </div>

        <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-[11px] text-warning flex gap-2 items-start">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Estimated values. Enter actual physical count to update — we'll calculate sales & confidence automatically.</span>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="p-4 space-y-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">No products to verify</Card>
        )}
        {filtered.map((r) => {
          const overflow = r.actual !== "" && Number(r.actual) > r.opening + r.delivered - r.returned + 0.5;
          return (
            <Card key={r.product_id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    <ConfidenceDot row={{ stock_quantity: r.expected, last_verified_at: r.prevAt, avg_daily_sales: r.inv?.avg_daily_sales ?? 0 }} />
                    {compactName(r.product.name)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.prevAt ? lastVerifiedLabel(r.prevAt) : "Never verified"} · since: +{r.delivered} delivered, −{r.returned} returned
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-muted-foreground flex-1">
                  Expected <span className="font-bold text-foreground">{r.expected}</span> {r.product.unit}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">Actual</span>
                  <Input
                    inputMode="decimal"
                    className={`w-20 h-9 text-center font-bold ${overflow ? "border-destructive" : ""}`}
                    value={r.actual}
                    placeholder="—"
                    onChange={(e) => setActual(r.product_id, e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <span className="text-[10px] text-muted-foreground">{r.product.unit}</span>
                </div>
              </div>
              {overflow && (
                <div className="text-[10px] text-destructive">More than possible (open + deliveries − returns = {r.opening + r.delivered - r.returned}). Recount?</div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/95 backdrop-blur-xl border-t z-40">
        <div className="max-w-screen-md mx-auto flex items-center gap-2">
          <Button variant="outline" className="flex-1" asChild><Link to={`/retailers/${retailerId}`}>Cancel</Link></Button>
          <Button variant="hero" className="flex-1" onClick={save} disabled={saving || !editedCount}>
            <ShieldCheck className="w-4 h-4" /> Save verification ({editedCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
