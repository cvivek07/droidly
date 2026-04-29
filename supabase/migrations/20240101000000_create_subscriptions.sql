-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_payment_id  TEXT        UNIQUE,
  razorpay_order_id    TEXT,
  razorpay_signature   TEXT,
  status               TEXT        NOT NULL DEFAULT 'active',
  plan                 TEXT        NOT NULL DEFAULT 'premium_monthly',
  amount               INTEGER     NOT NULL,
  currency             TEXT        NOT NULL DEFAULT 'INR',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscriptions (used by checkPremium on the frontend)
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- No client-side INSERT/UPDATE — only the service role (edge functions) can write
