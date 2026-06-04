import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Phone, MessageCircle, ClipboardList } from "lucide-react";
import { waLink, displayPhone } from "@/lib/phone";

interface RetailerRow {
  id: string;
  name: string;
  shop_name: string | null;
  phone: string;
  balance: number;
  pending: number;
  total: number;
}

export default function Retailers() {
  const { user, profile } = useAuth();
  const [retailers, setRetailers] = useState<RetailerRow[]>([]);

  useEffect(() => {
    if (!user) return;
    void load();
    const channel = supabase
      .channel(`supplier-retailers-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `supplier_id=eq.${user.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments_ledger", filter: `supplier_id=eq.${user.id}` }, () => void load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const load = async () => {
    const [{ data: profs }, { data: ledger }, { data: orders }] = await Promise.all([
      supabase.from("profiles").select("id, name, shop_name, phone").eq("linked_supplier_id", user!.id),
      supabase.from("payments_ledger").select("retailer_id, balance_after, created_at").eq("supplier_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("retailer_id, status").eq("supplier_id", user!.id),
    ]);

    const balances: Record<string, number> = {};
    (ledger ?? []).forEach((row: any) => {
      if (!(row.retailer_id in balances)) balances[row.retailer_id] = Number(row.balance_after);
    });

    const pendingByRet: Record<string, number> = {};
    const totalByRet: Record<string, number> = {};
    (orders ?? []).forEach((o: any) => {
      totalByRet[o.retailer_id] = (totalByRet[o.retailer_id] ?? 0) + 1;
      if (o.status === "pending") pendingByRet[o.retailer_id] = (pendingByRet[o.retailer_id] ?? 0) + 1;
    });

    setRetailers((profs ?? []).map((p: any) => ({
      ...p,
      balance: balances[p.id] ?? 0,
      pending: pendingByRet[p.id] ?? 0,
      total: totalByRet[p.id] ?? 0,
    })));
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Retailers</h1>

      <Card className="p-4 bg-primary/5 border-primary/30">
        <div className="text-sm font-medium">Add a retailer</div>
        <div className="text-xs text-muted-foreground mt-1">
          Ask them to sign up and enter your phone ({displayPhone(profile?.phone || "")}) as the supplier. They'll appear here automatically.
        </div>
      </Card>

      <div className="space-y-2">
        {retailers.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" /> No retailers yet
          </Card>
        )}
        {retailers.map((r) => (
          <Card key={r.id} className="p-3">
            <Link to={`/retailers/${r.id}`} className="block -m-3 p-3 rounded-md hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.shop_name || r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{displayPhone(r.phone)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-bold ${r.balance > 0 ? "text-warning" : r.balance < 0 ? "text-success" : ""}`}>
                    ₹{Math.round(Math.abs(r.balance)).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {r.balance > 0 ? "Due" : r.balance < 0 ? "Credit" : "Settled"}
                  </div>
                </div>
              </div>
            </Link>

            {/* mini stats — each clickable to filtered drill-down */}
            <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
              <Link to={`/retailers/${r.id}?tab=orders&status=pending`} className="block">
                <Stat label="Pending" value={r.pending} accent={r.pending > 0 ? "warning" : "muted"} />
              </Link>
              <Link to={`/retailers/${r.id}?tab=orders`} className="block">
                <Stat label="Total orders" value={r.total} accent="primary" />
              </Link>
              <Link to={`/retailers/${r.id}?tab=ledger`} className="block">
                <Stat label="Balance" value={`₹${Math.round(Math.abs(r.balance)).toLocaleString()}`} accent={r.balance > 0 ? "warning" : "success"} small />
              </Link>
            </div>

            <div className="flex gap-2">
              <Button asChild size="sm" variant="hero" className="flex-1">
                <Link to={`/retailers/${r.id}/store`}>
                  <ClipboardList className="w-4 h-4" /> Sale order
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={waLink(r.phone, `Hi ${r.name}, regarding your account…`)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  <MessageCircle className="w-4 h-4" />
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`tel:+91${r.phone}`} onClick={(e) => e.stopPropagation()}>
                  <Phone className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: any; accent: "warning" | "primary" | "success" | "muted"; small?: boolean }) {
  const cls: Record<string, string> = {
    warning: "text-warning bg-warning/10",
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    muted: "text-muted-foreground bg-muted/40",
  };
  return (
    <div className={`rounded-lg px-2 py-1.5 ${cls[accent]}`}>
      <div className={`font-bold leading-tight ${small ? "text-sm" : "text-base"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
}
