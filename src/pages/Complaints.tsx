import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertCircle, Image as ImgIcon, Mic, Square, CheckCircle2, Loader2, Paperclip, RotateCcw } from "lucide-react";
import { SemanticBadge } from "@/components/SemanticBadge";
import { toast } from "sonner";

export default function Complaints() {
  const { user, role, profile } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [retailerStock, setRetailerStock] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"defect" | "return">("defect");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => { if (user) void load(); }, [user]);

  const load = async () => {
    const col = role === "supplier" ? "supplier_id" : "retailer_id";
    const { data } = await supabase.from("complaints").select("*").eq(col, user!.id).order("created_at", { ascending: false });
    const rows = data ?? [];

    const retailerIds = Array.from(new Set(rows.map((r: any) => r.retailer_id)));
    const invoiceIds = Array.from(new Set(rows.map((r: any) => r.invoice_id).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean)));
    const [{ data: profs }, { data: invs }, { data: prods }] = await Promise.all([
      retailerIds.length ? supabase.from("profiles").select("id, name, shop_name").in("id", retailerIds) : Promise.resolve({ data: [] as any[] }),
      invoiceIds.length ? supabase.from("invoices").select("id, invoice_number").in("id", invoiceIds) : Promise.resolve({ data: [] as any[] }),
      productIds.length ? supabase.from("products").select("id, name, unit, price").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    const imap = new Map((invs ?? []).map((i: any) => [i.id, i]));
    const prmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    setItems(rows.map((r: any) => ({
      ...r,
      profiles: pmap.get(r.retailer_id),
      invoices: r.invoice_id ? imap.get(r.invoice_id) : null,
      products: r.product_id ? prmap.get(r.product_id) : null,
    })));

    if (role === "retailer") {
      const [{ data: inv }, { data: stock }] = await Promise.all([
        supabase.from("invoices").select("id, invoice_number").eq("retailer_id", user!.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("retailer_inventory").select("*, products(id, name, unit, price)").eq("retailer_id", user!.id),
      ]);
      setInvoices(inv ?? []);
      setRetailerStock((stock ?? []).filter((s: any) => s.products));
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const f = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        setFile(f);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  };
  const stopRec = () => { recorderRef.current?.stop(); setRecording(false); };

  const resetForm = () => {
    setType("defect"); setDescription(""); setReason(""); setProductId(""); setQty("");
    setInvoiceId("none"); setFile(null);
  };

  const submit = async () => {
    if (role !== "retailer" || !profile?.linked_supplier_id) return toast.error("No supplier linked");
    if (type === "return") {
      if (!productId) return toast.error("Choose a product to return");
      const qNum = Number(qty);
      if (!qNum) return toast.error("Enter return quantity");
      const stockRow = retailerStock.find((s) => s.product_id === productId);
      const available = Number(stockRow?.stock_quantity ?? 0);
      if (qNum > available) return toast.error(`You only have ${available} ${stockRow?.products?.unit ?? "units"} in stock — can't return more than that.`);
      if (!reason.trim()) return toast.error("Add a reason");
    } else if (!description.trim()) return toast.error("Describe the issue");

    setSubmitting(true);
    let mediaUrl: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user!.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("complaint-media").upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) { setSubmitting(false); return toast.error(upErr.message); }
      // Store storage path; signed URL is generated at render time (private bucket)
      mediaUrl = path;
    }

    const desc = type === "return"
      ? `Return: ${qty} × ${retailerStock.find((s) => s.product_id === productId)?.products?.name ?? "item"} — ${reason.trim()}`
      : description.trim();

    const { error } = await supabase.from("complaints").insert({
      retailer_id: user!.id,
      supplier_id: profile.linked_supplier_id,
      description: desc,
      invoice_id: invoiceId === "none" ? null : invoiceId,
      media_url: mediaUrl,
      type,
      product_id: type === "return" ? productId : null,
      quantity: type === "return" ? Number(qty) : null,
      reason: type === "return" ? reason.trim() : null,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(type === "return" ? "Return request sent" : "Complaint sent");
    setOpen(false); resetForm();
    void load();
  };

  const resolve = async (c: any) => {
    const { error } = await supabase.from("complaints").update({ status: "resolved" }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Marked resolved");
    void load();
  };

  const approveReturn = async (c: any) => {
    if (c.type !== "return" || !c.product_id || !c.quantity) return;
    // 1) reduce retailer stock — defensive cap
    const { data: existing } = await supabase.from("retailer_inventory")
      .select("*").eq("retailer_id", c.retailer_id).eq("product_id", c.product_id).maybeSingle();
    const available = Number(existing?.stock_quantity ?? 0);
    const returnQty = Math.min(Number(c.quantity), available);
    if (returnQty <= 0) { toast.error("Retailer has no stock left for this item"); return; }
    const newQty = available - returnQty;
    if (existing) {
      await supabase.from("retailer_inventory").update({
        stock_quantity: newQty, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    }
    // 2) add returned qty back to supplier stock
    const { data: prod } = await supabase.from("products").select("supplier_stock, price").eq("id", c.product_id).single();
    const refundAmt = Number(c.quantity) * Number(prod?.price ?? 0);
    await supabase.from("products").update({
      supplier_stock: Number(prod?.supplier_stock ?? 0) + Number(c.quantity),
    }).eq("id", c.product_id);
    // 3) inventory log
    await supabase.from("inventory_logs").insert({
      product_id: c.product_id,
      change_type: "in",
      quantity: Number(c.quantity),
      retailer_id: c.retailer_id,
      supplier_id: c.supplier_id,
      note: `Return approved: ${c.reason ?? ""}`,
    });
    // 4) ledger credit (refund)
    if (refundAmt > 0) {
      const { data: lastEntry } = await supabase.from("payments_ledger")
        .select("balance_after").eq("retailer_id", c.retailer_id).eq("supplier_id", c.supplier_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const prevBalance = Number(lastEntry?.balance_after ?? 0);
      await supabase.from("payments_ledger").insert({
        retailer_id: c.retailer_id,
        supplier_id: c.supplier_id,
        type: "payment",
        amount: refundAmt,
        balance_after: prevBalance - refundAmt,
        reference_invoice_id: c.invoice_id ?? null,
        note: `Return credit · ${c.reason ?? ""}`,
      });
    }
    await supabase.from("complaints").update({ status: "resolved" }).eq("id", c.id);
    toast.success("Return approved · stock & ledger updated");
    void load();
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Issues & Returns</h1>
        {role === "retailer" && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="hero" size="sm"><Plus className="w-4 h-4" /> New</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{type === "return" ? "Request return" : "Raise a complaint"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Tabs value={type} onValueChange={(v) => setType(v as any)}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="defect"><AlertCircle className="w-3.5 h-3.5 mr-1" />Complaint</TabsTrigger>
                    <TabsTrigger value="return"><RotateCcw className="w-3.5 h-3.5 mr-1" />Return</TabsTrigger>
                  </TabsList>
                </Tabs>

                {type === "return" ? (
                  <>
                    <div>
                      <Label>Product to return</Label>
                      <Select value={productId} onValueChange={setProductId}>
                        <SelectTrigger><SelectValue placeholder="Pick from your stock" /></SelectTrigger>
                        <SelectContent>
                          {retailerStock.length === 0 && <SelectItem disabled value="none">No stock available</SelectItem>}
                          {retailerStock.map((s) => (
                            <SelectItem key={s.product_id} value={s.product_id}>
                              {s.products.name} (have {s.stock_quantity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Quantity</Label>
                      <Input type="number" min={0}
                        max={retailerStock.find((s) => s.product_id === productId)?.stock_quantity}
                        value={qty} onChange={(e) => setQty(e.target.value)} />
                      {productId && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          You have {retailerStock.find((s) => s.product_id === productId)?.stock_quantity ?? 0} in stock.
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Reason</Label>
                      <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. expired, damaged, wrong item" />
                    </div>
                  </>
                ) : (
                  <div>
                    <Label>Describe the issue</Label>
                    <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 2 broken bottles in last delivery" />
                  </div>
                )}

                <div>
                  <Label>Linked invoice (optional)</Label>
                  <Select value={invoiceId} onValueChange={setInvoiceId}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.invoice_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Attach evidence (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" asChild>
                      <label className="cursor-pointer">
                        <ImgIcon className="w-4 h-4" /> Photo / Video
                        <Input type="file" accept="image/*,video/*" className="hidden"
                          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                      </label>
                    </Button>
                    {!recording ? (
                      <Button type="button" size="sm" variant="outline" onClick={startRec}>
                        <Mic className="w-4 h-4" /> Record voice
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="destructive" onClick={stopRec}>
                        <Square className="w-4 h-4" /> Stop
                      </Button>
                    )}
                  </div>
                  {file && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> {file.name}
                      <button className="ml-2 underline" onClick={() => setFile(null)}>remove</button>
                    </div>
                  )}
                </div>
                <Button variant="hero" className="w-full" onClick={submit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (type === "return" ? "Submit return" : "Submit")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          {role === "retailer" ? "Nothing raised yet" : "Nothing from retailers"}
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id} className={`p-3 space-y-2 ${c.status === "open" ? (c.type === "return" ? "border-warning/40" : "border-destructive/40") : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <SemanticBadge tone={c.type === "return" ? "warning" : "error"}>
                      {c.type === "return" ? "Return" : "Complaint"}
                    </SemanticBadge>
                  </div>
                  <div className="text-sm font-medium">{c.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {role === "supplier" && (c.profiles?.shop_name || c.profiles?.name) ? `${c.profiles?.shop_name || c.profiles?.name} · ` : ""}
                    {c.invoices?.invoice_number ? `${c.invoices.invoice_number} · ` : ""}
                    {new Date(c.created_at).toLocaleString()}
                  </div>
                </div>
                <SemanticBadge tone={c.status === "open" ? (c.type === "return" ? "warning" : "error") : c.status === "resolved" ? "success" : "neutral"}>
                  {c.status}
                </SemanticBadge>
              </div>
              {c.media_url && <MediaPreview url={c.media_url} />}
              {role === "supplier" && c.status === "open" && (
                <div className="flex gap-2">
                  {c.type === "return" ? (
                    <Button size="sm" variant="success" onClick={() => approveReturn(c)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve return
                    </Button>
                  ) : (
                    <Button size="sm" variant="success" onClick={() => resolve(c)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaPreview({ url }: { url: string }) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      // Backwards compat: if it's already a full URL (legacy public bucket), use as-is
      if (/^https?:\/\//i.test(url)) { setSigned(url); return; }
      // New format: storage path within complaint-media bucket
      const { data } = await supabase.storage.from("complaint-media").createSignedUrl(url, 3600);
      if (active) setSigned(data?.signedUrl ?? null);
    })();
    return () => { active = false; };
  }, [url]);

  if (!signed) return <div className="text-xs text-muted-foreground">Loading attachment…</div>;
  const lower = signed.toLowerCase();
  if (/\.(mp4|mov)(\?|$)/.test(lower)) {
    return <video src={signed} controls className="max-h-60 rounded-lg w-full bg-black" />;
  }
  if (/\.(mp3|ogg|wav|m4a|webm)(\?|$)/.test(lower)) {
    return <audio src={signed} controls className="w-full" />;
  }
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/.test(lower)) {
    return <img src={signed} alt="complaint media" className="max-h-60 rounded-lg" />;
  }
  return (
    <div className="space-y-2">
      <audio src={signed} controls className="w-full" />
      <a href={signed} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open attachment</a>
    </div>
  );
}
