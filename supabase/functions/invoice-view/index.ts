import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv, error } = await admin.from("invoices")
      .select("id, invoice_number, total_amount, status, kind, finalized_at, created_at, retailer_id, supplier_id, pdf_url")
      .or(`short_code.eq.${code},invoice_number.eq.${code}`)
      .maybeSingle();

    if (error || !inv) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: supplier }, { data: retailer }, { data: items }] = await Promise.all([
      admin.from("profiles").select("name, shop_name, phone").eq("id", inv.supplier_id).maybeSingle(),
      admin.from("profiles").select("name, shop_name").eq("id", inv.retailer_id).maybeSingle(),
      admin.from("invoice_items").select("final_qty, price, product_id").eq("invoice_id", inv.id),
    ]);
    const productIds = (items ?? []).map((i: any) => i.product_id);
    const { data: products } = productIds.length
      ? await admin.from("products").select("id, name, unit").in("id", productIds)
      : { data: [] as any[] };
    const pmap = new Map((products ?? []).map((p: any) => [p.id, p]));

    // Fresh signed URL (1 hour)
    let pdfSigned: string | null = null;
    if (inv.pdf_url) {
      // pdf_url historically was a signed URL; the storage path is `${invoice_id}/invoice.pdf`
      const path = `${inv.id}/invoice.pdf`;
      const { data: signed } = await admin.storage.from("invoices").createSignedUrl(path, 3600);
      pdfSigned = signed?.signedUrl ?? null;
    }

    return new Response(JSON.stringify({
      invoice_number: inv.invoice_number,
      total_amount: Number(inv.total_amount),
      status: inv.status,
      kind: inv.kind,
      finalized_at: inv.finalized_at,
      created_at: inv.created_at,
      supplier: supplier ?? null,
      retailer: retailer ?? null,
      items: (items ?? []).map((it: any) => ({
        name: pmap.get(it.product_id)?.name ?? "Item",
        unit: pmap.get(it.product_id)?.unit ?? "pcs",
        qty: Number(it.final_qty),
        price: Number(it.price),
        total: Number(it.final_qty) * Number(it.price),
      })),
      pdf_url: pdfSigned,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
