-- ============================================================
-- 040_subscriptions — Plan-based feature gating + Razorpay billing
--
-- Introduces a per-account plan (free / pro / pro_max) that gates
-- feature access (Automations & Flows = pro, AI Agents = pro_max),
-- plus the Razorpay subscription bookkeeping to keep it authoritative
-- server-side.
--
-- Design decisions
--   1. `plan` lives on `accounts`, not `profiles`: a plan is an
--      account-wide licence, not a per-user flag. One account = one
--      plan (the same one-account-per-user design as 017).
--   2. A separate `plan_status` ('none' | 'active' | 'past_due' |
--      'cancelled') tracks subscription health so a lapsed payment
--      can keep the user's chosen `plan` value while access is
--      denied (webhooks flip status, they don't rewrite `plan`).
--   3. Column-level `REVOKE` on the plan columns keeps a logged-in
--      admin (who, via `accounts_update`, can otherwise UPDATE any
--      accounts column) from self-upgrading by PATCHing the client —
--      only the service_role (server SDK) can change plan data.
--   4. `account_has_plan()` mirrors `is_account_member()` so SQL RLS
--      and server-side TS guards speak one language.
-- ============================================================

-- ---- plan enum -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_enum') THEN
    CREATE TYPE plan_enum AS ENUM ('free', 'pro', 'pro_max');
  END IF;
END $$;

-- ---- accounts columns ----------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan plan_enum NOT NULL DEFAULT 'free';

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'none'
  CHECK (plan_status IN ('none', 'active', 'past_due', 'cancelled'));

-- Razorpay subscription id once a billing subscription exists.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_razorpay_subscription
  ON accounts(razorpay_subscription_id);

-- ---- server-only plan columns --------------------------------------
-- The authenticated (client) role may read plan but not write it.
-- Billing endpoints use the service_role SDK connection, which is
-- exempt from this restriction and from RLS.
REVOKE UPDATE (plan, plan_status, razorpay_subscription_id)
  ON TABLE public.accounts FROM authenticated;

-- ---- account_has_plan(account_id, min_plan) ------------------------
-- Whether `p_account_id` is on `p_min` or a higher plan. Used by any
-- future RLS policy and mirrors the rank logic in src/lib/auth/plans.ts.
CREATE OR REPLACE FUNCTION public.account_has_plan(
  p_account_id UUID,
  p_min plan_enum DEFAULT 'free'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    CASE a.plan
      WHEN 'free'    THEN 0
      WHEN 'pro'     THEN 1
      WHEN 'pro_max' THEN 2
    END
    >=
    CASE p_min
      WHEN 'free'    THEN 0
      WHEN 'pro'     THEN 1
      WHEN 'pro_max' THEN 2
    END
  FROM public.accounts a
  WHERE a.id = p_account_id
$$;

ALTER FUNCTION public.account_has_plan(UUID, plan_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_has_plan(UUID, plan_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_has_plan(UUID, plan_enum)
  TO authenticated, service_role;

-- ============================================================
-- Post-apply note
--   Existing accounts keep `plan = 'free'` (the DEFAULT) and
--   `plan_status = 'none'`, so nothing is auto-granted and current
--   installations start strictly on the free tier. Signups created
--   after 017 already inherit the DEFAULT through the same account
--   bootstrap, so no trigger change is required here.
-- ============================================================