-- Backfill webhook URLs for merchants that don't have them
-- Generate webhook URLs in format: https://yourdomain.com/webhook/{merchant_id}
UPDATE public.merchants 
SET webhook_url = 'https://merchant-webhook.paysme.app/webhook/' || merchant_id::text,
    updated_at = now()
WHERE webhook_url IS NULL OR webhook_url = '';

-- Make webhook_url not nullable in the future to ensure all new merchants have it
-- (This is done in a separate statement to avoid issues with existing null values)
ALTER TABLE public.merchants ALTER COLUMN webhook_url SET NOT NULL;