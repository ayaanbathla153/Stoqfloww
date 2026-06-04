CREATE OR REPLACE FUNCTION public.is_supplier_for_retailer(_supplier_id uuid, _retailer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _retailer_id
      AND (p.linked_supplier_id = _supplier_id OR p.id = _supplier_id)
  );
$$;