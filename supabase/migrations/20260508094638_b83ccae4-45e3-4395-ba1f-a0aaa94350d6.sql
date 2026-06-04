
-- Stock verification snapshots + intelligence columns

ALTER TABLE public.retailer_inventory
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_qty numeric,
  ADD COLUMN IF NOT EXISTS avg_daily_sales numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.stock_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  opening_stock numeric NOT NULL DEFAULT 0,
  delivered_qty numeric NOT NULL DEFAULT 0,
  returned_qty numeric NOT NULL DEFAULT 0,
  closing_stock numeric NOT NULL DEFAULT 0,
  estimated_sales numeric GENERATED ALWAYS AS
    (GREATEST(opening_stock + delivered_qty - returned_qty - closing_stock, 0)) STORED,
  cycle_days integer NOT NULL DEFAULT 0,
  avg_daily_sales numeric NOT NULL DEFAULT 0,
  anomaly text,
  note text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sv_retailer_product_time
  ON public.stock_verifications (retailer_id, product_id, verified_at DESC);
CREATE INDEX IF NOT EXISTS idx_sv_supplier_time
  ON public.stock_verifications (supplier_id, verified_at DESC);

ALTER TABLE public.stock_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supplier manages stock verifications"
  ON public.stock_verifications FOR ALL
  TO authenticated
  USING (supplier_id = auth.uid())
  WITH CHECK (supplier_id = auth.uid() AND verified_by = auth.uid());

CREATE POLICY "Retailer views own stock verifications"
  ON public.stock_verifications FOR SELECT
  TO authenticated
  USING (retailer_id = auth.uid());

-- Future-ready stub
CREATE TABLE IF NOT EXISTS public.refill_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  predicted_refill_date date,
  confidence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (retailer_id, product_id)
);

ALTER TABLE public.refill_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supplier manages refill predictions"
  ON public.refill_predictions FOR ALL
  TO authenticated
  USING (supplier_id = auth.uid())
  WITH CHECK (supplier_id = auth.uid());

CREATE POLICY "Retailer views own refill predictions"
  ON public.refill_predictions FOR SELECT
  TO authenticated
  USING (retailer_id = auth.uid());
