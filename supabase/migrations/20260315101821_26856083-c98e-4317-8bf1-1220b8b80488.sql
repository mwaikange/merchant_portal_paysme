
-- Drop the two vulnerable JWT-claim-based RLS policies on transactions
-- These are unnecessary because payment providers use the webhooks-payments
-- edge function which operates with service_role privileges.

DROP POLICY IF EXISTS "Authenticated payment systems can validate codes" ON public.transactions;
DROP POLICY IF EXISTS "Mobi_Pulse can update transactions" ON public.transactions;
