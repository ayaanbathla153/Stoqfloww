import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Truck, FileText, MessageCircle, Loader2, PackageCheck } from "lucide-react";
import { StatusBadge } from "./supplier/SupplierDashboard";
import { toast } from "sonner";
import { waLink } from "@/lib/phone";

export default function Invoices() {
  const { user, role, profile } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialInv, setPartialInv] = useState<any | null>(null);
  const [delivered, setDelivered] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`invoices-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_items" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, role]);

  const load = async () => {
    setLoading(true);
    const col = role === "supplier" ? "supplier_id" : "retailer_id";
    const { data: invs, error } = await supabase
      .from("invoices").select("*").eq(col, user!.id).order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setInvoices([]); setLoading(false); return; }
    const invIds = (invs ?? []).map((i: any) => i.id);
    const retailerIds = [...new Set((invs ?? []).map((i: any) => i.retailer_id))];
    const supplierIds = [...new Set((invs ?? []).map((i: any) => i.supplier_id))];
    const profIds = [...new Set([...retailerIds, ...supplierIds])];
    const [{ data: profs }, { data: items }] = await Promise.all([
      profIds.length ? supabase.from("profiles").select("id, name, shop_name, phone").in("id", profIds) : Promise.resolve({ data: [] as any[] }),
      invIds.length ? supabase.from("invoice_items").select("*").in("invoice_id", invIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const productIds = [...new Set((items ?? []).map((it: any) => it.product_id))];
    const { data: prods } = productIds.length
      ? await supabase.from("products").select("id, name, unit").in("id", productIds)
      : { data: [] as any[] };
    const pm = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const prodm = new Map((prods ?? []).map((p: any) => [p.id, p]));
    const itemsByInv = new Map<string, any[]>();
    (items ?? []).forEach((it: any) => {
      const list = itemsByInv.get(it.invoice_id) ?? [];
      list.push({ ...it, products: prodm.get(it.product_id) ?? { name: "Product", unit: "pcs" } });
      itemsByInv.set(it.invoice_id, list);
    });
    setInvoices((invs ?? []).map((i: any) => ({
      ...i,
      retailer: pm.get(i.retailer_id),
      supplier: pm.get(i.supplier_id),
      invoice_items: itemsByInv.get(i.id) ?? [],
    })));
    setLoading(false);
  };

  const applyDelivery = async (inv: any, qtyMap: Record<string, number>) => {
    // qtyMap: invoice_item.id -> delivered qty (<= final_qty)
    let totalDeliveredAmount = 0;
    const allFull = inv.invoice_items.every((it: any) => Number(qtyMap[it.id] ?? 0) >= Number(it.final_qty));
    const noneDelivered = inv.invoice_items.every((it: any) => Number(qtyMap[it.id] ?? 0) <= 0);
    if (noneDelivered) return toast.error("Enter delivered quantities");

    for (const it of inv.invoice_items) {
      const qty = Number(qtyMap[it.id] ?? 0);
      if (qty <= 0) continue;
      if (qty > Number(it.final_qty)) return toast.error(`Cannot deliver more than billed for ${it.products.name}`);
      totalDeliveredAmount += qty * Number(it.price);

      const { data: prod } = await supabase.from("products").select("supplier_stock").eq("id", it.product_id).single();
      const newStock = Number(prod?.supplier_stock ?? 0) - qty;
      await supabase.from("products").update({ supplier_stock: newStock }).eq("id", it.product_id);

      const { data: existing } = await supabase.from("retailer_inventory")
        .select("*").eq("retailer_id", inv.retailer_id).eq("product_id", it.product_id).maybeSingle();
      if (existing) {
        await supabase.from("retailer_inventory").update({
          stock_quantity: Number(existing.stock_quantity) + qty,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("retailer_inventory").insert({
          retailer_id: inv.retailer_id, product_id: it.product_id, stock_quantity: qty,
        });
      }

      await supabase.from("inventory_logs").insert({
        product_id: it.product_id,
        change_type: "out",
        quantity: qty,
        linked_invoice_id: inv.id,
        retailer_id: inv.retailer_id,
        supplier_id: inv.supplier_id,
        note: `Delivered ${qty}/${it.final_qty} via ${inv.invoice_number}`,
      });
    }

    // Ledger debit was already posted at invoice creation. For partial delivery,
    // refund the undelivered amount as a payment-type credit so accounts stay accurate.
    const billedTotal = inv.invoice_items.reduce((s: number, it: any) => s + Number(it.final_qty) * Number(it.price), 0);
    const undeliveredAmount = billedTotal - totalDeliveredAmount;
    if (undeliveredAmount > 0) {
      const { data: lastEntry } = await supabase.from("payments_ledger")
        .select("balance_after").eq("retailer_id", inv.retailer_id).eq("supplier_id", inv.supplier_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const prevBalance = Number(lastEntry?.balance_after ?? 0);
      await supabase.from("payments_ledger").insert({
        retailer_id: inv.retailer_id,
        supplier_id: inv.supplier_id,
        type: "payment",
        amount: undeliveredAmount,
        balance_after: prevBalance - undeliveredAmount,
        reference_invoice_id: inv.id,
        note: `Undelivered credit · ${inv.invoice_number}`,
      });
    }

    // Create a back-order for undelivered items (partial flow)
    if (!allFull) {
      const pendingItems = inv.invoice_items
        .map((it: any) => ({ ...it, pending: Number(it.final_qty) - Number(qtyMap[it.id] ?? 0) }))
        .filter((it: any) => it.pending > 0);
      if (pendingItems.length > 0) {
        const { data: backOrder } = await supabase.from("orders").insert({
          retailer_id: inv.retailer_id,
          supplier_id: inv.supplier_id,
          created_by: user!.id,
          status: "pending",
          notes: `Back-order from ${inv.invoice_number} (partial delivery)`,
        }).select().single();
        if (backOrder) {
          await supabase.from("order_items").insert(pendingItems.map((it: any) => ({
            order_id: backOrder.id, product_id: it.product_id, requested_qty: it.pending,
          })));
        }
      }
    }

    await supabase.from("invoices").update({
      status: allFull ? "delivered" : "disputed",
      delivered_at: new Date().toISOString(),
    }).eq("id", inv.id);

    toast.success(allFull ? "Marked delivered" : "Partial delivery recorded · back-order created");
  };

  const markDeliveredFull = async (inv: any) => {
    setBusy(true);
    const map: Record<string, number> = {};
    inv.invoice_items.forEach((it: any) => (map[it.id] = Number(it.final_qty)));
    await applyDelivery(inv, map);
    setBusy(false);
    void load();
  };

  const openPartial = (inv: any) => {
    setPartialInv(inv);
    const m: Record<string, number> = {};
    inv.invoice_items.forEach((it: any) => (m[it.id] = Number(it.final_qty)));
    setDelivered(m);
    setPartialOpen(true);
  };

  const submitPartial = async () => {
    if (!partialInv) return;
    setBusy(true);
    await applyDelivery(partialInv, delivered);
    setBusy(false);
    setPartialOpen(false);
    setPartialInv(null);
    void load();
  };

  const accept = async (inv: any) => {
    await supabase.from("invoices").update({ status: "delivered" }).eq("id", inv.id);
    toast.success("Delivery accepted");
    void load();
  };

  const dispute = async (inv: any) => {
    await supabase.from("invoices").update({ status: "disputed" }).eq("id", inv.id);
    toast.info("Marked as disputed. Contact your supplier.");
    void load();
  };

  const sendWhatsApp = (inv: any) => {
    const target = role === "supplier" ? inv.retailer : inv.supplier;
    const cleanUrl = `${window.location.origin}/i/${encodeURIComponent(inv.short_code || inv.invoice_number)}`;
    const kindLabel = inv.kind === "proforma" ? "Proforma" : "Invoice";
    const msg = `Hi ${target.name},\n\n${kindLabel} ${inv.invoice_number}\nTotal: ₹${Number(inv.total_amount).toFixed(2)}\n\nView: ${cleanUrl}\n\n— ${profile?.shop_name || profile?.name}`;
    window.open(waLink(target.phone, msg), "_blank");
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Invoices</h1>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : invoices.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" /> No invoices
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Card key={inv.id} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{inv.invoice_number}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase ${inv.kind === "proforma" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                      {inv.kind === "proforma" ? "Proforma" : "Final"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {role === "supplier" ? inv.retailer?.shop_name || inv.retailer?.name : inv.supplier?.shop_name || inv.supplier?.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">₹{Number(inv.total_amount).toLocaleString()}</div>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {inv.invoice_items.length} items
              </div>
              <div className="flex flex-wrap gap-2">
                {inv.pdf_url && (
                  <Button asChild size="sm" variant="outline">
                    <a href={inv.pdf_url} target="_blank" rel="noreferrer">
                      <FileText className="w-3.5 h-3.5" /> PDF
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => sendWhatsApp(inv)}>
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </Button>
                {role === "supplier" && inv.status === "pending_delivery" && (
                  <>
                    <Button size="sm" variant="hero" onClick={() => markDeliveredFull(inv)} disabled={busy}>
                      <Truck className="w-3.5 h-3.5" /> Full delivery
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openPartial(inv)} disabled={busy}>
                      <PackageCheck className="w-3.5 h-3.5" /> Partial
                    </Button>
                  </>
                )}
                {role === "retailer" && inv.status === "pending_delivery" && (
                  <>
                    <Button size="sm" variant="success" onClick={() => accept(inv)}>Accept</Button>
                    <Button size="sm" variant="destructive" onClick={() => dispute(inv)}>Dispute</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Partial delivery — {partialInv?.invoice_number}</DialogTitle></DialogHeader>
          {partialInv && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Enter actually delivered quantity. Undelivered items become a new pending order automatically.</p>
              {partialInv.invoice_items.map((it: any) => {
                const billed = Number(it.final_qty);
                const val = delivered[it.id] ?? billed;
                return (
                  <div key={it.id} className="p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{it.products.name}</div>
                        <div className="text-xs text-muted-foreground">Billed: {billed} {it.products.unit}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Delivered</Label>
                        <Input type="number" className="w-20 h-8 text-center" value={val}
                          min={0} max={billed}
                          onChange={(e) => setDelivered({ ...delivered, [it.id]: Math.min(billed, Math.max(0, Number(e.target.value) || 0)) })} />
                      </div>
                    </div>
                    {val < billed && val >= 0 && (
                      <div className="text-[10px] text-warning mt-1">⚠ {billed - val} {it.products.unit} will move to a new pending order</div>
                    )}
                  </div>
                );
              })}
              <Button variant="hero" className="w-full" onClick={submitPartial} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm delivery"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
