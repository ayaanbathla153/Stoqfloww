
-- Re-grant EXECUTE on functions used inside RLS policies (must be callable by the executing role)
GRANT EXECUTE ON FUNCTION public.is_supplier_for_retailer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_linked_supplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
-- next_invoice_number is invoked by suppliers from the client
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;

-- Lock down search_path on trigger functions previously missing it
CREATE OR REPLACE FUNCTION public.prevent_final_invoice_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.kind = 'final' AND OLD.finalized_at IS NOT NULL THEN
      RAISE EXCEPTION 'Final invoice % is locked and cannot be deleted', OLD.invoice_number;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.kind = 'final' AND OLD.finalized_at IS NOT NULL THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.prevent_final_invoice_item_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
$function$;
