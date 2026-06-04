import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, User, Phone, Store, Repeat, Plus, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { normalizePhone, digits10 } from "@/lib/phone";

export default function Profile() {
  const { user, profile, role, roles, signOut, switchRole, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shopName, setShopName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");

  // role they don't have yet
  const missingRole: "supplier" | "retailer" | null =
    !roles.includes("supplier") ? "supplier" : !roles.includes("retailer") ? "retailer" : null;

  const handleAddRole = async () => {
    if (!user || !missingRole) return;
    setBusy(true);
    try {
      const updates: any = {};
      let linkedSupplierId: string | null = null;

      if (missingRole === "retailer") {
        if (digits10(supplierPhone).length !== 10) {
          setBusy(false);
          return toast.error("Enter your supplier's 10-digit phone");
        }
        const { data: supId, error: supErr } = await supabase
          .rpc("find_supplier_by_phone", { _phone: normalizePhone(supplierPhone) });
        if (supErr || !supId) {
          setBusy(false);
          return toast.error("Supplier not found. Ask them to sign up first.");
        }
        linkedSupplierId = supId as string;
        updates.linked_supplier_id = linkedSupplierId;
        if (shopName) updates.shop_name = shopName;
      } else {
        // becoming a supplier — keep linked_supplier_id as is, optionally set business name
        if (shopName) updates.shop_name = shopName;
      }

      // Insert role row
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: user.id,
        role: missingRole,
      });
      if (roleErr) throw roleErr;

      if (Object.keys(updates).length) {
        await supabase.from("profiles").update(updates).eq("id", user.id);
      }

      await refresh();
      // auto-switch to newly added role
      await switchRole(missingRole);
      toast.success(`${missingRole === "supplier" ? "Supplier" : "Retailer"} profile added!`);
      setOpen(false);
      setShopName("");
      setSupplierPhone("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add role");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold">Profile</h1>

      <Card className="p-5 bg-gradient-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-primary grid place-items-center shadow-glow">
            <User className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-lg truncate">{profile?.name}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Active: {role}</div>
          </div>
        </div>
        <div className="space-y-2 text-sm">
          {profile?.shop_name && (
            <div className="flex items-center gap-2 text-muted-foreground"><Store className="w-4 h-4" /> {profile.shop_name}</div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-4 h-4" /> +91 {profile?.phone}</div>
        </div>
      </Card>

      {/* Role switcher — only visible if user has 2+ roles */}
      {roles.length > 1 && (
        <Card className="p-4 bg-gradient-card">
          <div className="flex items-center gap-2 mb-3">
            <Repeat className="w-4 h-4 text-primary" />
            <div className="font-semibold text-sm">Switch role</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["supplier", "retailer"] as const).map((r) =>
              roles.includes(r) ? (
                <Button
                  key={r}
                  variant={role === r ? "hero" : "outline"}
                  onClick={() => switchRole(r)}
                  className="capitalize"
                >
                  {role === r && <Check className="w-4 h-4 mr-1" />}
                  {r}
                </Button>
              ) : null,
            )}
          </div>
        </Card>
      )}

      {/* Add second role */}
      {missingRole && (
        <Card className="p-4 bg-primary/5 border-primary/30">
          <div className="font-semibold text-sm">Are you also a {missingRole}?</div>
          <div className="text-xs text-muted-foreground mt-1 mb-3">
            Add a {missingRole} profile to this same phone number and switch any time.
          </div>
          <Button variant="hero" size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Add {missingRole} profile
          </Button>
        </Card>
      )}

      <Button variant="outline" className="w-full" onClick={signOut}>
        <LogOut className="w-4 h-4" /> Sign out
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {missingRole} profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {missingRole === "retailer" && (
              <>
                <div className="space-y-2">
                  <Label>Shop name (optional)</Label>
                  <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Sharma Kirana" />
                </div>
                <div className="space-y-2">
                  <Label>Your supplier's phone</Label>
                  <div className="flex">
                    <div className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">+91</div>
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit number"
                      className="rounded-l-none"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    />
                  </div>
                </div>
              </>
            )}
            {missingRole === "supplier" && (
              <div className="space-y-2">
                <Label>Business name (optional)</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Sharma Wholesale" />
                <div className="text-xs text-muted-foreground">
                  Retailers will sign up using your phone number (+91 {profile?.phone}).
                </div>
              </div>
            )}
            <Button variant="hero" className="w-full" onClick={handleAddRole} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Add {missingRole} profile</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
