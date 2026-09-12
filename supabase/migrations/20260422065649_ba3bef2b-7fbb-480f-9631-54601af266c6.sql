-- ─────────────────────────────────────────────
-- Table 1: vendors
-- ─────────────────────────────────────────────
CREATE TABLE public.vendors (
    vendor_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id        UUID NOT NULL UNIQUE,
    vendor_code         VARCHAR(50) NOT NULL UNIQUE,
    full_name           VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    mobile_number       VARCHAR(20),
    vendor_type         VARCHAR(20) NOT NULL DEFAULT 'prepaid',
    pin_hash            VARCHAR(255) NOT NULL,
    token_balance       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    fee_balance         NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    commission_rate     NUMERIC(5,4) NOT NULL DEFAULT 0.05,
    kyc_status          VARCHAR(20) DEFAULT 'pending',
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendors_vendor_code ON public.vendors(vendor_code);
CREATE INDEX idx_vendors_auth_user ON public.vendors(auth_user_id);
CREATE INDEX idx_vendors_type ON public.vendors(vendor_type);

-- ─────────────────────────────────────────────
-- Table 2: vendor_token_advances
-- ─────────────────────────────────────────────
CREATE TABLE public.vendor_token_advances (
    advance_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    original_amount     NUMERIC(12,2) NOT NULL,
    interest_rate       NUMERIC(5,4) NOT NULL DEFAULT 0.10,
    total_repayable     NUMERIC(12,2) NOT NULL,
    balance_remaining   NUMERIC(12,2) NOT NULL,
    min_installment     NUMERIC(12,2) NOT NULL DEFAULT 250.00,
    term_months         INTEGER NOT NULL,
    status              VARCHAR(20) DEFAULT 'active',
    last_payment_date   TIMESTAMPTZ,
    last_payment_amount NUMERIC(12,2),
    total_paid          NUMERIC(12,2) DEFAULT 0.00,
    payment_count       INTEGER DEFAULT 0,
    approved_at         TIMESTAMPTZ,
    approved_by         VARCHAR(255),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_advances_vendor ON public.vendor_token_advances(vendor_id);
CREATE INDEX idx_vendor_advances_status ON public.vendor_token_advances(status);

-- ─────────────────────────────────────────────
-- Table 3: vendor_transactions
-- ─────────────────────────────────────────────
CREATE TABLE public.vendor_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    transaction_type    VARCHAR(50) NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    status              VARCHAR(20) DEFAULT 'completed',
    generated_code      VARCHAR(20),
    merchant_name       VARCHAR(255),
    merchant_id         UUID,
    advance_id          UUID REFERENCES public.vendor_token_advances(advance_id) ON DELETE SET NULL,
    notes               TEXT,
    processed_at        TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_tx_vendor ON public.vendor_transactions(vendor_id);
CREATE INDEX idx_vendor_tx_type ON public.vendor_transactions(transaction_type);
CREATE INDEX idx_vendor_tx_status ON public.vendor_transactions(status);
CREATE INDEX idx_vendor_tx_code ON public.vendor_transactions(generated_code);
CREATE INDEX idx_vendor_tx_date ON public.vendor_transactions(processed_at DESC);

-- ─────────────────────────────────────────────
-- Table 4: vendor_topup_credits
-- ─────────────────────────────────────────────
CREATE TABLE public.vendor_topup_credits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    topup_type          VARCHAR(20) NOT NULL DEFAULT 'prepaid',
    amount_requested    NUMERIC(12,2) NOT NULL,
    amount_credited     NUMERIC(12,2) NOT NULL,
    discount_applied    NUMERIC(12,2) DEFAULT 0.00,
    amount_paid         NUMERIC(12,2) NOT NULL,
    payment_reference   VARCHAR(100),
    status              VARCHAR(20) DEFAULT 'pending',
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_topups_vendor ON public.vendor_topup_credits(vendor_id);
CREATE INDEX idx_vendor_topups_status ON public.vendor_topup_credits(status);

-- ─────────────────────────────────────────────
-- Table 5: vendor_kyc_applications
-- ─────────────────────────────────────────────
CREATE TABLE public.vendor_kyc_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    application_type    VARCHAR(30) NOT NULL,
    id_document_url     VARCHAR(500),
    income_proof_url    VARCHAR(500),
    address_proof_url   VARCHAR(500),
    requested_amount    NUMERIC(12,2),
    total_repayable     NUMERIC(12,2),
    term_months         INTEGER,
    status              VARCHAR(20) DEFAULT 'pending',
    reviewed_by         VARCHAR(255),
    review_notes        TEXT,
    submitted_at        TIMESTAMPTZ DEFAULT now(),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_kyc_vendor ON public.vendor_kyc_applications(vendor_id);
CREATE INDEX idx_vendor_kyc_status ON public.vendor_kyc_applications(status);
CREATE INDEX idx_vendor_kyc_type ON public.vendor_kyc_applications(application_type);

-- ─────────────────────────────────────────────
-- Table 6: vendor_withdrawal_requests
-- ─────────────────────────────────────────────
CREATE TABLE public.vendor_withdrawal_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id               UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    vendor_transaction_id   UUID REFERENCES public.vendor_transactions(id) ON DELETE SET NULL,
    amount_requested        NUMERIC(12,2) NOT NULL,
    amount_payout           NUMERIC(12,2) NOT NULL,
    advance_repayment       NUMERIC(12,2) DEFAULT 0.00,
    status                  VARCHAR(20) DEFAULT 'pending',
    payout_reference        VARCHAR(100),
    paid_out_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vendor_withdrawals_vendor ON public.vendor_withdrawal_requests(vendor_id);
CREATE INDEX idx_vendor_withdrawals_status ON public.vendor_withdrawal_requests(status);

-- ─────────────────────────────────────────────
-- updated_at triggers
-- ─────────────────────────────────────────────
CREATE TRIGGER trg_vendors_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vendor_advances_updated_at
BEFORE UPDATE ON public.vendor_token_advances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vendor_tx_updated_at
BEFORE UPDATE ON public.vendor_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vendor_topups_updated_at
BEFORE UPDATE ON public.vendor_topup_credits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vendor_withdrawals_updated_at
BEFORE UPDATE ON public.vendor_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- RLS: vendors
-- ─────────────────────────────────────────────
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own record"
ON public.vendors FOR SELECT TO authenticated
USING (auth.uid() = auth_user_id);

CREATE POLICY "Vendor can update own safe fields"
ON public.vendors FOR UPDATE TO authenticated
USING (auth.uid() = auth_user_id)
WITH CHECK (
  auth.uid() = auth_user_id
  AND token_balance   = (SELECT v.token_balance   FROM public.vendors v WHERE v.auth_user_id = auth.uid())
  AND fee_balance     = (SELECT v.fee_balance     FROM public.vendors v WHERE v.auth_user_id = auth.uid())
  AND commission_rate = (SELECT v.commission_rate FROM public.vendors v WHERE v.auth_user_id = auth.uid())
  AND kyc_status      = (SELECT v.kyc_status      FROM public.vendors v WHERE v.auth_user_id = auth.uid())
  AND vendor_type     = (SELECT v.vendor_type     FROM public.vendors v WHERE v.auth_user_id = auth.uid())
  AND pin_hash        = (SELECT v.pin_hash        FROM public.vendors v WHERE v.auth_user_id = auth.uid())
);

CREATE POLICY "Service role full access to vendors"
ON public.vendors FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- RLS: vendor_transactions
-- ─────────────────────────────────────────────
ALTER TABLE public.vendor_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own transactions"
ON public.vendor_transactions FOR SELECT TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Vendor can insert own transactions"
ON public.vendor_transactions FOR INSERT TO authenticated
WITH CHECK (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to vendor_transactions"
ON public.vendor_transactions FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- RLS: vendor_token_advances
-- ─────────────────────────────────────────────
ALTER TABLE public.vendor_token_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own advances"
ON public.vendor_token_advances FOR SELECT TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to advances"
ON public.vendor_token_advances FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- RLS: vendor_topup_credits
-- ─────────────────────────────────────────────
ALTER TABLE public.vendor_topup_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own topups"
ON public.vendor_topup_credits FOR SELECT TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Vendor can insert own topups"
ON public.vendor_topup_credits FOR INSERT TO authenticated
WITH CHECK (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to topups"
ON public.vendor_topup_credits FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- RLS: vendor_kyc_applications
-- ─────────────────────────────────────────────
ALTER TABLE public.vendor_kyc_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own KYC applications"
ON public.vendor_kyc_applications FOR SELECT TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Vendor can insert own KYC applications"
ON public.vendor_kyc_applications FOR INSERT TO authenticated
WITH CHECK (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to KYC"
ON public.vendor_kyc_applications FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- RLS: vendor_withdrawal_requests
-- ─────────────────────────────────────────────
ALTER TABLE public.vendor_withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendor can view own withdrawal requests"
ON public.vendor_withdrawal_requests FOR SELECT TO authenticated
USING (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Vendor can insert own withdrawal requests"
ON public.vendor_withdrawal_requests FOR INSERT TO authenticated
WITH CHECK (vendor_id IN (SELECT vendor_id FROM public.vendors WHERE auth_user_id = auth.uid()));

CREATE POLICY "Service role full access to withdrawals"
ON public.vendor_withdrawal_requests FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- Storage bucket: vendor-kyc-documents
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-kyc-documents', 'vendor-kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Vendor can upload own KYC docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vendor-kyc-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Vendor can read own KYC docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vendor-kyc-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT vendor_id::text FROM public.vendors WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Service role full access to vendor KYC docs"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'vendor-kyc-documents')
WITH CHECK (bucket_id = 'vendor-kyc-documents');