-- SMS credits belong to a merchant's own SMSPortal account. A merchant without
-- an SMS client ID must never display or retain a synthetic/local balance.

UPDATE public.merchants
SET sms_credits = 0
WHERE NULLIF(BTRIM(sms_client_id), '') IS NULL
  AND COALESCE(sms_credits, 0) <> 0;

CREATE OR REPLACE FUNCTION public.clear_sms_credits_without_client_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NULLIF(BTRIM(NEW.sms_client_id), '') IS NULL THEN
    NEW.sms_credits := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_sms_credits_without_client_id ON public.merchants;
CREATE TRIGGER trg_clear_sms_credits_without_client_id
BEFORE INSERT OR UPDATE OF sms_client_id, sms_credits ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.clear_sms_credits_without_client_id();

COMMENT ON FUNCTION public.clear_sms_credits_without_client_id() IS
  'Prevents local SMS credit values when a merchant has no SMSPortal client ID.';
