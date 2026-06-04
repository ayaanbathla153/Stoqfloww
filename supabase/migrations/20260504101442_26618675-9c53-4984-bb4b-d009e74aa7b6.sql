-- Make is_supplier_for_retailer SECURITY DEFINER so RLS on profiles doesn't break order insert checks
CREATE OR REPLACE FUNCTION public.is_supplier_for_retailer(_supplier_id uuid, _retailer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _retailer_id
      AND p.linked_supplier_id = _supplier_id
      AND _supplier_id <> _retailer_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_supplier_for_retailer(uuid, uuid) TO authenticated;