
-- 1. Restrict signup trigger to safe roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _supplier_id UUID;
BEGIN
  _role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('supplier','retailer')
      THEN (NEW.raw_user_meta_data->>'role')::app_role
    ELSE 'retailer'::app_role
  END;
  _supplier_id := NULLIF(NEW.raw_user_meta_data->>'linked_supplier_id', '')::UUID;

  INSERT INTO public.profiles (id, name, phone, linked_supplier_id, shop_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    _supplier_id,
    NEW.raw_user_meta_data->>'shop_name'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$function$;

-- 2. Tighten complaints policies
DROP POLICY IF EXISTS "Supplier updates complaints" ON public.complaints;
DROP POLICY IF EXISTS "Supplier views and updates complaints" ON public.complaints;

CREATE POLICY "Supplier views linked complaints"
ON public.complaints FOR SELECT TO authenticated
USING (supplier_id = auth.uid() AND public.is_supplier_for_retailer(supplier_id, retailer_id));

CREATE POLICY "Supplier updates linked complaints"
ON public.complaints FOR UPDATE TO authenticated
USING (supplier_id = auth.uid() AND public.is_supplier_for_retailer(supplier_id, retailer_id))
WITH CHECK (supplier_id = auth.uid() AND public.is_supplier_for_retailer(supplier_id, retailer_id));

-- 3. Restrict retailer invoice update to delivery-related fields only
DROP POLICY IF EXISTS "Retailer updates invoice delivery status" ON public.invoices;

CREATE POLICY "Retailer updates invoice delivery status"
ON public.invoices FOR UPDATE TO authenticated
USING (retailer_id = auth.uid())
WITH CHECK (
  retailer_id = auth.uid()
  AND supplier_id = (SELECT supplier_id FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND invoice_number = (SELECT invoice_number FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND total_amount = (SELECT total_amount FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND kind = (SELECT kind FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND finalized_at IS NOT DISTINCT FROM (SELECT finalized_at FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND short_code IS NOT DISTINCT FROM (SELECT short_code FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND order_id IS NOT DISTINCT FROM (SELECT order_id FROM public.invoices i2 WHERE i2.id = invoices.id)
  AND pdf_url IS NOT DISTINCT FROM (SELECT pdf_url FROM public.invoices i2 WHERE i2.id = invoices.id)
);

-- 4. Add DELETE policy for invoices bucket (supplier scoped via path prefix = invoice id, owner check via invoices table)
DROP POLICY IF EXISTS "Supplier deletes own invoice pdfs" ON storage.objects;
CREATE POLICY "Supplier deletes own invoice pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.supplier_id = auth.uid()
      AND (storage.foldername(name))[1] = i.id::text
  )
);

-- 5. Restrict realtime subscriptions: topic must contain caller's auth.uid()
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated can read all" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "Allow listening for authenticated users" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "authenticated can read messages" ON realtime.messages';
  END IF;
END $$;

CREATE POLICY "Realtime topic must include user id"
ON realtime.messages FOR SELECT TO authenticated
USING ( realtime.topic() LIKE '%' || auth.uid()::text || '%' );

-- 6. Revoke public EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_linked_supplier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_supplier_for_retailer(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(uuid) FROM PUBLIC, anon;
-- find_supplier_by_phone is called during signup (anon) — keep accessible
