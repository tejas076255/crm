-- ============================================================
-- 042_one_time_payments — one-time Razorpay Orders billing
--
-- Replaces the recurring Subscriptions module (040) with one-time
-- payments via the Razorpay Orders API. The account-plan model
-- (plan / plan_status) is unchanged; only the bookkeeping column
-- changes from a subscription id to a captured payment id.
--
-- `razorpay_subscription_id` is deliberately LEFT IN PLACE (nullable,
-- no longer written) so existing rows keep their history and nothing
-- needs a destructive rewrite. The new column records the captured
-- payment that activated the account.
--
-- Security: same as 040 — the payment id is REVOKEd from the
-- authenticated role; only the service_role (server SDK) writes it.
-- ============================================================

-- One-time Razorpay payment id once an order is captured.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_razorpay_payment
  ON accounts(razorpay_payment_id);

-- ---- server-only plan columns (extends 040's REVOKE) --------------
-- REVOKE is idempotent: re-listing the 040 columns is a no-op for them
-- and adds the new one. Only the service role may write these.
REVOKE UPDATE (plan, plan_status, razorpay_subscription_id, razorpay_payment_id)
  ON TABLE public.accounts FROM authenticated;