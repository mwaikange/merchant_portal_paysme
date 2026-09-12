-- Create SMS transactions table
CREATE TABLE public.sms_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  transaction_id VARCHAR NOT NULL UNIQUE,
  tokens_purchased INTEGER NOT NULL DEFAULT 0,
  tokens_available INTEGER NOT NULL DEFAULT 0,
  date_purchased TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own SMS transactions" 
ON public.sms_transactions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own SMS transactions" 
ON public.sms_transactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create KYC table
CREATE TABLE public.kyc_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  business_type VARCHAR,
  business_name VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  email VARCHAR NOT NULL,
  mobile_number VARCHAR,
  date_of_birth DATE,
  id_number VARCHAR,
  region VARCHAR,
  town VARCHAR,
  address VARCHAR,
  income_source VARCHAR,
  annual_income VARCHAR,
  industry VARCHAR,
  bank_name VARCHAR,
  branch VARCHAR,
  branch_code VARCHAR,
  account_number VARCHAR,
  account_holder_name VARCHAR,
  account_type VARCHAR, -- personal or business
  kyc_status VARCHAR NOT NULL DEFAULT 'pending',
  banking_verified BOOLEAN DEFAULT false,
  documents_uploaded BOOLEAN DEFAULT false,
  finalized BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own KYC submissions" 
ON public.kyc_submissions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own KYC submissions" 
ON public.kyc_submissions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own KYC submissions" 
ON public.kyc_submissions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create KYC documents table
CREATE TABLE public.kyc_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kyc_submission_id UUID NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document_type VARCHAR NOT NULL, -- 'id_passport', 'bipa_registration', 'proof_of_banking', 'other'
  document_name VARCHAR NOT NULL,
  document_url VARCHAR NOT NULL,
  document_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own KYC documents" 
ON public.kyc_documents 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own KYC documents" 
ON public.kyc_documents 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_kyc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kyc_submissions_updated_at
  BEFORE UPDATE ON public.kyc_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kyc_updated_at();

CREATE TRIGGER update_sms_transactions_updated_at
  BEFORE UPDATE ON public.sms_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();