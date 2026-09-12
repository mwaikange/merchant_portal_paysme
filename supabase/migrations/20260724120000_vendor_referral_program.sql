-- Vendor referral programme and database-owned Vendor token top-up discounts.
-- A referrer earns one permanent 1% bonus after five confirmed vendors from
-- different towns each accumulate at least N$500 in settled token top-ups.

CREATE TABLE IF NOT EXISTS public.namibian_towns (
  name text PRIMARY KEY,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.namibian_towns (name) VALUES
  ('Aminuis'), ('Arandis'), ('Aranos'), ('Aroab'), ('Aus'), ('Berseba'),
  ('Bethanie'), ('Bukalo'), ('Divundu'), ('Dordabis'), ('Eenhana'), ('Engela'),
  ('Epupa'), ('Gibeon'), ('Gobabis'), ('Gochas'), ('Groot Aub'), ('Grootfontein'),
  ('Grünau'), ('Helao Nafidi'), ('Henties Bay'), ('Kalkfeld'), ('Kalkrand'),
  ('Kamanjab'), ('Karasburg'), ('Karibib'), ('Katima Mulilo'), ('Keetmanshoop'),
  ('Khorixas'), ('Koës'), ('Kongola'), ('Leonardville'), ('Linyanti'),
  ('Lüderitz'), ('Maltahöhe'), ('Mariental'), ('Nkurenkuru'), ('Noordoewer'),
  ('Ohangwena'), ('Okahandja'), ('Okahao'), ('Okakarara'), ('Okalongo'),
  ('Okongo'), ('Omaruru'), ('Omuthiya'), ('Onayena'), ('Ondangwa'),
  ('Ongwediva'), ('Oniipa'), ('Opuwo'), ('Oranjemund'), ('Oshakati'),
  ('Oshikango'), ('Oshikuku'), ('Otavi'), ('Otjinene'), ('Otjiwarongo'),
  ('Outapi'), ('Outjo'), ('Rehoboth'), ('Ruacana'), ('Rundu'), ('Sesfontein'),
  ('Stampriet'), ('Swakopmund'), ('Tsandi'), ('Tses'), ('Tsumeb'), ('Tsumkwe'),
  ('Uis'), ('Usakos'), ('Walvis Bay'), ('Warmbad'), ('Windhoek'), ('Witvlei')
ON CONFLICT (name) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_namibian_towns_lower_name
  ON public.namibian_towns (lower(name));

CREATE TABLE IF NOT EXISTS public.vendor_discount_programs (
  program_key text PRIMARY KEY,
  base_topup_discount_rate numeric(6,5) NOT NULL
    CHECK (base_topup_discount_rate >= 0 AND base_topup_discount_rate <= 1),
  referral_bonus_rate numeric(6,5) NOT NULL
    CHECK (referral_bonus_rate >= 0 AND referral_bonus_rate <= 1),
  required_qualifying_referrals integer NOT NULL
    CHECK (required_qualifying_referrals > 0),
  minimum_referred_topup_total numeric(12,2) NOT NULL
    CHECK (minimum_referred_topup_total > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.vendor_discount_programs (
  program_key,
  base_topup_discount_rate,
  referral_bonus_rate,
  required_qualifying_referrals,
  minimum_referred_topup_total,
  is_active
) VALUES ('vendor_topup', 0.05, 0.01, 5, 500.00, true)
ON CONFLICT (program_key) DO NOTHING;

ALTER TABLE public.vendor_topup_credits
  ADD COLUMN IF NOT EXISTS discount_rate_applied numeric(6,5)
    CHECK (discount_rate_applied >= 0 AND discount_rate_applied <= 1);

ALTER TABLE public.vendor_payment_obligations
  ADD COLUMN IF NOT EXISTS discount_rate numeric(6,5)
    CHECK (discount_rate >= 0 AND discount_rate <= 1);

UPDATE public.vendor_topup_credits
SET discount_rate_applied = CASE
  WHEN amount_requested > 0
    THEN round((COALESCE(discount_applied, 0) / amount_requested)::numeric, 5)
  ELSE 0
END
WHERE discount_rate_applied IS NULL;

UPDATE public.vendor_payment_obligations
SET discount_rate = CASE
  WHEN requested_amount > 0
    THEN round((COALESCE(discount_amount, 0) / requested_amount)::numeric, 5)
  ELSE 0
END
WHERE purpose = 'vendor_token_topup'
  AND discount_rate IS NULL;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS town text REFERENCES public.namibian_towns(name),
  ADD COLUMN IF NOT EXISTS referral_code varchar(6),
  ADD COLUMN IF NOT EXISTS referred_by_vendor_id uuid
    REFERENCES public.vendors(vendor_id) ON DELETE SET NULL;

ALTER TABLE public.vendors
  DROP CONSTRAINT IF EXISTS vendors_referral_code_format_check;
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_referral_code_format_check
  CHECK (referral_code IS NULL OR referral_code ~ '^[0-9]{6}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_referral_code
  ON public.vendors(referral_code)
  WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_referred_by
  ON public.vendors(referred_by_vendor_id)
  WHERE referred_by_vendor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_vendor_referral_code()
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate varchar(6);
BEGIN
  FOR attempt IN 1..100 LOOP
    candidate := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.vendors WHERE referral_code = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Could not generate a unique vendor referral code';
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_vendor_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := public.generate_vendor_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_vendor_referral_code ON public.vendors;
CREATE TRIGGER assign_vendor_referral_code
BEFORE INSERT ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.assign_vendor_referral_code();

DO $$
DECLARE
  vendor_row record;
BEGIN
  FOR vendor_row IN
    SELECT vendor_id FROM public.vendors
    WHERE referral_code IS NULL
    ORDER BY created_at, vendor_id
  LOOP
    UPDATE public.vendors
    SET referral_code = public.generate_vendor_referral_code()
    WHERE vendor_id = vendor_row.vendor_id;
  END LOOP;
END;
$$;

ALTER TABLE public.vendors
  ALTER COLUMN referral_code SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendor_referrals (
  referral_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_vendor_id uuid NOT NULL
    REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  referred_vendor_id uuid NOT NULL UNIQUE
    REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  referrer_town text NOT NULL REFERENCES public.namibian_towns(name),
  referred_town text NOT NULL REFERENCES public.namibian_towns(name),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'same_town', 'qualified')),
  qualified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_vendor_id <> referred_vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_referrals_referrer_status
  ON public.vendor_referrals(referrer_vendor_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.vendor_referral_rewards (
  vendor_id uuid PRIMARY KEY REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  bonus_discount_rate numeric(6,5) NOT NULL
    CHECK (bonus_discount_rate > 0 AND bonus_discount_rate <= 1),
  qualifying_referral_count integer NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.create_vendor_referral_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_town_value text;
BEGIN
  IF NEW.referred_by_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT town INTO referrer_town_value
  FROM public.vendors
  WHERE vendor_id = NEW.referred_by_vendor_id;

  IF referrer_town_value IS NULL OR NEW.town IS NULL THEN
    RAISE EXCEPTION 'Both vendors must have a registered town for a referral';
  END IF;

  INSERT INTO public.vendor_referrals (
    referrer_vendor_id,
    referred_vendor_id,
    referrer_town,
    referred_town,
    status
  ) VALUES (
    NEW.referred_by_vendor_id,
    NEW.vendor_id,
    referrer_town_value,
    NEW.town,
    CASE
      WHEN lower(referrer_town_value) = lower(NEW.town) THEN 'same_town'
      ELSE 'pending'
    END
  )
  ON CONFLICT (referred_vendor_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_vendor_referral_record ON public.vendors;
CREATE TRIGGER create_vendor_referral_record
AFTER INSERT ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.create_vendor_referral_record();

CREATE OR REPLACE FUNCTION public.refresh_vendor_referral_qualification(
  p_referred_vendor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referral_row public.vendor_referrals%ROWTYPE;
  programme public.vendor_discount_programs%ROWTYPE;
  cumulative_topups numeric(12,2);
  qualifying_count integer;
  referred_confirmed boolean;
BEGIN
  SELECT * INTO referral_row
  FROM public.vendor_referrals
  WHERE referred_vendor_id = p_referred_vendor_id
  FOR UPDATE;

  IF NOT FOUND OR referral_row.status = 'same_town' THEN
    RETURN;
  END IF;

  -- Serialize milestone evaluation per referrer so two referred vendors
  -- settling concurrently cannot both miss the fifth qualifying referral.
  PERFORM 1
  FROM public.vendors
  WHERE vendor_id = referral_row.referrer_vendor_id
  FOR UPDATE;

  SELECT * INTO programme
  FROM public.vendor_discount_programs
  WHERE program_key = 'vendor_topup'
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(registration_confirmed, false)
  INTO referred_confirmed
  FROM public.vendors
  WHERE vendor_id = p_referred_vendor_id;

  SELECT COALESCE(sum(amount_credited), 0)
  INTO cumulative_topups
  FROM public.vendor_topup_credits
  WHERE vendor_id = p_referred_vendor_id
    AND status = 'completed';

  IF referred_confirmed
     AND cumulative_topups >= programme.minimum_referred_topup_total
     AND referral_row.status <> 'qualified' THEN
    UPDATE public.vendor_referrals
    SET status = 'qualified',
        qualified_at = now(),
        updated_at = now()
    WHERE referral_id = referral_row.referral_id;
  END IF;

  SELECT count(*)::integer
  INTO qualifying_count
  FROM public.vendor_referrals
  WHERE referrer_vendor_id = referral_row.referrer_vendor_id
    AND status = 'qualified';

  IF qualifying_count >= programme.required_qualifying_referrals THEN
    INSERT INTO public.vendor_referral_rewards (
      vendor_id,
      bonus_discount_rate,
      qualifying_referral_count,
      status
    ) VALUES (
      referral_row.referrer_vendor_id,
      programme.referral_bonus_rate,
      qualifying_count,
      'active'
    )
    ON CONFLICT (vendor_id) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_vendor_referral_after_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM public.refresh_vendor_referral_qualification(NEW.vendor_id);
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'completed'
        AND (
          OLD.status IS DISTINCT FROM NEW.status
          OR OLD.amount_credited IS DISTINCT FROM NEW.amount_credited
        ) THEN
    PERFORM public.refresh_vendor_referral_qualification(NEW.vendor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_vendor_referral_after_topup
  ON public.vendor_topup_credits;
CREATE TRIGGER refresh_vendor_referral_after_topup
AFTER INSERT OR UPDATE ON public.vendor_topup_credits
FOR EACH ROW EXECUTE FUNCTION public.refresh_vendor_referral_after_topup();

CREATE OR REPLACE FUNCTION public.effective_vendor_topup_discount_rate(
  p_vendor_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round((
    programme.base_topup_discount_rate
    + COALESCE((
      SELECT reward.bonus_discount_rate
      FROM public.vendor_referral_rewards reward
      WHERE reward.vendor_id = p_vendor_id
        AND reward.status = 'active'
    ), 0)
  )::numeric, 5)
  FROM public.vendor_discount_programs programme
  WHERE programme.program_key = 'vendor_topup'
    AND programme.is_active = true
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_referral_progress()
RETURNS TABLE (
  referral_code text,
  town text,
  qualifying_referrals integer,
  required_referrals integer,
  bonus_active boolean,
  base_discount_rate numeric,
  referral_bonus_rate numeric,
  effective_discount_rate numeric,
  minimum_topup_amount numeric,
  referrals jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_vendor public.vendors%ROWTYPE;
  programme public.vendor_discount_programs%ROWTYPE;
  reward_bonus_rate numeric := 0;
  reward_is_active boolean := false;
  qualifying_count_value integer := 0;
  referral_list jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO current_vendor
  FROM public.vendors
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated vendor was not found';
  END IF;

  SELECT * INTO programme
  FROM public.vendor_discount_programs
  WHERE program_key = 'vendor_topup'
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vendor discount programme is not configured';
  END IF;

  SELECT bonus_discount_rate INTO reward_bonus_rate
  FROM public.vendor_referral_rewards
  WHERE vendor_id = current_vendor.vendor_id
    AND status = 'active';
  reward_is_active := FOUND;
  reward_bonus_rate := COALESCE(reward_bonus_rate, 0);

  SELECT count(*)::integer
  INTO qualifying_count_value
  FROM public.vendor_referrals
  WHERE referrer_vendor_id = current_vendor.vendor_id
    AND status = 'qualified';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'town', referral.referred_town,
        'registered_at', to_char(referred.created_at AT TIME ZONE 'Africa/Windhoek', 'YYYY-MM-DD'),
        'qualifies', referral.status = 'qualified',
        'status', referral.status
      )
      ORDER BY referral.created_at
    ),
    '[]'::jsonb
  )
  INTO referral_list
  FROM public.vendor_referrals referral
  JOIN public.vendors referred
    ON referred.vendor_id = referral.referred_vendor_id
   AND referred.registration_confirmed = true
  WHERE referral.referrer_vendor_id = current_vendor.vendor_id;

  RETURN QUERY SELECT
    current_vendor.referral_code::text,
    current_vendor.town,
    qualifying_count_value,
    programme.required_qualifying_referrals,
    reward_is_active,
    programme.base_topup_discount_rate,
    programme.referral_bonus_rate,
    round((programme.base_topup_discount_rate + reward_bonus_rate)::numeric, 5),
    programme.minimum_referred_topup_total,
    referral_list;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_vendor_referral_town(p_town text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical_town text;
  current_town text;
BEGIN
  SELECT name INTO canonical_town
  FROM public.namibian_towns
  WHERE lower(name) = lower(trim(p_town))
    AND is_active = true;

  IF canonical_town IS NULL THEN
    RAISE EXCEPTION 'Select a valid Namibian town';
  END IF;

  SELECT town INTO current_town
  FROM public.vendors
  WHERE auth_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated vendor was not found';
  END IF;

  IF current_town IS NOT NULL AND current_town <> canonical_town THEN
    RAISE EXCEPTION 'Your registered town can only be changed by PaySME support';
  END IF;

  UPDATE public.vendors
  SET town = canonical_town,
      updated_at = now()
  WHERE auth_user_id = auth.uid();

  RETURN canonical_town;
END;
$$;

ALTER TABLE public.namibian_towns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_discount_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages Namibian towns"
  ON public.namibian_towns;
CREATE POLICY "Service role manages Namibian towns"
  ON public.namibian_towns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages vendor discount programmes"
  ON public.vendor_discount_programs;
CREATE POLICY "Service role manages vendor discount programmes"
  ON public.vendor_discount_programs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages vendor referrals"
  ON public.vendor_referrals;
CREATE POLICY "Service role manages vendor referrals"
  ON public.vendor_referrals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages vendor referral rewards"
  ON public.vendor_referral_rewards;
CREATE POLICY "Service role manages vendor referral rewards"
  ON public.vendor_referral_rewards FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.generate_vendor_referral_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_vendor_referral_qualification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.effective_vendor_topup_discount_rate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vendor_referral_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vendor_referral_town(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_vendor_topup_discount_rate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_referral_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_vendor_referral_town(text) TO authenticated;
