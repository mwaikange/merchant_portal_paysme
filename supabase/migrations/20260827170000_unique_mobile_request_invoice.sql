-- A merchant invoice/reference represents one Request-to-Pay obligation.
-- Repeated app clicks must reuse the same pending transaction and PaySME code.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_request_to_pay_merchant_invoice_unique_idx
  ON public.mobile_request_to_pay (merchant_id, invoice_id);
