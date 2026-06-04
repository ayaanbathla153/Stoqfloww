import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Phone, MessageCircle, ClipboardList, FileText, Wallet, Package, TrendingUp } from "lucide-react";
import { displayPhone, waLink } from "@/lib/phone";
import { DateRangeFilter, defaultRange, type Range } from "@/components/DateRangeFilter";
import { StatusBadge } from "./SupplierDashboard";

export default function RetailerDetail() {
  const { user } = useAuth();
  const { retailerId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "orders";
  const statusFilter = params.get("status");
  const [range, setRange] = useState<Range>(defaultRange);

  const [retailer, setRetailer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [products, setProducts] = useState<Record<string, any>>({});

  useEffect(() => { if (user && retailerId) void load(); }, [user, retailerId, range.from, range.to]);

  const load = async () => {
    const fromIso = range.from.toISOString();
    const toIso = range.to.toISOString();

    const [{ data: r }, { data: ords }, { data: invs }, { data: ledg }] = await Promise.all([
      supabase.from("profiles").select("id, name, shop_name, phone").eq("id", retailerId!).maybeSingle(),
      supabase.from("orders").select("*").eq("supplier_id", user!.id).eq("retailer_id", retailerId!)
        .gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("supplier_id", user!.id).eq("retailer_id", retailerId!)
        .gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
      supabase.from("payments_ledger").select("*").eq("supplier_id", user!.id).eq("retailer_id", retailerId!)
        .gte("created_at", fromIso).lte("created_at", toIso).order("created_at", { ascending: false }),
    ]);

    setRetailer(r);
    setOrders(ords ?? []);
    setInvoices(invs ?? []);
    setLedger(ledg ?? []);

    const orderIds = (ords ?? []).map((o) => o.id);
    const invoiceIds = (invs ?? []).map((i) => i.id);
    const [{ data: oi }, { data: ii }] = await Promise.all([
      orderIds.length
        ? supabase.from("order_items").select("*").in("order_id", orderIds)
        : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length
        ? supabase.from("invoice_items").select("*").in("invoice_id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    setOrderItems(oi ?? []);
    setInvoiceItems(ii ?? []);

    const pids = [...new Set([...(oi ?? []).map((x) => x.product_id), ...(ii ?? []).map((x) => x.product_id)])];
    if (pids.length) {
      const { data: prods } = await supabase.from("products").select("id, name, unit, price").in("id", pids);
      const m: Record<string, any> = {};
      (prods ?? []).forEach((p: any) => { m[p.id] = p; });
      setProducts(m);
    }
  };

  // KPIs in range
  const totalOrders = orders.length;
  const totalValue = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const topProduct = useMemo(() => {
    const totals: Record<string, number> = {};
    invoiceItems.forEach((it) => {
      totals[it.product_id] = (totals[it.product_id] ?? 0) + Number(it.final_qty);
    });
    let top: { id: string; qty: number } | null = null;
    Object.entries(totals).forEach(([id, qty]) => {
      if (!top || qty > top.qty) top = { id, qty };
    });
    return top ? { name: products[top.id]?.name ?? "—", qty: top.qty } : null;
  }, [invoiceItems, products]);

  const balance = useMemo(() => {
    // Use most recent ledger row's balance_after across all time, but show in-range delta too.
    return ledger[0]?.balance_after ?? 0;
  }, [ledger]);

  const filteredOrders = statusFilter && tab === "orders"
    ? orders.filter((o) => o.status === statusFilter)
    : orders;

  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    next.delete("status");
    setParams(next, { replace: true });
  };

  if (!retailer) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="pb-6 animate-fade-in">
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-xl border-b border-border/60">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/retailers")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{retailer.shop_name || retailer.name}</div>
              <div className="text-xs text-muted-foreground truncate">{retailer.name} · {displayPhone(retailer.phone)}</div>
            </div>
            <Button asChild size="icon" variant="outline" className="h-9 w-9">
              <a href={waLink(retailer.phone, `Hi ${retailer.name}…`)} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4" />
              </a>
            </Button>
            <Button asChild size="icon" variant="outline" className="h-9 w-9">
              <a href={`tel:+91${retailer.phone}`}><Phone className="w-4 h-4" /></a>
            </Button>
          </div>

          <DateRangeFilter value={range} onChange={setRange} />

          {/* KPI strip */}
          <div className="grid grid-cols-3 gap-2">
            <Kpi icon={<ClipboardList className="w-3.5 h-3.5" />} label="Orders" value={totalOrders} accent="primary" />
            <Kpi icon={<Wallet className="w-3.5 h-3.5" />} label="Invoiced" value={`₹${Math.round(totalValue).toLocaleString()}`} accent="success" />
            <Kpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Top item"
              value={topProduct ? `${topProduct.name}` : "—"}
              sub={topProduct ? `${topProduct.qty} sold` : ""}
              accent="warning" />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Outstanding balance</span>
            <Link to={`/retailers/${retailerId}?tab=ledger`} className={`font-bold ${balance > 0 ? "text-warning" : balance < 0 ? "text-success" : ""}`}>
              ₹{Math.round(Math.abs(balance)).toLocaleString()} {balance > 0 ? "Due" : balance < 0 ? "Credit" : "Settled"}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button asChild size="sm" variant="hero">
              <Link to={`/retailers/${retailerId}/store`}>
                <ClipboardList className="w-4 h-4" /> Sale order
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/retailers/${retailerId}/verify`}>
                <Package className="w-4 h-4" /> Verify stock
              </Link>
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full rounded-none border-t bg-transparent p-0 h-10">
            <TabsTrigger value="orders" className="flex-1 rounded-none data-[state=active]:bg-primary/10">Orders</TabsTrigger>
            <TabsTrigger value="invoices" className="flex-1 rounded-none data-[state=active]:bg-primary/10">Invoices</TabsTrigger>
            <TabsTrigger value="ledger" className="flex-1 rounded-none data-[state=active]:bg-primary/10">Ledger</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="p-4 space-y-2 mt-0">
            {statusFilter && (
              <div className="text-xs text-muted-foreground">
                Filtered: <b>{statusFilter}</b> ·{" "}
                <button className="underline" onClick={() => { const n = new URLSearchParams(params); n.delete("status"); setParams(n, { replace: true }); }}>clear</button>
              </div>
            )}
            {filteredOrders.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">No orders in this range</Card>
            ) : filteredOrders.map((o) => {
              const items = orderItems.filter((it) => it.order_id === o.id);
              return (
                <Card key={o.id} className="p-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{items.length} items</div>
                      <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.notes && <div className="text-xs text-muted-foreground mt-1 italic">"{o.notes}"</div>}
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="invoices" className="p-4 space-y-2 mt-0">
            {invoices.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">No invoices in this range</Card>
            ) : invoices.map((i) => (
              <Card key={i.id} className="p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{i.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">₹{Number(i.total_amount).toLocaleString()}</div>
                    <StatusBadge status={i.status} />
                  </div>
                </div>
                {i.pdf_url && (
                  <a href={i.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 inline-flex items-center gap-1">
                    <FileText className="w-3 h-3" /> PDF
                  </a>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="ledger" className="p-4 space-y-2 mt-0">
            {ledger.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">No ledger activity in this range</Card>
            ) : ledger.map((l) => (
              <Card key={l.id} className="p-3 flex justify-between items-center">
                <div className="min-w-0">
                  <div className="text-sm font-medium capitalize">{l.type}</div>
                  <div className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</div>
                  {l.note && <div className="text-xs text-muted-foreground italic">{l.note}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold ${l.type === "payment" ? "text-success" : "text-warning"}`}>
                    {l.type === "payment" ? "−" : "+"}₹{Number(l.amount).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Bal ₹{Number(l.balance_after).toLocaleString()}</div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: any; sub?: string; accent: "primary" | "success" | "warning" }) {
  const cls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };
  return (
    <div className={`rounded-lg p-2 ${cls[accent]}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-80">
        {icon}<span>{label}</span>
      </div>
      <div className="font-bold text-sm leading-tight truncate">{value}</div>
      {sub && <div className="text-[10px] opacity-70 truncate">{sub}</div>}
    </div>
  );
}
