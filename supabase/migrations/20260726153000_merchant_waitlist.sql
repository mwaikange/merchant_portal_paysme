-- Public merchant launch waitlist. Submissions are accepted only through the
-- merchant-waitlist Edge Function; raw rows are never exposed to anonymous users.

CREATE TABLE public.merchant_waitlist (
  waitlist_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_person_name varchar(160) NOT NULL,
  company_name varchar(180) NOT NULL,
  industry varchar(140) NOT NULL,
  town varchar(120) NOT NULL,
  email varchar(254) NOT NULL,
  mobile varchar(32),
  status varchar(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'invited', 'joined', 'declined')),
  source_ip_hash varchar(64),
  notification_status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed')),
  notification_sent_at timestamptz,
  notification_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX merchant_waitlist_email_unique
  ON public.merchant_waitlist (lower(email));

CREATE INDEX merchant_waitlist_created_at_idx
  ON public.merchant_waitlist (created_at DESC);

CREATE INDEX merchant_waitlist_source_ip_recent_idx
  ON public.merchant_waitlist (source_ip_hash, created_at DESC)
  WHERE source_ip_hash IS NOT NULL;

ALTER TABLE public.merchant_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages merchant waitlist"
  ON public.merchant_waitlist
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER trg_merchant_waitlist_updated_at
BEFORE UPDATE ON public.merchant_waitlist
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
