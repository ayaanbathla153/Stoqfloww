DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_supplier_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_supplier_id_profiles_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_retailer_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_retailer_id_profiles_fkey
      FOREIGN KEY (retailer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_created_by_profiles_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_created_by_profiles_fkey
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_orders_fkey'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_order_id_orders_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_products_fkey'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_product_id_products_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_order_id_orders_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_order_id_orders_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_supplier_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_supplier_id_profiles_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_retailer_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_retailer_id_profiles_fkey
      FOREIGN KEY (retailer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_invoice_id_invoices_fkey'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_invoice_id_invoices_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_items_product_id_products_fkey'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_product_id_products_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_ledger_supplier_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.payments_ledger
      ADD CONSTRAINT payments_ledger_supplier_id_profiles_fkey
      FOREIGN KEY (supplier_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_ledger_retailer_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.payments_ledger
      ADD CONSTRAINT payments_ledger_retailer_id_profiles_fkey
      FOREIGN KEY (retailer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_ledger_reference_invoice_id_invoices_fkey'
  ) THEN
    ALTER TABLE public.payments_ledger
      ADD CONSTRAINT payments_ledger_reference_invoice_id_invoices_fkey
      FOREIGN KEY (reference_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
  END IF;
END $$;