-- Create a table to log incoming webhook calls
CREATE TABLE public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name TEXT NOT NULL,             -- e.g. "Maris_Today", "Mobi_Pulse"
    provider_id UUID REFERENCES public.payment_providers(payment_provider_id) ON DELETE SET NULL,
    payload JSONB NOT NULL,                  -- raw body from the webhook
    headers JSONB,                           -- request headers (optional but useful)
    received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT DEFAULT 'pending',           -- processing status: pending, processed, failed
    error_message TEXT                       -- error details if processing fails
);

-- Index for fast lookup by provider
CREATE INDEX idx_webhook_logs_provider_name ON public.webhook_logs(provider_name);
CREATE INDEX idx_webhook_logs_received_at ON public.webhook_logs(received_at DESC);

-- Enable RLS on webhook_logs table
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;