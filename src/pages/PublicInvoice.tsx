import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2, ShieldCheck, AlertCircle } from "lucide-react";

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/invoice-view`;

export default function PublicInvoice() {
  const { code } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?code=${encodeURIComponent(code!)}`);
        if (!res.ok) throw new Error((await res.json()).error ?? "Not found");
        setData(await res.json());
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [code]);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (error || !data) return (
    <div className="min-h-screen grid place-items-center p-6">
      <Card className="p-6 text-center max-w-sm">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-destructive" />
        <div className="font-semibold">Invoice not found</div>
        <div className="text-sm text-muted-foreground mt-1">{error}</div>
        <Button asChild variant="outline" className="mt-4"><Link to="/">Go home</Link></Button>
      </Card>
    </div>
  );

  const isFinal = data.kind === "final";
  return (
    <div className="min-h-screen bg-background p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2 pt-4">
        <FileText className="w-5 h-5 text-primary" />
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{isFinal ? "Final Invoice" : "Proforma · Estimate"}</div>
          <div className="font-bold text-lg">{data.invoice_number}</div>
        </div>
        {isFinal && <ShieldCheck className="w-4 h-4 text-success ml-auto" aria-label="Locked" />}
      </div>

      <Card className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">From</div>
        <div className="font-semibold">{data.supplier?.shop_name || data.supplier?.name}</div>
        <div className="text-xs text-muted-foreground">+91 {data.supplier?.phone}</div>
        <div className="border-t my-2" />
        <div className="text-xs text-muted-foreground">To</div>
        <div className="font-semibold">{data.retailer?.shop_name || data.retailer?.name}</div>
      </Card>

      <Card className="p-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Items</div>
        <div className="space-y-2">
          {data.items.map((it: any, i: number) => (
            <div key={i} className="flex justify-between text-sm">
              <div className="min-w-0">
                <div className="truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground">{it.qty} {it.unit} × ₹{it.price}</div>
              </div>
              <div className="font-medium">₹{it.total.toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t mt-3 pt-3">
          <div className="font-semibold">Total</div>
          <div className="font-bold text-lg">₹{Number(data.total_amount).toLocaleString()}</div>
        </div>
      </Card>

      {data.pdf_url && (
        <Button asChild variant="hero" className="w-full" size="lg">
          <a href={data.pdf_url} target="_blank" rel="noreferrer" download>
            <Download className="w-4 h-4" /> Download PDF
          </a>
        </Button>
      )}

      <p className="text-[11px] text-center text-muted-foreground pt-2">
        {isFinal ? "This is a final, locked invoice." : "Proforma — not a tax invoice. Final invoice will be issued after confirmation."}
      </p>
    </div>
  );
}
