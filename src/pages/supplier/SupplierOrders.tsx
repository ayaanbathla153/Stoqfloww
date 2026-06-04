import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClipboardList, X, FileText, Loader2, RefreshCw, Trash2, CheckCircle2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./SupplierDashboard";
import { generateInvoicePdf, uploadInvoicePdf, publicInvoiceUrl } from "@/lib/invoice-pdf";
import { QtyStepper } from "@/components/QtyStepper";
import { compactName } from "@/lib/product-name";
import { waLink } from "@/lib/phone";

type Filter = "pending" | "confirmed" | "all";

export default function SupplierOrders() {
  const { user, profile } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`supplier-orders-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `supplier_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const load = async () => {
    setLoading(true);
    const { data: orderRows, error } = await supabase
      .from("orders")
      .select("id, status, created_at, retailer_id, notes")
      .eq("supplier_id", user!.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setOrders([]); setLoading(false); return; }

    const orderIds = (orderRows ?? []).map((o: any) => o.id);
    const retailerIds = [...new Set((orderRows ?? []).map((o: any) => o.retailer_id))];
    const [{ data: retailerRows }, { data: itemRows }] = await Promise.all([
      retailerIds.length ? supabase.from("profiles").select("id, name, shop_name, phone").in("id", retailerIds) : Promise.resolve({ data: [] as any[] }),
      orderIds.length ? supabase.from("order_items").select("id, order_id, requested_qty, approved_qty, product_id").in("order_id", orderIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const productIds = [...new Set((itemRows ?? []).map((it: any) => it.product_id))];
    const { data: productRows } = productIds.length
      ? await supabase.from("products").select("id, name, unit, price, supplier_stock").in("id", productIds)
      : { data: [] as any[] };

    const retailersById = new Map((retailerRows ?? []).map((r: any) => [r.id, r]));
    const productsById = new Map((productRows ?? []).map((p: any) => [p.id, p]));
    const itemsByOrder = new Map<string, any[]>();
    (itemRows ?? []).forEach((it: any) => {
      const list = itemsByOrder.get(it.order_id) ?? [];
      list.push({ ...it, products: productsById.get(it.product_id) ?? { name: "Product", unit: "pcs", price: 0, supplier_stock: 0 } });
      itemsByOrder.set(it.order_id, list);
    });

    setOrders((orderRows ?? []).map((o: any) => ({
      ...o,
      profiles: retailersById.get(o.retailer_id) ?? null,
      order_items: itemsByOrder.get(o.id) ?? [],
    })));
    setLoading(false);
  };

  const openOrder = (o: any) => {
    setActiveOrder(o);
    setItems(o.order_items.map((it: any) => ({
      ...it, approved_qty: it.approved_qty ?? it.requested_qty, _removed: false,
    })));
  };

  const reject = async (o: any) => {
    await supabase.from("orders").update({ status: "rejected" }).eq("id", o.id);
    toast.success("Order rejected");
    setActiveOrder(null);
    void load();
  };

  /** Save quantities and item removals; mark order as confirmed. No invoice yet. */
  const confirmOrder = async () => {
    if (!activeOrder) return;
    setBusy(true);
    try {
      // Apply removals and quantity edits
      for (const it of items) {
        if (it._removed || Number(it.approved_qty) <= 0) {
          await supabase.from("order_items").delete().eq("id", it.id);
        } else {
          await supabase.from("order_items").update({ approved_qty: Number(it.approved_qty) }).eq("id", it.id);
        }
      }
      const remaining = items.filter((i) => !i._removed && Number(i.approved_qty) > 0);
      if (remaining.length === 0) {
        await supabase.from("orders").update({ status: "rejected" }).eq("id", activeOrder.id);
        toast.info("All items removed — order rejected");
      } else {
        await supabase.from("orders").update({ status: "confirmed" }).eq("id", activeOrder.id);
        toast.success("Order confirmed · ready to invoice");
      }
      setActiveOrder(null);
      void load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to confirm");
    } finally { setBusy(false); }
  };

  const generateFinalInvoice = async (kind: "final" | "proforma" = "final") => {
    if (!activeOrder || !profile) return;
    setBusy(true);
    try {
      // Persist current edits first (so the invoice reflects what supplier sees)
      for (const it of items) {
        if (it._removed || Number(it.approved_qty) <= 0) {
          await supabase.from("order_items").delete().eq("id", it.id);
        } else {
          await supabase.from("order_items").update({ approved_qty: Number(it.approved_qty) }).eq("id", it.id);
        }
      }
      const validItems = items.filter((i) => !i._removed && Number(i.approved_qty) > 0);
      if (validItems.length === 0) { setBusy(false); return toast.error("All quantities are 0"); }

      const total = validItems.reduce((sum, it) => sum + Number(it.approved_qty) * Number(it.products.price), 0);

      // Generate human-readable invoice number via SQL
      const { data: numData, error: numErr } = await supabase.rpc("next_invoice_number", { _supplier: user!.id });
      if (numErr) throw numErr;
      const invoiceNumber: string = numData as string;

      const { data: inv, error: invErr } = await supabase.from("invoices").insert({
        invoice_number: invoiceNumber,
        order_id: activeOrder.id,
        retailer_id: activeOrder.retailer_id,
        supplier_id: user!.id,
        total_amount: total,
        status: kind === "final" ? "pending_delivery" : "pending_delivery",
        kind,
        finalized_at: kind === "final" ? new Date().toISOString() : null,
        short_code: invoiceNumber,
      }).select().single();
      if (invErr) throw invErr;

      const invItems = validItems.map((it) => ({
        invoice_id: inv.id,
        product_id: it.product_id,
        final_qty: Number(it.approved_qty),
        price: Number(it.products.price),
      }));
      await supabase.from("invoice_items").insert(invItems);

      const blob = generateInvoicePdf({
        invoice_number: invoiceNumber,
        created_at: inv.created_at,
        kind,
        supplier: { name: profile.name, phone: profile.phone, shop_name: profile.shop_name },
        retailer: { name: activeOrder.profiles?.name || "Retailer", phone: activeOrder.profiles?.phone || "", shop_name: activeOrder.profiles?.shop_name },
        items: validItems.map((it) => ({
          name: it.products.name, qty: Number(it.approved_qty), unit: it.products.unit,
          price: Number(it.products.price), total: Number(it.approved_qty) * Number(it.products.price),
        })),
        total,
      });
      const pdfUrl = await uploadInvoicePdf(inv.id, blob);
      await supabase.from("invoices").update({ pdf_url: pdfUrl }).eq("id", inv.id);

      // Auto-download
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl; a.download = `${invoiceNumber}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);

      if (kind === "final") {
        await supabase.from("orders").update({ status: "invoiced" }).eq("id", activeOrder.id);

        // Ledger debit only on final
        const { data: lastEntry } = await supabase.from("payments_ledger")
          .select("balance_after").eq("retailer_id", activeOrder.retailer_id).eq("supplier_id", user!.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        const prevBalance = Number(lastEntry?.balance_after ?? 0);
        await supabase.from("payments_ledger").insert({
          retailer_id: activeOrder.retailer_id, supplier_id: user!.id,
          type: "invoice", amount: total, balance_after: prevBalance + total,
          reference_invoice_id: inv.id, note: `Invoice ${invoiceNumber}`,
        });

        // WhatsApp: clean URL, no raw signed Supabase link
        const phone = activeOrder.profiles?.phone;
        if (phone) {
          const url = publicInvoiceUrl(invoiceNumber);
          const msg = `Hi ${activeOrder.profiles?.name || "there"},\n\nYour final invoice ${invoiceNumber} is ready.\nTotal: ₹${total.toFixed(2)}\n\nView: ${url}\n\n— ${profile.shop_name || profile.name}`;
          window.open(waLink(phone, msg), "_blank");
        }
        toast.success(`Final invoice ${invoiceNumber} generated`);
      } else {
        toast.success(`Proforma ${invoiceNumber} generated (estimate only)`);
      }
      setActiveOrder(null);
      void load();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message ?? "Failed to create invoice");
    } finally { setBusy(false); }
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const confirmedCount = orders.filter((o) => o.status === "confirmed").length;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Order requests</h1>
        <Button size="icon" variant="ghost" onClick={() => void load()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        <Button size="sm" variant={filter === "pending" ? "hero" : "outline"} onClick={() => setFilter("pending")}>
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </Button>
        <Button size="sm" variant={filter === "confirmed" ? "hero" : "outline"} onClick={() => setFilter("confirmed")}>
          Confirmed {confirmedCount > 0 && `(${confirmedCount})`}
        </Button>
        <Button size="sm" variant={filter === "all" ? "hero" : "outline"} onClick={() => setFilter("all")}>All</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" /> No orders
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <Card key={o.id} className="p-3 cursor-pointer hover:border-primary/40 transition-smooth" onClick={() => openOrder(o)}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.profiles?.shop_name || o.profiles?.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.order_items.length} items · {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!activeOrder} onOpenChange={(v) => !v && setActiveOrder(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeOrder?.profiles?.shop_name || "Order"}</DialogTitle>
          </DialogHeader>
          {activeOrder && (
            <div className="space-y-3">
              {activeOrder.status === "pending" && (
                <div className="text-xs p-2 rounded bg-primary/10 text-primary">
                  Step 1 — Edit quantities or remove unavailable items, then <b>Confirm</b>. Final invoice is generated next.
                </div>
              )}
              {activeOrder.status === "confirmed" && (
                <div className="text-xs p-2 rounded bg-success/10 text-success">
                  Confirmed — generate final invoice when ready to dispatch.
                </div>
              )}

              {items.map((it, idx) => {
                const stock = Number(it.products.supplier_stock);
                const requested = Number(it.requested_qty);
                const approved = Number(it.approved_qty);
                const lowStock = approved > stock;
                if (it._removed) return (
                  <div key={it.id} className="p-3 rounded-lg bg-muted/30 border border-dashed border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground line-through">{compactName(it.products.name)}</span>
                    <Button size="sm" variant="ghost" onClick={() => { const n = [...items]; n[idx]._removed = false; setItems(n); }}>Restore</Button>
                  </div>
                );
                return (
                  <div key={it.id} className="p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{it.products.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Requested: {requested} {it.products.unit} · Stock: {stock}
                        </div>
                      </div>
                      <QtyStepper value={Number(it.approved_qty) || 0} onChange={(n) => {
                        const next = [...items]; next[idx].approved_qty = n; setItems(next);
                      }} />
                      {(activeOrder.status === "pending" || activeOrder.status === "confirmed") && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                          onClick={() => { const n = [...items]; n[idx]._removed = true; setItems(n); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    {lowStock && <div className="text-[10px] text-destructive mt-1">⚠ Exceeds available stock</div>}
                  </div>
                );
              })}

              {/* Live total */}
              <Card className="p-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Estimate total</span>
                <span className="font-bold">
                  ₹{items.filter(i => !i._removed).reduce((s, it) => s + Number(it.approved_qty) * Number(it.products.price), 0).toLocaleString()}
                </span>
              </Card>

              {activeOrder.status === "pending" && (
                <div className="grid grid-cols-2 gap-2 sticky bottom-0 pt-2 bg-card">
                  <Button variant="outline" onClick={() => reject(activeOrder)} disabled={busy}>
                    <X className="w-4 h-4" /> Reject
                  </Button>
                  <Button variant="hero" onClick={confirmOrder} disabled={busy}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Confirm</>}
                  </Button>
                </div>
              )}
              {activeOrder.status === "confirmed" && (
                <div className="space-y-2 sticky bottom-0 pt-2 bg-card">
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => generateFinalInvoice("proforma")} disabled={busy}>
                      <FileText className="w-4 h-4" /> Proforma
                    </Button>
                    <Button variant="hero" onClick={() => generateFinalInvoice("final")} disabled={busy}>
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileText className="w-4 h-4" /> Final invoice</>}
                    </Button>
                  </div>
                  <p className="text-[10px] text-center text-muted-foreground">Final invoice is locked once generated.</p>
                </div>
              )}
              {activeOrder.status !== "pending" && activeOrder.status !== "confirmed" && (
                <div className="text-xs text-center text-muted-foreground">Order is {activeOrder.status}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
