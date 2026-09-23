import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Plan } from '@/lib/auth/plans'

/** Enum values for `accounts.plan_status` (migration 040). */
export type PlanStatus = 'none' | 'active' | 'past_due' | 'cancelled'

/**
 * Billing account writes — server-only service-role client.
 *
 * Plan columns (`plan`, `plan_status`, `razorpay_payment_id`, and the
 * legacy `razorpay_subscription_id`) are REVOKEd from the `authenticated`
 * role (migrations 040 + 042), so a logged-in client can never
 * self-upgrade. Every write below therefore goes through the
 * service_role SDK, which bypasses RLS and is exempt from the REVOKE —
 * the single server-side authority for plan state.
 *
 * Mirrors the lazily-cached `supabaseAdmin()` used by the automation
 * engine and the WhatsApp webhook.
 */

// Lazy singleton — created on first call so importing this module never
// throws while env vars are unset during setup.
let _adminClient: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

export interface AccountPlanRow {
  id: string
  plan: Plan
  plan_status: PlanStatus
  razorpay_payment_id: string | null
}

/** The account currently holding a given Razorpay payment id. */
export async function findAccountByPayment(
  paymentId: string,
): Promise<AccountPlanRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('accounts')
    .select('id, plan, plan_status, razorpay_payment_id')
    .eq('razorpay_payment_id', paymentId)
    .maybeSingle()
  if (error) {
    console.error('[billing] findAccountByPayment error:', error)
    return null
  }
  if (!data) return null
  return {
    id: data.id,
    plan: (data.plan as Plan) ?? 'free',
    plan_status: (data.plan_status as PlanStatus) ?? 'none',
    razorpay_payment_id: data.razorpay_payment_id,
  }
}

/**
 * The account by id — the webhook's fallback link. One-time orders stamp
 * `receipt = accountId` at creation, so a verified event with no stored
 * payment id yet (first payment, or an `order.paid` event) can still find
 * its owner.
 */
export async function findAccountById(id: string): Promise<AccountPlanRow | null> {
  const { data, error } = await supabaseAdmin()
    .from('accounts')
    .select('id, plan, plan_status, razorpay_payment_id')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[billing] findAccountById error:', error)
    return null
  }
  if (!data) return null
  return {
    id: data.id,
    plan: (data.plan as Plan) ?? 'free',
    plan_status: (data.plan_status as PlanStatus) ?? 'none',
    razorpay_payment_id: data.razorpay_payment_id,
  }
}

/** Rewrite an account's plan + status + payment id (service role). */
export async function setAccountPlan(
  accountId: string,
  patch: {
    plan?: Plan
    plan_status?: PlanStatus
    razorpay_payment_id?: string | null
  },
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('accounts')
    .update(patch)
    .eq('id', accountId)
  if (error) {
    console.error('[billing] setAccountPlan error:', error)
    return false
  }
  return true
}