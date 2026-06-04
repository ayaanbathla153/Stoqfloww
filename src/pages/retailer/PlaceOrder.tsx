import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, ShoppingCart, Search, Loader2, Package, RotateCcw, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { QtyStepper } from "@/components/QtyStepper";
import { compactName } from "@/lib/product-name";

export default function PlaceOrder() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reorder, setReorder] = useState<{ items: { product_id: string; qty: number }[]; date: string } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => { if (user && profile?.linked_supplier_id) void load(); }, [user, profile]);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").eq("supplier_id", profile!.linked_supplier_id!).order("name");
    setProducts(data ?? []);

    const { data: lastInv } = await supabase.from("invoices")
      .select("created_at, invoice_items(product_id, final_qty)")
      .eq("retailer_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lastInv && lastInv.invoice_items?.length) {
      setReorder({
        date: lastInv.created_at,
        items: lastInv.invoice_items.map((it: any) => ({ product_id: it.product_id, qty: Number(it.final_qty) })),
      });
    }
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const cartEntries = Object.entries(cart);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const totalCost = cartEntries.reduce((sum, [pid, qty]) => {
    const p = products.find((x) => x.id === pid); return sum + (p ? Number(p.price) * qty : 0);
  }, 0);

  const inc = (id: string) => setCart({ ...cart, [id]: (cart[id] ?? 0) + 1 });
  const dec = (id: string) => {
    const next = { ...cart };
    if ((next[id] ?? 0) <= 1) delete next[id]; else next[id] -= 1;
    setCart(next);
  };
  const removeItem = (id: string) => {
    const next = { ...cart }; delete next[id]; setCart(next);
  };

  const applyReorder = () => {
    if (!reorder) return;
    const next: Record<string, number> = { ...cart };
    reorder.items.forEach((it) => {
      if (products.find((p) => p.id === it.product_id)) {
        next[it.product_id] = (next[it.product_id] ?? 0) + it.qty;
      }
    });
    setCart(next);
    toast.success("Last order added to cart");
  };

  const submit = async () => {
    if (!profile?.linked_supplier_id) return toast.error("No supplier linked");
    if (cartEntries.length === 0) return toast.error("Cart is empty");
    setSubmitting(true);
    const { data: order, error } = await supabase.from("orders").insert({
      retailer_id: user!.id,
      supplier_id: profile.linked_supplier_id,
      created_by: user!.id,
      status: "pending",
      notes: notes || null,
    }).select().single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Failed"); }
    const orderItems = cartEntries.map(([product_id, qty]) => ({
      order_id: order.id, product_id, requested_qty: qty,
    }));
    const { error: itemError } = await supabase.from("order_items").insert(orderItems);
    if (itemError) {
      setSubmitting(false);
      return toast.error(itemError.message);
    }
    setSubmitting(false);
    setReviewOpen(false);
    setCart({});
    setNotes("");
    toast.success("Order placed! Awaiting supplier approval.");
    navigate("/");
  };

  if (!profile?.linked_supplier_id) {
    return <div className="p-4"><Card className="p-6 text-center text-sm text-muted-foreground">No supplier linked to your account.</Card></div>;
  }

  return (
    <div className="pb-32 animate-fade-in">
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-xl p-4 border-b border-border/60">
        <h1 className="text-xl font-bold mb-3">New order</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="p-4 space-y-2">
        {reorder && reorder.items.length > 0 && (
          <Card className="p-3 flex items-center gap-3 bg-gradient-card border-primary/30">
            <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center">
              <RotateCcw className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Reorder last invoice</div>
              <div className="text-xs text-muted-foreground">
                {reorder.items.length} items · {new Date(reorder.date).toLocaleDateString()}
              </div>
            </div>
            <Button size="sm" variant="hero" onClick={applyReorder}>Add all</Button>
          </Card>
        )}
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" /> No products
          </Card>
        )}
        {filtered.map((p) => {
          const qty = cart[p.id] ?? 0;
          return (
            <Card key={p.id} className={`p-3 flex items-center gap-3 ${qty > 0 ? "border-primary/40 bg-primary/5" : ""}`}>
              <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">₹{p.price}/{p.unit}</div>
              </div>
              {qty === 0 ? (
                <Button size="sm" variant="hero" onClick={() => inc(p.id)}>
                  <Plus className="w-4 h-4" /> Add
                </Button>
              ) : (
                <QtyStepper value={qty} onChange={(n) => {
                  const next = { ...cart };
                  if (n <= 0) delete next[p.id]; else next[p.id] = n;
                  setCart(next);
                }} />
              )}
            </Card>
          );
        })}
      </div>

      {totalItems > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 p-3 bg-background/95 backdrop-blur-xl border-t border-border">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">{totalItems} items in cart</div>
              <div className="font-bold">₹{totalCost.toLocaleString()}</div>
            </div>
            <Button variant="hero" size="lg" onClick={() => setReviewOpen(true)}>
              <ShoppingCart className="w-4 h-4" /> Review & checkout
            </Button>
          </div>
        </div>
      )}

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review your order</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 pt-4">
            <div className="space-y-2">
              {cartEntries.map(([pid, qty]) => {
                const p = products.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <div key={pid} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{compactName(p.name)}</div>
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
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Note for supplier (optional)</label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. deliver before Saturday" />
            </div>

            <Card className="p-3 bg-warning/10 border-warning/30 text-xs">
              <b>Estimate only.</b> Final price & quantities are set by your supplier after confirmation. No invoice yet.
            </Card>

            <Card className="p-3 bg-gradient-card flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Estimate ({totalItems} items)</div>
              <div className="text-xl font-bold">₹{totalCost.toLocaleString()}</div>
            </Card>

            <Button variant="hero" size="lg" className="w-full" onClick={submit} disabled={submitting || cartEntries.length === 0}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Place order</>}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              Your supplier will review and confirm quantities before invoicing.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
