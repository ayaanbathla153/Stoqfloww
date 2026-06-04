CREATE OR REPLACE FUNCTION public.is_supplier_for_retailer(_supplier_id uuid, _retailer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _retailer_id
      AND (p.linked_supplier_id = _supplier_id OR p.id = _supplier_id)
  );
$$;

DROP POLICY IF EXISTS "Retailer creates own orders" ON public.orders;
DROP POLICY IF EXISTS "Supplier creates orders for retailers" ON public.orders;
DROP POLICY IF EXISTS "Retailer views own orders" ON public.orders;
DROP POLICY IF EXISTS "Supplier views their orders" ON public.orders;
DROP POLICY IF EXISTS "Supplier updates orders" ON public.orders;
DROP POLICY IF EXISTS "Supplier deletes orders" ON public.orders;

CREATE POLICY "Retailer creates own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  retailer_id = auth.uid()
  AND created_by = auth.uid()
  AND public.is_supplier_for_retailer(supplier_id, retailer_id)
);

CREATE POLICY "Supplier creates linked retailer orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  supplier_id = auth.uid()
  AND created_by = auth.uid()
  AND public.is_supplier_for_retailer(supplier_id, retailer_id)
);

CREATE POLICY "Retailer views own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (retailer_id = auth.uid());

CREATE POLICY "Supplier views linked retailer orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  supplier_id = auth.uid()
  AND public.is_supplier_for_retailer(supplier_id, retailer_id)
);

CREATE POLICY "Supplier updates linked retailer orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  supplier_id = auth.uid()
  AND public.is_supplier_for_retailer(supplier_id, retailer_id)
);

CREATE POLICY "Supplier deletes linked retailer orders"
ON public.orders
FOR DELETE
TO authenticated
USING (
  supplier_id = auth.uid()
  AND public.is_supplier_for_retailer(supplier_id, retailer_id)
);

DROP POLICY IF EXISTS "Insert order items via parent order" ON public.order_items;
DROP POLICY IF EXISTS "Supplier updates order items" ON public.order_items;
DROP POLICY IF EXISTS "Supplier deletes order items" ON public.order_items;
DROP POLICY IF EXISTS "View order items via parent order" ON public.order_items;

CREATE POLICY "Insert order items via linked parent order"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.retailer_id = auth.uid()
        OR (o.supplier_id = auth.uid() AND public.is_supplier_for_retailer(o.supplier_id, o.retailer_id))
      )
  )
);

CREATE POLICY "Supplier updates linked order items"
ON public.order_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.supplier_id = auth.uid()
      AND public.is_supplier_for_retailer(o.supplier_id, o.retailer_id)
  )
);

CREATE POLICY "Supplier deletes linked order items"
ON public.order_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.supplier_id = auth.uid()
      AND public.is_supplier_for_retailer(o.supplier_id, o.retailer_id)
  )
);

CREATE POLICY "View order items via linked parent order"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.retailer_id = auth.uid()
        OR (o.supplier_id = auth.uid() AND public.is_supplier_for_retailer(o.supplier_id, o.retailer_id))
      )
  )
);