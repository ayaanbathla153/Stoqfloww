CREATE OR REPLACE FUNCTION public.find_supplier_by_phone(_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.id
  WHERE p.phone = _phone AND r.role = 'supplier'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_supplier_by_phone(text) TO anon, authenticated;