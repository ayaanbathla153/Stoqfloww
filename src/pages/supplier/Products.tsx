import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package, AlertTriangle, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Products() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", category: "", unit: "pcs", price: "", supplier_stock: "", low_stock_threshold: "10" });

  useEffect(() => { if (user) void load(); }, [user]);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").eq("supplier_id", user!.id).order("created_at", { ascending: false });
    setItems(data ?? []);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "", unit: "pcs", price: "", supplier_stock: "", low_stock_threshold: "10" });
    setOpen(true);
  };

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

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Products</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add
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

      <div className="space-y-2">
        {items.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-50" /> Add your first product
          </Card>
        )}
        {items.map((p) => {
          const low = Number(p.supplier_stock) <= Number(p.low_stock_threshold);
          return (
            <Card key={p.id} className={`p-3 flex items-center gap-3 ${low ? "border-destructive/40 bg-destructive/5" : ""}`}>
              <div className={`w-10 h-10 rounded-lg grid place-items-center ${low ? "bg-destructive/20" : "bg-primary/15"}`}>
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
      </div>
    </div>
  );
}
