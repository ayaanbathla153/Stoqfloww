import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes, Package, AlertTriangle, Plus, Pencil, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { ConfidenceDot, LastVerified } from "@/components/ConfidenceDot";
import { refillHint } from "@/lib/stock-intel";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

const emptyForm = { name: "", category: "", unit: "pcs", price: "", supplier_stock: "", low_stock_threshold: "10" };

export default function Inventory() {
  const { role } = useAuth();
  if (role === "retailer") return <RetailerInventory />;
  return <SupplierInventory />;
}

function SupplierInventory() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [retailerStocks, setRetailerStocks] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`sup-inv-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "retailer_inventory" }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const load = async () => {
    const { data: prods } = await supabase.from("products").select("*").eq("supplier_id", user!.id).order("name");
    setProducts(prods ?? []);
    const productIds = (prods ?? []).map((p: any) => p.id);
    if (productIds.length === 0) { setRetailerStocks([]); return; }
    const { data: rs } = await supabase.from("retailer_inventory")
      .select("*").in("product_id", productIds);
    const retailerIds = [...new Set((rs ?? []).map((r: any) => r.retailer_id))];
    const { data: profs } = retailerIds.length
      ? await supabase.from("profiles").select("id, name, shop_name").in("id", retailerIds)
      : { data: [] as any[] };
    const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    const rmap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    setRetailerStocks((rs ?? []).map((r: any) => ({
      ...r,
      products: pmap.get(r.product_id),
      profiles: rmap.get(r.retailer_id),
    })).filter((r: any) => r.products));
  };

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name, category: p.category ?? "", unit: p.unit, price: String(p.price),
      supplier_stock: String(p.supplier_stock), low_stock_threshold: String(p.low_stock_threshold),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name) return toast.error("Name required");
    const payload = {
      supplier_id: user!.id,
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit.trim() || "pcs",
      price: Number(form.price) || 0,
      supplier_stock: Number(form.supplier_stock) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 10,
    };
    const res = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Product updated" : "Product added");
    setOpen(false);
    void load();
  };
const retailerGroups = useMemo(() => {
  const map = new Map();

  retailerStocks.forEach((r) => {
    const retailerId = r.retailer_id;

    if (!map.has(retailerId)) {
      map.set(retailerId, {
        retailerId,
        retailerName:
          r.profiles?.shop_name ||
          r.profiles?.name ||
          "Retailer",
        lastVerified: r.last_verified_at,
        items: [],
      });
    }

    map.get(retailerId).items.push(r);
  });

  return Array.from(map.values());
}, [retailerStocks]);
  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Inventory</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add product
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div><Label>Stock</Label><Input type="number" value={form.supplier_stock} onChange={(e) => setForm({ ...form, supplier_stock: e.target.value })} /></div>
              </div>
              <div><Label>Low stock alert at</Label><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></div>
              <Button variant="hero" className="w-full" onClick={save}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="supplier">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="supplier">My stock</TabsTrigger>
          <TabsTrigger value="retailer">Retailer estimated stock</TabsTrigger>
        </TabsList>
        <TabsContent value="supplier" className="space-y-2 mt-3">
          {products.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" /> Tap "Add product" to start
            </Card>
          )}
          {products.map((p) => {
            const low = Number(p.supplier_stock) <= Number(p.low_stock_threshold);
            return (
              <Card key={p.id} className={`p-3 flex items-center gap-3 ${low ? "border-destructive/40 bg-destructive/5" : ""}`}>
                <div className={`w-9 h-9 rounded-lg grid place-items-center ${low ? "bg-destructive/20" : "bg-primary/15"}`}>
                  {low ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <Package className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.category || "—"} · ₹{p.price}/{p.unit}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${low ? "text-destructive" : ""}`}>{p.supplier_stock}</div>
                  <div className="text-[10px] text-muted-foreground">{p.unit}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </Card>
            );
          })}
        </TabsContent>
        <TabsContent value="retailer" className="space-y-2 mt-3">
          <p className="text-[11px] text-muted-foreground -mt-1">Estimated values, updated by deliveries, returns &amp; supplier visits.</p>
          {retailerStocks.length === 0 && <Card className="p-8 text-center text-muted-foreground text-sm"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-50" />No retailer stock yet</Card>}
          {retailerGroups.map((retailer) => (
  <Card
    key={retailer.retailerId}
    className="p-4 cursor-pointer hover:border-primary/40 transition"
  >
    <div className="flex items-center justify-between">
      <div>
        <div className="font-semibold">
          {retailer.retailerName}
        </div>

        <div className="text-sm text-muted-foreground">
          {retailer.items.length} products
        </div>
      </div>

      <ChevronRight className="w-5 h-5" />
    </div>
  </Card>
))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RetailerInventory() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editQty, setEditQty] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`r-inv-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "retailer_inventory", filter: `retailer_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const load = async () => {
    const { data: inv } = await supabase.from("retailer_inventory").select("*").eq("retailer_id", user!.id);
    const productIds = (inv ?? []).map((r: any) => r.product_id);
    const supplierId = profile?.linked_supplier_id;
    const { data: prods } = supplierId
      ? await supabase.from("products").select("*").eq("supplier_id", supplierId)
      : { data: [] as any[] };
    setProducts(prods ?? []);
    const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    setRows((inv ?? []).map((r: any) => ({ ...r, products: pmap.get(r.product_id) })).filter((r: any) => r.products));
  };

  const addStock = async () => {
    if (!productId || !qty) return toast.error("Pick a product & quantity");
    const q = Number(qty);
    if (!q) return;
    const { data: existing } = await supabase.from("retailer_inventory")
      .select("*").eq("retailer_id", user!.id).eq("product_id", productId).maybeSingle();
    if (existing) {
      await supabase.from("retailer_inventory")
        .update({ stock_quantity: Number(existing.stock_quantity) + q, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("retailer_inventory").insert({
        retailer_id: user!.id, product_id: productId, stock_quantity: q,
      });
    }
    toast.success("Stock added");
    setOpen(false); setProductId(""); setQty("");
    void load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const q = Math.max(0, Number(editQty) || 0);
    await supabase.from("retailer_inventory")
      .update({ stock_quantity: q, updated_at: new Date().toISOString() })
      .eq("id", editing.id);
    toast.success("Updated");
    setEditing(null);
    void load();
  };

  const availableProducts = products.filter((p) => !rows.some((r) => r.product_id === p.id));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My estimated stock</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm"><Plus className="w-4 h-4" /> Add stock</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Add stock</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>
                    {availableProducts.length === 0 && <SelectItem disabled value="none">All products already added</SelectItem>}
                    {availableProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <Button variant="hero" className="w-full" onClick={addStock}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground">Estimated stock — auto-updates from deliveries &amp; supplier visits. Self-correct anytime.</p>

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <Boxes className="w-8 h-8 mx-auto mb-2 opacity-50" /> No stock yet
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const low = Number(r.stock_quantity) <= Number(r.products?.low_stock_threshold ?? 0);
            return (
              <Card key={r.id} className={`p-3 flex items-center gap-3 ${low ? "border-destructive/40 bg-destructive/5" : ""}`}>
                <div className={`w-9 h-9 rounded-lg grid place-items-center ${low ? "bg-destructive/20" : "bg-primary/15"}`}>
                  {low ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <Package className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.products?.name}</div>
                  <div className="text-xs text-muted-foreground">₹{r.products?.price}/{r.products?.unit}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${low ? "text-destructive" : ""}`}>{r.stock_quantity}</div>
                  <div className="text-[10px] text-muted-foreground">{r.products?.unit}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setEditQty(String(r.stock_quantity)); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust {editing?.products?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Stock quantity</Label><Input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} /></div>
            <Button variant="hero" className="w-full" onClick={saveEdit}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
