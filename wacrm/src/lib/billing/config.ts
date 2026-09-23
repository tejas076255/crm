import type { Plan } from '@/lib/auth/plans'

/**
 * Billing configuration — environment access for the Razorpay
 * subscription flow.
 *
 * Security: everything here is *server-only*. `RAZORPAY_KEY_SECRET`
 * and `RAZORPAY_WEBHOOK_SECRET` must never reach the client — only
 * `NEXT_PUBLIC_RAZORPAY_KEY_ID` (used by the checkout.js widget) is
 * public by design.
 */

/** Monthly cost, in paise (₹6,000 and ₹8,000). Shared by the pricing
 * UI and the Razorpay plan creation so the two can't drift. */
export const PLAN_PRICE_PAISE: Record<Plan, number> = {
  free: 0,
  pro: 6_000 * 100,
  pro_max: 8_000 * 100,
}

/** Public Razorpay key ID for the client checkout script. */
export function publicKeyId(): string {
  const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_RAZORPAY_KEY_ID is missing. Add it to .env.local (Razorpay Dashboard → Settings → API keys).',
    )
  }
  return key
}

/** Server-only key secret — throws a clear "pending" error in test mode
 * so the app still runs for non-payment paths but never silently no-ops
 * a real checkout. */
export function keySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) {
    throw new Error(
      'RAZORPAY_KEY_SECRET is missing. Paste the key secret from your Razorpay test account (Dashboard → Settings → API keys) into .env.local to enable live test payments.',
    )
  }
  return secret
}

/** Server-only webhook secret — verifies the HMAC signature Razorpay
 * sends on every subscription event. */
export function webhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    throw new Error(
      'RAZORPAY_WEBHOOK_SECRET is missing. Generate a random string, put it in .env.local, and register the same value under Razorpay Dashboard → Settings → Webhooks.',
    )
  }
  return secret
}