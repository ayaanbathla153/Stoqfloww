import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { phoneToEmail, normalizePhone, digits10 } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Package, Loader2 } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // login
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPwd, setLoginPwd] = useState("");

  // signup
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pwd, setPwd] = useState("");
  const [shopName, setShopName] = useState("");
  const [role, setRole] = useState<"supplier" | "retailer">("supplier");
  const [supplierPhone, setSupplierPhone] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (digits10(loginPhone).length !== 10) return toast.error("Enter a valid 10-digit phone");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(loginPhone),
      password: loginPwd,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    navigate("/");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !pwd) return toast.error("Fill all required fields");
    if (digits10(phone).length !== 10) return toast.error("Enter a valid 10-digit phone");

    setLoading(true);
    let linkedSupplierId: string | undefined;

    if (role === "retailer") {
      if (digits10(supplierPhone).length !== 10) {
        setLoading(false);
        return toast.error("Enter your supplier's 10-digit phone");
      }
      const { data: supId, error: supErr } = await supabase
        .rpc("find_supplier_by_phone", { _phone: normalizePhone(supplierPhone) });
      if (supErr || !supId) {
        setLoading(false);
        return toast.error("Supplier not found. Ask them to sign up first.");
      }
      linkedSupplierId = supId as string;
    }

    const { error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: pwd,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          name,
          phone: normalizePhone(phone),
          role,
          shop_name: shopName,
          linked_supplier_id: linkedSupplierId,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Logging you in…");
    navigate("/");
  };

  const renderPhoneField = (id: string, value: string, onChange: (v: string) => void, required = true) => (
    <div className="flex">
      <div className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground select-none">
        +91
      </div>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        maxLength={10}
        placeholder="10-digit number"
        className="rounded-l-none"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        required={required}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary shadow-glow mb-4">
            <Package className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">StockFlow</h1>
          <p className="text-muted-foreground mt-1">Supplier & Retailer Management</p>
        </div>

        <Card className="p-6 bg-gradient-card shadow-elevated border-border/50">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lp">Phone number</Label>
                  {renderPhoneField("lp", loginPhone, setLoginPhone)}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lpw">Password</Label>
                  <Input id="lpw" type="password" value={loginPwd}
                    onChange={(e) => setLoginPwd(e.target.value)} required />
                </div>
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Log in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <RadioGroup value={role} onValueChange={(v) => setRole(v as any)} className="grid grid-cols-2 gap-2">
                  <Label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-smooth ${role === "supplier" ? "border-primary bg-primary/10" : "border-border"}`}>
                    <RadioGroupItem value="supplier" />
                    <span>Supplier</span>
                  </Label>
                  <Label className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-smooth ${role === "retailer" ? "border-primary bg-primary/10" : "border-border"}`}>
                    <RadioGroupItem value="retailer" />
                    <span>Retailer</span>
                  </Label>
                </RadioGroup>

                <div className="space-y-2">
                  <Label htmlFor="n">Your name</Label>
                  <Input id="n" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sn">{role === "supplier" ? "Business name" : "Shop name"}</Label>
                  <Input id="sn" value={shopName} onChange={(e) => setShopName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ph">Phone number</Label>
                  {renderPhoneField("ph", phone, setPhone)}
                </div>
                {role === "retailer" && (
                  <div className="space-y-2">
                    <Label htmlFor="sp">Your supplier's phone</Label>
                    {renderPhoneField("sp", supplierPhone, setSupplierPhone)}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="pw">Password</Label>
                  <Input id="pw" type="password" minLength={6} value={pwd}
                    onChange={(e) => setPwd(e.target.value)} required />
                </div>

                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
