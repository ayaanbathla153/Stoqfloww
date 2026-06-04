-- Add return flow fields to complaints
DO $$ BEGIN
  CREATE TYPE complaint_type AS ENUM ('defect', 'return');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS type complaint_type NOT NULL DEFAULT 'defect',
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS reason text;

-- Allow retailers to update their own retailer_inventory (self stock management)
DROP POLICY IF EXISTS "Retailer manages own inventory" ON public.retailer_inventory;
CREATE POLICY "Retailer manages own inventory"
  ON public.retailer_inventory
  FOR ALL
  TO authenticated
  USING (retailer_id = auth.uid())
  WITH CHECK (retailer_id = auth.uid());

-- Allow retailers to insert ledger entries for returns (credit)
DROP POLICY IF EXISTS "Retailer can insert return ledger" ON public.payments_ledger;
CREATE POLICY "Retailer can insert return ledger"
  ON public.payments_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (retailer_id = auth.uid());