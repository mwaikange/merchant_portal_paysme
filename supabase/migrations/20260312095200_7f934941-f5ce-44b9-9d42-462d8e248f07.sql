
-- Create a function that sends a welcome email via the edge function using pg_net
CREATE OR REPLACE FUNCTION public.send_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Call the send-email edge function via pg_net
  PERFORM net.http_post(
    url := 'https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', 'welcome',
      'merchant_id', NEW.merchant_id::text
    )
  );
  RETURN NEW;
END;
$$;

-- Create trigger on merchants table for new inserts
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON public.merchants;
CREATE TRIGGER trigger_send_welcome_email
  AFTER INSERT ON public.merchants
  FOR EACH ROW
  EXECUTE FUNCTION public.send_welcome_email();
