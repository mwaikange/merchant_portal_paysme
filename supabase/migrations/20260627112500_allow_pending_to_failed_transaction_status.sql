-- Allow failed card/facilitator attempts to be finalized as failed.
-- The status check allows "failed", but this trigger also has to allow
-- pending -> failed transitions.
create or replace function public.enforce_transaction_status()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    new.finalized := coalesce(new.finalized, false);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'pending' and new.status = 'paid' then
      if new.date_paid is null then
        new.date_paid := now();
      end if;
      new.finalized := true;
      return new;

    elsif old.status = 'pending' and new.status = 'failed' then
      new.date_paid := null;
      new.amount_paid := null;
      new.finalized := false;
      return new;

    elsif old.status = 'pending' and new.status = 'expired' then
      if new.date_paid is null then
        new.date_paid := now();
      end if;
      new.finalized := true;
      return new;

    elsif old.status = 'pending' and new.status = 'cancelled' then
      if new.date_paid is null then
        new.date_paid := now();
      end if;
      new.finalized := true;
      return new;

    elsif old.status = new.status then
      return new;

    else
      raise exception 'Invalid transaction status transition from % to %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$function$;
