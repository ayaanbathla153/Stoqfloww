import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ArrowLeft, Package, Plus, AlertTriangle, ShoppingCart, Loader2, Check, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QtyStepper } from "@/components/QtyStepper";

interface Product {
  id: string; name: string; unit: string; price: number;
  supplier_stock: number; low_stock_threshold: number;
}

export default function RetailerStore() {
  const { user } = useAuth();
  const { retailerId } = useParams();
  const navigate = useNavigate();
  const [retailer, setRetailer] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [retailerStock, setRetailerStock] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [onlyLow, setOnlyLow] = useState(true);

  useEffect(() => { if (user && retailerId) void load(); }, [user, retailerId]);

  const load = async () => {
    const [{ data: r }, { data: prods }, { data: stock }] = await Promise.all([
      supabase.from("profiles").select("id, name, shop_name, phone").eq("id", retailerId!).maybeSingle(),
      supabase.from("products").select("*").eq("supplier_id", user!.id).order("name"),
      supabase.from("retailer_inventory").select("product_id, stock_quantity").eq("retailer_id", retailerId!),
    ]);
    setRetailer(r);
    setProducts((prods ?? []) as Product[]);
    const map: Record<string, number> = {};
    (stock ?? []).forEach((s: any) => { map[s.product_id] = Number(s.stock_quantity); });
    setRetailerStock(map);
  };

  const enriched = useMemo(() => products.map((p) => {
    const onHand = retailerStock[p.id] ?? 0;
    const isLow = onHand <= Number(p.low_stock_threshold);
    return { ...p, onHand, isLow };
  }), [products, retailerStock]);

  const filtered = useMemo(() => enriched
    .filter((p) => (onlyLow ? p.isLow : true))
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
  [enriched, onlyLow, search]);

  const cartEntries = Object.entries(cart);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalCost = cartEntries.reduce((s, [pid, q]) => {
    const p = products.find((x) => x.id === pid); return s + (p ? Number(p.price) * q : 0);
  }, 0);

  const inc = (id: string) => setCart({ ...cart, [id]: (cart[id] ?? 0) + 1 });
  const dec = (id: string) => {
    const next = { ...cart };
    if ((next[id] ?? 0) <= 1) delete next[id]; else next[id] -= 1;
    setCart(next);
  };
  const removeItem = (id: string) => { const n = { ...cart }; delete n[id]; setCart(n); };

  const suggestRestock = () => {
    // suggest enough to refill to 2x threshold for every low item
    const next: Record<string, number> = { ...cart };
    enriched.forEach((p) => {
      if (p.isLow) {
        const target = Math.max(Number(p.low_stock_threshold) * 2, 1);
        const need = Math.max(target - p.onHand, 1);
        next[p.id] = Math.max(next[p.id] ?? 0, Math.ceil(need));
      }
    });
    setCart(next);
    toast.success("Suggested restock added");
  };

  const submit = async () => {
    if (!retailerId) return;
    if (cartEntries.length === 0) return toast.error("Cart is empty");
    setSubmitting(true);
    const { data: order, error } = await supabase.from("orders").insert({
      retailer_id: retailerId,
      supplier_id: user!.id,
      created_by: user!.id,
      status: "pending",
      notes: notes || `Sale order created by supplier on visit`,
    }).select().single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Failed"); }
    const { error: itemError } = await supabase.from("order_items").insert(cartEntries.map(([product_id, qty]) => ({
      order_id: order.id, product_id, requested_qty: qty,
    })));
    if (itemError) { setSubmitting(false); return toast.error(itemError.message); }
    setSubmitting(false);
    setReviewOpen(false);
    setCart({});
    setNotes("");
    toast.success("Order created · review in Orders to invoice");
    navigate("/orders");
  };

  return (
    <div className="pb-32 animate-fade-in">
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-xl p-4 border-b border-border/60 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/retailers")}><ArrowLeft className="w-4 h-4" /></Button>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Visiting store</div>
            <div className="font-bold truncate">{retailer?.shop_name || retailer?.name || "—"}</div>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={onlyLow ? "hero" : "outline"} onClick={() => setOnlyLow(true)}>
            <AlertTriangle className="w-3.5 h-3.5" /> Low stock
          </Button>
          <Button size="sm" variant={!onlyLow ? "hero" : "outline"} onClick={() => setOnlyLow(false)}>All products</Button>
          <Button size="sm" variant="outline" className="ml-auto" onClick={suggestRestock}>Suggest restock</Button>
        </div>
      </div>

      <div className="p-4 space-y-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {onlyLow ? "Nothing low. Switch to all products." : "No products"}
          </Card>
        )}
        {filtered.map((p) => {
          const qty = cart[p.id] ?? 0;
          return (
            <Card key={p.id} className={`p-3 ${qty > 0 ? "border-primary/40 bg-primary/5" : ""} ${p.isLow ? "border-warning/40" : ""}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg grid place-items-center ${p.isLow ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}>
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">₹{p.price}/{p.unit}</div>
                </div>
                {qty === 0 ? (
                  <Button size="sm" variant="hero" onClick={() => inc(p.id)}><Plus className="w-4 h-4" /> Add</Button>
                ) : (
                  <QtyStepper value={qty} onChange={(n) => {
                    const next = { ...cart };
                    if (n <= 0) delete next[p.id]; else next[p.id] = n;
                    setCart(next);
                  }} />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div className={`rounded px-2 py-1 ${p.isLow ? "bg-warning/15 text-warning" : "bg-muted/40 text-muted-foreground"}`}>
                  On shelf: <b>{p.onHand} {p.unit}</b>
                </div>
                <div className="rounded px-2 py-1 bg-muted/40 text-muted-foreground">
                  Threshold: <b>{p.low_stock_threshold}</b>
                </div>
                <div className="rounded px-2 py-1 bg-muted/40 text-muted-foreground">
                  My stock: <b>{p.supplier_stock}</b>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {totalItems > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 p-3 bg-background/95 backdrop-blur-xl border-t border-border">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">{totalItems} items · sale order</div>
              <div className="font-bold">₹{totalCost.toLocaleString()}</div>
            </div>
            <Button variant="hero" size="lg" onClick={() => setReviewOpen(true)}>
              <ShoppingCart className="w-4 h-4" /> Review
            </Button>
          </div>
        </div>
      )}

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle>Confirm sale order</SheetTitle></SheetHeader>
          <div className="space-y-3 pt-4">
            {cartEntries.map(([pid, qty]) => {
              const p = products.find((x) => x.id === pid); if (!p) return null;
              return (
                <div key={pid} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">₹{p.price} × {qty} {p.unit}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <QtyStepper value={qty} onChange={(n) => {
                      const next = { ...cart };
                      if (n <= 0) delete next[pid]; else next[pid] = n;
                      setCart(next);
                    }} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem(pid)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div className="font-bold text-sm w-16 text-right">₹{(Number(p.price) * qty).toLocaleString()}</div>
                </div>
              );
            })}
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" />
            <Card className="p-3 bg-gradient-card flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Total ({totalItems} items)</div>
              <div className="text-xl font-bold">₹{totalCost.toLocaleString()}</div>
            </Card>
            <Button variant="hero" size="lg" className="w-full" onClick={submit} disabled={submitting || cartEntries.length === 0}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Create order</>}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Order appears as Pending in Orders. Approve & invoice from there.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
