-- Authenticate pg_cron -> process-scheduled-sms without exposing a service key.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.secrets
    WHERE name = 'scheduled_sms_cron_secret'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'scheduled_sms_cron_secret',
      'Authenticates the scheduled SMS pg_cron worker'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_scheduled_sms_cron_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT
    COALESCE(p_secret, '') <> ''
    AND EXISTS (
      SELECT 1
      FROM vault.decrypted_secrets
      WHERE name = 'scheduled_sms_cron_secret'
        AND decrypted_secret = p_secret
    );
$$;

REVOKE ALL ON FUNCTION public.verify_scheduled_sms_cron_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_scheduled_sms_cron_secret(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.process_due_bulk_scheduled_sms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_cron_secret TEXT;
  v_auth_headers JSONB;
BEGIN
  SELECT decrypted_secret
  INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'scheduled_sms_cron_secret';

  IF COALESCE(v_cron_secret, '') = '' THEN
    RAISE EXCEPTION 'scheduled_sms_cron_secret is missing from Vault';
  END IF;

  v_auth_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-scheduled-sms-secret', v_cron_secret
  );

  PERFORM net.http_post(
    url := 'https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/process-scheduled-sms',
    headers := v_auth_headers,
    body := jsonb_build_object('limit', 500)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_due_bulk_scheduled_sms() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid
  INTO v_jobid
  FROM cron.job
  WHERE jobname = 'process-due-bulk-scheduled-sms';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;

  PERFORM cron.schedule(
    'process-due-bulk-scheduled-sms',
    '*/5 * * * *',
    $cron$SELECT public.process_due_bulk_scheduled_sms();$cron$
  );
END;
$$;
