import Razorpay from 'razorpay'
import { type Orders } from 'razorpay/dist/types/orders'

import type { RazorpayPlan } from './payment-state'
import { keySecret, publicKeyId, PLAN_PRICE_PAISE } from './config'

/**
 * Razorpay SDK access — server-only.
 *
 * A single lazily-created SDK instance is cached for the lifetime of
 * the process (mirrors `supabaseAdmin` in the automation engine). The
 * SDK's `orders`/`payments`/`validateWebhookSignature` helpers are all
 * we need; nothing here is exposed to the client.
 *
 * One-time orders only (the Orders API is available on every account;
 * the Subscriptions module is separately gated by Razorpay).
 */

// Lazy singleton. Created inside a function (not at module top level) so
// importing this module never throws when env vars are missing — the
// error surfaces at the first *payment* call instead, keeping unrelated
// routes working during setup.
let _razorpay: Razorpay | null = null

export function razorpay(): Razorpay {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: publicKeyId(),
      key_secret: keySecret(),
    })
  }
  return _razorpay
}

/**
 * Create a one-time Razorpay order for a billable tier.
 *
 * `receipt` is the account id (not a human receipt string) so any later
 * event — the client verify call or the `payment.captured` webhook — can
 * recover the owning account without persisting anything in advance.
 * `notes.wacrmPlan` is the authoritative tier tag, read back on verify +
 * webhooks so a payment's plan never has to be guessed from the amount.
 * `payment.capture: 'automatic'` auto-captures, so test mode completes
 * without the Subscriptions module.
 */
export async function createPaymentOrder(
  plan: RazorpayPlan,
  accountId: string,
): Promise<Orders.RazorpayOrder> {
  return razorpay().orders.create({
    amount: PLAN_PRICE_PAISE[plan],
    currency: 'INR',
    receipt: accountId,
    // `payment.capture: 'automatic'` is the documented auto-capture flag
    // for one-time orders (the older `payment_capture: 1` isn't on the
    // create-order body type and only exists on the authorization body).
    payment: { capture: 'automatic' },
    notes: { wacrmPlan: plan },
  }) as Promise<Orders.RazorpayOrder>
}