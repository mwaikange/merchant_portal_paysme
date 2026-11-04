-- Closed test checkouts may be finalized as cancelled/expired; they still
-- cannot acquire a paid status, paid amount, or lose their immutable test tag.
CREATE OR REPLACE FUNCTION public.protect_test_transaction() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.is_test AND (NOT NEW.is_test OR NEW.test_session_id IS DISTINCT FROM OLD.test_session_id OR NEW.test_provider IS DISTINCT FROM OLD.test_provider) THEN RAISE EXCEPTION 'Test checkouts cannot be promoted to live'; END IF;
 END IF;
 IF NEW.is_test AND (NEW.status='paid' OR coalesce(NEW.amount_paid,0)>0) THEN RAISE EXCEPTION 'Test checkouts cannot settle live payments'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_test_transaction() FROM PUBLIC,anon,authenticated;
