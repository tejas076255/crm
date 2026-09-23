import type { Plan } from '@/lib/auth/plans'
import { setAccountPlan } from './admin'

/**
 * Shared plan-state transitions for one-time Razorpay payments.
 *
 * Both the client-triggered `/api/billing/verify` and the authoritative
 * `/api/billing/webhook` reduce a captured payment down to the account
 * columns (migration 040 + 042). Keeping the mapping here means the two
 * surfaces can't drift on what a payment means for access.
 *
 * One-time state grammar (Razorpay → accounts.plan_status):
 *   captured / paid   → 'active'  (feature grant, written once and kept)
 *   anything else     → no write  (still free)
 *
 * There is no recurring lifecycle anymore: `past_due` / `cancelled` come
 * only from the cancel route, never from a payment event. A payment is a
 * one-shot grant, so the moment it's captured the account stays on that
 * plan until an owner cancels.
 */

export type RazorpayPlan = Extract<Plan, 'pro' | 'pro_max'>

/** Recover the wacrm tier from a payment/order's `notes.wacrmPlan`. */
export function planFromPaymentNotes(
  notes?: Record<string, unknown> | null,
): RazorpayPlan | null {
  const raw = notes?.wacrmPlan
  return raw === 'pro' || raw === 'pro_max' ? raw : null
}

/**
 * Whether a payment has actually been captured.
 *
 * Both a captured *payment* (`payment.captured`, status 'captured') and a
 * paid *order* (`order.paid`, status 'paid') mean the money is in.
 */
export function paymentIsCaptured(status: string | undefined): boolean {
  return status === 'captured' || status === 'paid'
}

/**
 * Apply a captured payment's state to an account. Idempotent: re-running
 * with the same payment writes the same values.
 *
 * @returns a short reason string for logging / client message, or null when
 *   the payment state grants nothing yet.
 */
export async function applyPaymentState(args: {
  accountId: string
  /** Razorpay payment id — absent on `order.paid` events. */
  paymentId?: string | null
  /** Value of `notes.wacrmPlan` captured when the order was created. */
  plan?: RazorpayPlan | null
  status: string | undefined
}): Promise<{ ok: true; transition: string } | { ok: false; reason: string }> {
  const { accountId, paymentId, plan, status } = args

  if (!paymentIsCaptured(status)) {
    // Open / authorised / failed — the account stays free.
    return { ok: true, transition: `no-op (payment status ${status ?? 'unknown'})` }
  }
  if (!plan) {
    return {
      ok: false,
      reason: `payment ${paymentId ?? '(unknown)'} has no wacrmPlan note; refusing to guess the tier`,
    }
  }
  const ok = await setAccountPlan(accountId, {
    plan,
    plan_status: 'active',
    ...(paymentId ? { razorpay_payment_id: paymentId } : {}),
  })
  return ok
    ? { ok: true, transition: `activated → ${plan}` }
    : { ok: false, reason: `failed to upgrade account ${accountId} to ${plan}` }
}