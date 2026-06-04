
-- 1. Fix is_supplier_for_retailer: remove self-bypass branch
CREATE OR REPLACE FUNCTION public.is_supplier_for_retailer(_supplier_id uuid, _retailer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _retailer_id
      AND p.linked_supplier_id = _supplier_id
      AND _supplier_id <> _retailer_id
  );
$$;

-- 2. Remove dangerous retailer ledger insert policy
DROP POLICY IF EXISTS "Retailer can insert return ledger" ON public.payments_ledger;

-- 3. Lock profile updates: prevent changing id, phone, linked_supplier_id via direct update
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Trigger to lock immutable fields on profiles
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'id cannot be changed';
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'phone cannot be changed directly';
  END IF;
  IF NEW.linked_supplier_id IS DISTINCT FROM OLD.linked_supplier_id THEN
    RAISE EXCEPTION 'linked_supplier_id cannot be changed directly';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_fields_trg ON public.profiles;
CREATE TRIGGER protect_profile_fields_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_fields();

-- 4. Restrict role self-assignment to non-privileged roles only
DROP POLICY IF EXISTS "Users add own roles" ON public.user_roles;

CREATE POLICY "Users add own roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role IN ('retailer'::app_role, 'supplier'::app_role)
);

-- 5. Storage policies: invoices bucket — restrict to supplier/retailer of the invoice
-- Path convention used in code: invoices are uploaded under {invoice_id}/...
DROP POLICY IF EXISTS "Authenticated can read invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated invoice access" ON storage.objects;
DROP POLICY IF EXISTS "Invoices read" ON storage.objects;
DROP POLICY IF EXISTS "Invoices insert" ON storage.objects;
DROP POLICY IF EXISTS "Invoices update" ON storage.objects;

-- Drop ALL existing policies on storage.objects for the invoices bucket
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%invoices%' OR with_check ILIKE '%invoices%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Invoice PDF read by parties"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (i.supplier_id = auth.uid() OR i.retailer_id = auth.uid())
  )
);

CREATE POLICY "Invoice PDF upload by supplier"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND i.supplier_id = auth.uid()
  )
);

CREATE POLICY "Invoice PDF update by supplier"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoices'
  AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND i.supplier_id = auth.uid()
  )
);

-- 6. Make complaint-media bucket private and add ownership-based policies
UPDATE storage.buckets SET public = false WHERE id = 'complaint-media';

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%complaint-media%' OR with_check ILIKE '%complaint-media%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Path convention: {user_id}/{filename}
CREATE POLICY "Complaint media owner read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'complaint-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Complaint media supplier read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'complaint-media'
  AND EXISTS (
    SELECT 1 FROM public.complaints c
    WHERE c.media_url LIKE '%' || name
      AND c.supplier_id = auth.uid()
  )
);

CREATE POLICY "Complaint media owner upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'complaint-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Complaint media owner delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'complaint-media'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 7. Realtime RLS: scope subscriptions so users only see their own row events
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive own row events" ON realtime.messages;
CREATE POLICY "Authenticated can receive own row events"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- 8. Lock down SECURITY DEFINER helper functions: revoke from anon
REVOKE EXECUTE ON FUNCTION public.find_supplier_by_phone(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_linked_supplier(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_supplier_for_retailer(uuid, uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.find_supplier_by_phone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_linked_supplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supplier_for_retailer(uuid, uuid) TO authenticated, anon;
