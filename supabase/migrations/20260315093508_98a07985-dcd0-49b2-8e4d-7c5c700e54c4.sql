
-- Step 1: Fix the CHECK constraint to allow 'cancelled'
ALTER TABLE public.transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check 
  CHECK (status IN ('pending', 'paid', 'expired', 'cancelled'));

-- Step 2: Update trigger to allow pending -> cancelled
CREATE OR REPLACE FUNCTION public.enforce_transaction_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if TG_OP = 'INSERT' then
    new.finalized := false;
    return new;
  end if;

  if TG_OP = 'UPDATE' then
    if old.status = 'pending' and new.status = 'paid' then
      if new.date_paid is null then
        new.date_paid := now();
      end if;
      new.finalized := true;
      return new;
    elsif old.status = 'pending' and new.status = 'expired' then
      if new.date_paid is null then
        new.date_paid := now();
      end if;
      new.finalized := false;
      return new;
    elsif old.status = 'pending' and new.status = 'cancelled' then
      new.finalized := true;
      return new;
    elsif old.status = new.status then
      return new;
    else
      raise exception 'Invalid status change: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$function$;
