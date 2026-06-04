
-- 1. New order status: 'confirmed' (between pending and invoiced)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'confirmed' BEFORE 'invoiced';

-- 2. Invoice metadata: kind (proforma/final), finalized lock, short_code for clean URLs
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS short_code text;

-- Constraint check
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_kind_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_kind_check CHECK (kind IN ('proforma','final'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_short_code_uidx ON public.invoices(short_code) WHERE short_code IS NOT NULL;

-- Backfill: existing invoices are 'final' and treated as finalized at creation
UPDATE public.invoices SET finalized_at = COALESCE(finalized_at, created_at) WHERE finalized_at IS NULL;
UPDATE public.invoices SET short_code = invoice_number WHERE short_code IS NULL;

-- 3. Per-supplier daily counter for human invoice numbers
CREATE TABLE IF NOT EXISTS public.invoice_counters (
  supplier_id uuid NOT NULL,
  day date NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (supplier_id, day)
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
-- No direct policies; only used via SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.next_invoice_number(_supplier uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _seq int;
BEGIN
  INSERT INTO public.invoice_counters(supplier_id, day, last_seq)
  VALUES (_supplier, _today, 1)
  ON CONFLICT (supplier_id, day)
  DO UPDATE SET last_seq = public.invoice_counters.last_seq + 1
  RETURNING last_seq INTO _seq;

  RETURN 'INV-' || to_char(_today, 'YYYYMMDD') || '-' || lpad(_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;

-- 4. Immutability triggers — finalized invoices and their items can't be edited
CREATE OR REPLACE FUNCTION public.prevent_final_invoice_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind = 'final' AND OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Final invoice % is locked and cannot be deleted', OLD.invoice_number;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.kind = 'final' AND OLD.finalized_at IS NOT NULL THEN
    -- Allow only delivery-related and pdf_url updates after finalization
    IF NEW.invoice_number    IS DISTINCT FROM OLD.invoice_number   OR
       NEW.total_amount      IS DISTINCT FROM OLD.total_amount     OR
       NEW.retailer_id       IS DISTINCT FROM OLD.retailer_id      OR
       NEW.supplier_id       IS DISTINCT FROM OLD.supplier_id      OR
       NEW.order_id          IS DISTINCT FROM OLD.order_id         OR
       NEW.kind              IS DISTINCT FROM OLD.kind             OR
       NEW.finalized_at      IS DISTINCT FROM OLD.finalized_at     OR
       NEW.short_code        IS DISTINCT FROM OLD.short_code       OR
       NEW.created_at        IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Final invoice % is locked. Only delivery status & pdf_url may change.', OLD.invoice_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_final_invoice ON public.invoices;
CREATE TRIGGER trg_lock_final_invoice
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_final_invoice_edit();

CREATE OR REPLACE FUNCTION public.prevent_final_invoice_item_edit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  _locked boolean;
  _inv uuid;
BEGIN
  _inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT (kind = 'final' AND finalized_at IS NOT NULL) INTO _locked
    FROM public.invoices WHERE id = _inv;
  IF _locked THEN
    RAISE EXCEPTION 'Cannot modify items of a finalized invoice';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_final_invoice_items ON public.invoice_items;
CREATE TRIGGER trg_lock_final_invoice_items
  BEFORE UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_final_invoice_item_edit();
