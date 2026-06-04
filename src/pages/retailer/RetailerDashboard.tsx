import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, FileText, Wallet, Package } from "lucide-react";
import { StatusBadge } from "../supplier/SupplierDashboard";

export default function RetailerDashboard() {
  const { user, profile } = useAuth();
  const [balance, setBalance] = useState(0);
  const [pendingDelivery, setPendingDelivery] = useState(0);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    const [ledger, invoices, orders] = await Promise.all([
      supabase.from("payments_ledger").select("balance_after").eq("retailer_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("retailer_id", user.id).eq("status", "pending_delivery"),
      supabase.from("orders").select("id, status, created_at").eq("retailer_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);
    setBalance(Number(ledger.data?.[0]?.balance_after ?? 0));
    setPendingDelivery(invoices.count ?? 0);
    setRecent(orders.data ?? []);
  };

  return (
    <div className="p-4 space-y-6 animate-fade-in">
      <div>
        <p className="text-muted-foreground text-sm">Hello,</p>
        <h1 className="text-2xl font-bold">{profile?.shop_name || profile?.name}</h1>
      </div>

      <Card className="p-5 bg-gradient-primary text-primary-foreground shadow-glow">
        <div className="text-xs uppercase tracking-wider opacity-80">Outstanding balance</div>
        <div className="text-3xl font-bold mt-1">₹{Math.round(balance).toLocaleString()}</div>
        <div className="text-xs mt-1 opacity-80">{balance > 0 ? "Amount due to supplier" : balance < 0 ? "Credit balance" : "All settled"}</div>
      </Card>

      <Button asChild variant="hero" size="lg" className="w-full h-14 text-base">
        <Link to="/place-order">
          <ShoppingCart className="w-5 h-5 mr-2" /> Place new order
        </Link>
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/invoices">
          <Card className="p-4 bg-gradient-card hover:border-primary/40 transition-smooth h-full">
            <FileText className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">{pendingDelivery}</div>
            <div className="text-xs text-muted-foreground">Awaiting delivery</div>
          </Card>
        </Link>
        <Link to="/ledger">
          <Card className="p-4 bg-gradient-card hover:border-primary/40 transition-smooth h-full">
            <Wallet className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">View</div>
            <div className="text-xs text-muted-foreground">Payment ledger</div>
          </Card>
        </Link>
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent orders</h2>
        </div>
        <div className="space-y-2">
          {recent.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" /> No orders yet. Place your first one!
            </Card>
          )}
          {recent.map((o) => (
            <Card key={o.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Order #{o.id.slice(0, 8)}</div>
                <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
              </div>
              <StatusBadge status={o.status} />
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
