import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Wallet, ArrowDownRight, ArrowUpRight, TrendingUp, TrendingDown, Users, ChevronRight, ArrowLeft, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./supplier/SupplierDashboard";

type Entry = {
  id: string;
  created_at: string;
  type: "invoice" | "payment";
  amount: number;
  balance_after: number;
  note: string | null;
  retailer_id: string;
  supplier_id: string;
  reference_invoice_id?: string | null;
  profiles?: { name: string; shop_name: string | null } | null;
};

type Retailer = { id: string; name: string; shop_name: string | null };

type InvoiceRow = {
  id: string;
  invoice_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  retailer_id: string;
  supplier_id: string;
  retailer?: Retailer | null;
};

export default function Ledger() {
  const { user, role } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [selectedRetailer, setSelectedRetailer] = useState<string | null>(null);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState<"invoice" | "payment">("payment");
  const [paymentRetailer, setPaymentRetailer] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => { if (user) void load(); }, [user, role]);

  const load = async () => {
    if (!user) return;
    if (role === "supplier") {
      const [{ data: rs }, { data: ledger }, { data: invs }] = await Promise.all([
        supabase.from("profiles").select("id, name, shop_name").eq("linked_supplier_id", user.id),
        supabase.from("payments_ledger").select("*").eq("supplier_id", user.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("supplier_id", user.id).order("created_at", { ascending: false }),
      ]);
      const rmap = new Map((rs ?? []).map((r: any) => [r.id, r]));
      setRetailers((rs ?? []) as Retailer[]);
      setEntries((ledger ?? []).map((e: any) => ({ ...e, profiles: rmap.get(e.retailer_id) ?? null })) as Entry[]);
      setInvoices((invs ?? []).map((inv: any) => ({ ...inv, retailer: rmap.get(inv.retailer_id) ?? null })) as InvoiceRow[]);
    } else {
      const [{ data: ledger }, { data: invs }] = await Promise.all([
        supabase.from("payments_ledger").select("*").eq("retailer_id", user.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("retailer_id", user.id).order("created_at", { ascending: false }),
      ]);
      setEntries((ledger ?? []) as Entry[]);
      setInvoices((invs ?? []) as InvoiceRow[]);
    }
  };

  const paidByInvoice = useMemo(() => {
    const paid: Record<string, number> = {};
    entries.forEach((e) => {
      if (e.type === "payment" && e.reference_invoice_id) {
        paid[e.reference_invoice_id] = (paid[e.reference_invoice_id] ?? 0) + Number(e.amount);
      }
    });
    return paid;
  }, [entries]);

  const pendingInvoices = useMemo(() => invoices
    .map((inv) => ({ ...inv, paid: paidByInvoice[inv.id] ?? 0, pendingAmount: Math.max(Number(inv.total_amount) - (paidByInvoice[inv.id] ?? 0), 0) }))
    .filter((inv) => inv.pendingAmount > 0.01),
  [invoices, paidByInvoice]);

  const perRetailer = useMemo(() => {
    const map: Record<string, { balance: number; charged: number; paid: number; pendingInvoiceAmount: number; pendingInvoiceCount: number; lastDate: string }> = {};
    entries.forEach((e) => {
      const m = map[e.retailer_id] ?? (map[e.retailer_id] = { balance: 0, charged: 0, paid: 0, pendingInvoiceAmount: 0, pendingInvoiceCount: 0, lastDate: e.created_at });
      if (e.type === "invoice") m.charged += Number(e.amount);
      else m.paid += Number(e.amount);
    });
    const seen = new Set<string>();
    entries.forEach((e) => {
      if (!seen.has(e.retailer_id)) {
        map[e.retailer_id].balance = Number(e.balance_after);
        map[e.retailer_id].lastDate = e.created_at;
        seen.add(e.retailer_id);
      }
    });
    pendingInvoices.forEach((inv) => {
      const m = map[inv.retailer_id] ?? (map[inv.retailer_id] = { balance: 0, charged: 0, paid: 0, pendingInvoiceAmount: 0, pendingInvoiceCount: 0, lastDate: "" });
      m.pendingInvoiceAmount += inv.pendingAmount;
      m.pendingInvoiceCount += 1;
    });
    retailers.forEach((r) => {
      if (!map[r.id]) map[r.id] = { balance: 0, charged: 0, paid: 0, pendingInvoiceAmount: 0, pendingInvoiceCount: 0, lastDate: "" };
    });
    return map;
  }, [entries, retailers, pendingInvoices]);

  const totals = useMemo(() => {
    const list = Object.values(perRetailer);
    const totalCharged = list.reduce((s, x) => s + x.charged, 0);
    const totalPaid = list.reduce((s, x) => s + x.paid, 0);
    const totalOutstanding = list.reduce((s, x) => s + (x.balance > 0 ? x.balance : 0), 0);
    const totalAdvance = list.reduce((s, x) => s + (x.balance < 0 ? -x.balance : 0), 0);
    const pendingInvoiceAmount = pendingInvoices.reduce((s, x) => s + x.pendingAmount, 0);
    return { totalCharged, totalPaid, totalOutstanding, totalAdvance, pendingInvoiceAmount };
  }, [perRetailer, pendingInvoices]);

  const filteredEntries = useMemo(
    () => (selectedRetailer ? entries.filter((e) => e.retailer_id === selectedRetailer) : entries),
    [entries, selectedRetailer],
  );

  const filteredPendingInvoices = useMemo(
    () => (selectedRetailer ? pendingInvoices.filter((inv) => inv.retailer_id === selectedRetailer) : pendingInvoices),
    [pendingInvoices, selectedRetailer],
  );

  const openAdd = (type: "invoice" | "payment", retailerId?: string) => {
    setEntryType(type);
    setPaymentRetailer(retailerId ?? selectedRetailer ?? "");
    setAmount(""); setNote("");
    setOpen(true);
  };

  const insertLedgerEntry = async (retailerId: string, type: "invoice" | "payment", amt: number, entryNote: string, invoiceId?: string) => {
    const { data: last } = await supabase.from("payments_ledger")
      .select("balance_after").eq("retailer_id", retailerId).eq("supplier_id", user!.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const prev = Number(last?.balance_after ?? 0);
    const newBalance = type === "invoice" ? prev + amt : prev - amt;

    return supabase.from("payments_ledger").insert({
      retailer_id: retailerId,
      supplier_id: user!.id,
      type,
      amount: amt,
      balance_after: newBalance,
      reference_invoice_id: invoiceId ?? null,
      note: entryNote,
    });
  };

  const submitEntry = async () => {
    if (!paymentRetailer || !amount) return toast.error("Pick retailer & enter amount");
    const amt = Number(amount);
    if (amt <= 0) return toast.error("Amount must be positive");

    const { error } = await insertLedgerEntry(
      paymentRetailer,
      entryType,
      amt,
      note || (entryType === "invoice" ? "Manual charge" : "Payment received"),
    );
    if (error) return toast.error(error.message);
    toast.success(entryType === "invoice" ? "Charge recorded" : "Payment recorded");
    setOpen(false);
    void load();
  };

  const markInvoicePaid = async (inv: InvoiceRow & { pendingAmount: number }) => {
    if (!user || role !== "supplier") return;
    const amt = Number(inv.pendingAmount);
    if (amt <= 0) return toast.info("Invoice already settled");
    setPayingInvoiceId(inv.id);
    const { error } = await insertLedgerEntry(inv.retailer_id, "payment", amt, `Payment received · ${inv.invoice_number}`, inv.id);
    setPayingInvoiceId(null);
    if (error) return toast.error(error.message);
    toast.success("Payment marked received");
    void load();
  };

  if (role !== "supplier") {
    const myBalance = entries[0] ? Number(entries[0].balance_after) : 0;
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <h1 className="text-xl font-bold">Ledger</h1>
        <Card className="p-4 bg-gradient-card">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding balance</div>
          <div className={`text-3xl font-bold mt-1 ${myBalance > 0 ? "text-warning" : myBalance < 0 ? "text-success" : ""}`}>
            ₹{Math.abs(myBalance).toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {myBalance > 0 ? "You owe your supplier" : myBalance < 0 ? "Advance with supplier" : "All clear"}
          </div>
        </Card>
        {pendingInvoices.length > 0 && (
          <PendingInvoicesList invoices={pendingInvoices} onPay={markInvoicePaid} payingInvoiceId={payingInvoiceId} canReceive={false} />
        )}
        <EntriesList entries={entries} showRetailer={false} />
      </div>
    );
  }

  if (selectedRetailer) {
    const r = retailers.find((x) => x.id === selectedRetailer);
    const stats = perRetailer[selectedRetailer] ?? { balance: 0, charged: 0, paid: 0, pendingInvoiceAmount: 0, pendingInvoiceCount: 0, lastDate: "" };
    return (
      <div className="p-4 space-y-4 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedRetailer(null)}>
            <ArrowLeft className="w-4 h-4" /> All accounts
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => openAdd("invoice")}>
              <ArrowUpRight className="w-4 h-4" /> Charge
            </Button>
            <Button size="sm" variant="hero" onClick={() => openAdd("payment")}>
              <ArrowDownRight className="w-4 h-4" /> Payment
            </Button>
          </div>
        </div>

        <Card className="p-4 bg-gradient-card">
          <div className="text-sm font-semibold">{r?.shop_name || r?.name}</div>
          <div className="text-xs text-muted-foreground">Account summary</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <Mini label="Balance" value={`₹${Math.abs(stats.balance).toLocaleString()}`} tone={stats.balance > 0 ? "warning" : stats.balance < 0 ? "success" : "muted"} sub={stats.balance > 0 ? "Owes" : stats.balance < 0 ? "Advance" : "Settled"} />
            <Mini label="Pending bills" value={`₹${Math.round(stats.pendingInvoiceAmount).toLocaleString()}`} tone={stats.pendingInvoiceAmount > 0 ? "warning" : "muted"} sub={`${stats.pendingInvoiceCount} invoices`} />
            <Mini label="Charged" value={`₹${stats.charged.toLocaleString()}`} tone="warning" />
            <Mini label="Paid" value={`₹${stats.paid.toLocaleString()}`} tone="success" />
          </div>
        </Card>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pending invoices</h2>
          <PendingInvoicesList invoices={filteredPendingInvoices} onPay={markInvoicePaid} payingInvoiceId={payingInvoiceId} canReceive />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Activity</h2>
          <EntriesList entries={filteredEntries} showRetailer={false} />
        </section>

        <AddDialog
          open={open} setOpen={setOpen}
          type={entryType} setType={setEntryType}
          retailers={retailers} retailer={paymentRetailer} setRetailer={setPaymentRetailer}
          amount={amount} setAmount={setAmount}
          note={note} setNote={setNote}
          onSubmit={submitEntry}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Accounts</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm" onClick={() => openAdd("payment")}>
              <Plus className="w-4 h-4" /> Entry
            </Button>
          </DialogTrigger>
          <AddDialogContent
            type={entryType} setType={setEntryType}
            retailers={retailers} retailer={paymentRetailer} setRetailer={setPaymentRetailer}
            amount={amount} setAmount={setAmount}
            note={note} setNote={setNote}
            onSubmit={submitEntry}
          />
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="w-3.5 h-3.5 text-warning" /> Outstanding</div>
          <div className="text-xl font-bold mt-1 text-warning">₹{Math.round(totals.totalOutstanding).toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="w-3.5 h-3.5 text-warning" /> Pending invoices</div>
          <div className="text-xl font-bold mt-1 text-warning">₹{Math.round(totals.pendingInvoiceAmount).toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingDown className="w-3.5 h-3.5 text-success" /> Advance held</div>
          <div className="text-lg font-semibold mt-1 text-success">₹{Math.round(totals.totalAdvance).toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total received</div>
          <div className="text-lg font-semibold mt-1">₹{Math.round(totals.totalPaid).toLocaleString()}</div>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="accounts">By retailer</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="recent">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-2 mt-3">
          {retailers.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" /> No retailers yet
            </Card>
          )}
          {retailers.map((r) => {
            const s = perRetailer[r.id] ?? { balance: 0, charged: 0, paid: 0, pendingInvoiceAmount: 0, pendingInvoiceCount: 0 };
            const owes = s.balance > 0;
            return (
              <Card key={r.id} className="p-3 flex items-center gap-3 cursor-pointer hover:border-primary/40 transition-smooth" onClick={() => setSelectedRetailer(r.id)}>
                <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.shop_name || r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.pendingInvoiceCount} pending bills · ₹{Math.round(s.pendingInvoiceAmount).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${owes ? "text-warning" : s.balance < 0 ? "text-success" : "text-muted-foreground"}`}>
                    ₹{Math.abs(Math.round(s.balance)).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase">{owes ? "Due" : s.balance < 0 ? "Advance" : "Settled"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="pending" className="mt-3">
          <PendingInvoicesList invoices={pendingInvoices} onPay={markInvoicePaid} payingInvoiceId={payingInvoiceId} canReceive />
        </TabsContent>

        <TabsContent value="recent" className="mt-3">
          <EntriesList entries={entries} showRetailer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Mini({ label, value, tone, sub }: { label: string; value: string; tone: "warning" | "success" | "muted"; sub?: string }) {
  const cls = tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`font-bold ${cls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function PendingInvoicesList({ invoices, onPay, payingInvoiceId, canReceive }: { invoices: (InvoiceRow & { pendingAmount: number; paid: number })[]; onPay: (inv: InvoiceRow & { pendingAmount: number; paid: number }) => void; payingInvoiceId: string | null; canReceive: boolean }) {
  if (invoices.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground text-sm">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" /> No pending invoices
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <Card key={inv.id} className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold truncate">{inv.invoice_number}</div>
              <div className="text-xs text-muted-foreground truncate">
                {inv.retailer?.shop_name || inv.retailer?.name || "Retailer"} · {new Date(inv.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-warning">₹{Math.round(inv.pendingAmount).toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">of ₹{Math.round(Number(inv.total_amount)).toLocaleString()}</div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={inv.status} />
            {canReceive && (
              <Button size="sm" variant="hero" onClick={() => onPay(inv)} disabled={payingInvoiceId === inv.id}>
                {payingInvoiceId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Received
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

function EntriesList({ entries, showRetailer }: { entries: Entry[]; showRetailer: boolean }) {
  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground text-sm">
        <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" /> No entries yet
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const isInvoice = e.type === "invoice";
        return (
          <Card key={e.id} className="p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg grid place-items-center ${isInvoice ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
              {isInvoice ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{e.note || (isInvoice ? "Charge" : "Payment")}</div>
              <div className="text-xs text-muted-foreground">
                {showRetailer && (e.profiles?.shop_name || e.profiles?.name) ? (e.profiles?.shop_name || e.profiles?.name) + " · " : ""}
                {new Date(e.created_at).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right">
              <div className={`font-bold ${isInvoice ? "text-warning" : "text-success"}`}>
                {isInvoice ? "+" : "−"}₹{Number(e.amount).toLocaleString()}
              </div>
              <div className="text-[10px] text-muted-foreground">Bal: ₹{Number(e.balance_after).toLocaleString()}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AddDialog(props: any) {
  return (
    <Dialog open={props.open} onOpenChange={props.setOpen}>
      <AddDialogContent {...props} />
    </Dialog>
  );
}

function AddDialogContent({ type, setType, retailers, retailer, setRetailer, amount, setAmount, note, setNote, onSubmit }: any) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>New ledger entry</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Tabs value={type} onValueChange={setType}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="payment" className="data-[state=active]:bg-success/15 data-[state=active]:text-success">
              <ArrowDownRight className="w-4 h-4 mr-1" /> Payment received
            </TabsTrigger>
            <TabsTrigger value="invoice" className="data-[state=active]:bg-warning/15 data-[state=active]:text-warning">
              <ArrowUpRight className="w-4 h-4 mr-1" /> Charge / Debit
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div>
          <Label>Retailer</Label>
          <Select value={retailer} onValueChange={setRetailer}>
            <SelectTrigger><SelectValue placeholder="Select retailer" /></SelectTrigger>
            <SelectContent>
              {retailers.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>{r.shop_name || r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Amount (₹)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "invoice" ? "e.g. opening balance, late fee" : "e.g. UPI, cash"} /></div>
        <Button variant="hero" className="w-full" onClick={onSubmit}>Save entry</Button>
      </div>
    </DialogContent>
  );
}
