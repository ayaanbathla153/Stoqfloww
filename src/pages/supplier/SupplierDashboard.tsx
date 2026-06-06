import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ClipboardList, AlertTriangle, IndianRupee, Plus, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/SemanticBadge";

interface Stats {
  retailers: number;
  pendingOrders: number;
  lowStock: number;
  outstanding: number;
  needsVerification: number;
}

export default function SupplierDashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ retailers: 0, pendingOrders: 0, lowStock: 0, outstanding: 0, needsVerification: 0 });
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    void loadAll();

    const channel = supabase
      .channel(`supplier-dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `supplier_id=eq.${user.id}` }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `supplier_id=eq.${user.id}` }, () => void loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments_ledger", filter: `supplier_id=eq.${user.id}` }, () => void loadAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    const [retailers, products, ledger, orders, inv] = await Promise.all([
      supabase.from("profiles").select("id, name, shop_name").eq("linked_supplier_id", user.id),
      supabase.from("products").select("*").eq("supplier_id", user.id),
      supabase.from("payments_ledger").select("retailer_id, balance_after, created_at").eq("supplier_id", user.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("id, status, created_at, retailer_id").eq("supplier_id", user.id).order("created_at", { ascending: false }),
      supabase.from("retailer_inventory").select("retailer_id, last_verified_at, stock_quantity").gt("stock_quantity", 0),
    ]);

    const lowItems = (products.data ?? []).filter((p: any) => Number(p.supplier_stock) <= Number(p.low_stock_threshold));

    // outstanding = sum of latest balance_after per retailer (positive = owes)
    const latestPerRetailer: Record<string, number> = {};
    (ledger.data ?? []).forEach((row: any) => {
      if (!(row.retailer_id in latestPerRetailer)) latestPerRetailer[row.retailer_id] = Number(row.balance_after);
    });
    const outstanding = Object.values(latestPerRetailer).reduce((a, b) => a + (b > 0 ? b : 0), 0);
    const retailerMap = new Map((retailers.data ?? []).map((r: any) => [r.id, r]));
    const recent = (orders.data ?? []).slice(0, 5).map((o: any) => ({ ...o, profiles: retailerMap.get(o.retailer_id) ?? null }));

    // Retailers with at least one SKU not verified in 20+ days (or never)
    const cutoff = Date.now() - 20 * 86_400_000;
    const needsSet = new Set<string>();
    (inv.data ?? []).forEach((r: any) => {
      const t = r.last_verified_at ? Date.parse(r.last_verified_at) : 0;
      if (!t || t < cutoff) needsSet.add(r.retailer_id);
    });

    setStats({
      retailers: retailers.data?.length ?? 0,
      pendingOrders: (orders.data ?? []).filter((o: any) => o.status === "pending").length,
      lowStock: lowItems.length,
      outstanding,
      needsVerification: needsSet.size,
    });
    setLowStockItems(lowItems.slice(0, 4));
    setRecentOrders(recent);
  };

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <div>
        <p className="text-muted-foreground text-sm">Welcome back,</p>
        <h1 className="text-2xl font-bold">{profile?.name || "Supplier"}</h1>
      </div>

      {stats.pendingOrders > 0 && (
        <Link to="/orders">
          <Card className="p-4 bg-warning/10 border-warning/40 flex items-center justify-between hover:border-warning transition-smooth">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 grid place-items-center">
                <ClipboardList className="w-5 h-5 text-warning" />
              </div>
              <div>
                <div className="font-semibold text-sm">{stats.pendingOrders} pending order{stats.pendingOrders > 1 ? "s" : ""}</div>
                <div className="text-xs text-muted-foreground">Tap to review & invoice</div>
              </div>
            </div>
            <Badge variant="outline" className="border-warning/50 text-warning">Action</Badge>
          </Card>
        </Link>
      )}

      {stats.needsVerification > 0 && (
        <Link to="/retailers">
          <Card className="p-4 bg-warning/10 border-warning/40 flex items-center justify-between hover:border-warning transition-smooth">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 grid place-items-center">
                <Package className="w-5 h-5 text-warning" />
              </div>
              <div>
                <div className="font-semibold text-sm">{stats.needsVerification} retailer{stats.needsVerification > 1 ? "s" : ""} need stock verification</div>
                <div className="text-xs text-muted-foreground">Last visit &gt; 20 days ago</div>
              </div>
            </div>
            <Badge variant="outline" className="border-warning/50 text-warning">Visit</Badge>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Users className="w-5 h-5" />} label="Retailers" value={stats.retailers} accent="primary" link="/retailers" />
        <StatCard icon={<ClipboardList className="w-5 h-5" />} label="Pending orders" value={stats.pendingOrders} accent="warning" link="/orders" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Low stock" value={stats.lowStock} accent="destructive" link="/inventory" />
        <StatCard icon={<IndianRupee className="w-5 h-5" />} label="Outstanding" value={`₹${Math.round(stats.outstanding).toLocaleString()}`} accent="success" link="/ledger" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="hero" size="lg" className="h-14">
          <Link to="/products">
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-14">
          <Link to="/retailers">
            <ClipboardList className="w-4 h-4 mr-1" /> Sale Order
          </Link>
        </Button>
      </div>

      {lowStockItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Low stock</h2>
            <Link to="/inventory" className="text-xs text-primary">View all</Link>
          </div>
          <div className="space-y-2">
            {lowStockItems.map((p) => (
              <Card key={p.id} className="p-3 flex items-center justify-between bg-destructive/5 border-destructive/30">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/20 grid place-items-center">
                    <Package className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category || "—"}</div>
                  </div>
                </div>
                <Badge variant="destructive">{p.supplier_stock} {p.unit}</Badge>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent orders</h2>
          <Link to="/orders" className="text-xs text-primary">View all</Link>
        </div>
        <div className="space-y-2">
          {recentOrders.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">No orders yet</Card>
          )}
          {recentOrders.map((o: any) => (
            <Link to="/orders" key={o.id}>
              <Card className="p-3 flex items-center justify-between hover:border-primary/50 transition-smooth">
                <div>
                  <div className="font-medium text-sm">{o.profiles?.shop_name || o.profiles?.name || "Retailer"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={o.status} />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, accent, link }: { icon: React.ReactNode; label: string; value: any; accent: "primary" | "warning" | "destructive" | "success"; link?: string }) {
  const accentClasses: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    destructive: "text-destructive bg-destructive/10",
    success: "text-success bg-success/10",
  };
  const inner = (
    <Card className="p-4 bg-gradient-card border-border/50 hover:border-primary/40 transition-smooth h-full">
      <div className={`w-10 h-10 rounded-lg grid place-items-center mb-2 ${accentClasses[accent]}`}>{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}

export { StatusBadge } from "@/components/SemanticBadge";
