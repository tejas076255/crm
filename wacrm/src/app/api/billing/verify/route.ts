import { NextResponse } from 'next/server'
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { keySecret, PLAN_PRICE_PAISE } from '@/lib/billing/config'
import { razorpay } from '@/lib/billing/razorpay'
import {
  applyPaymentState,
  planFromPaymentNotes,
  type RazorpayPlan,
} from '@/lib/billing/payment-state'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/verify — activate a plan after a one-time payment (owner)
 *
 * Body: `{ order_id, payment_id, signature }`
 *
 * The Razorpay checkout widget's success callback is client-side and must
 * not be trusted alone — this re-verifies everything server-side:
 *
 *   1. HMAC-SHA256 payment signature over `order_id|payment_id` against
 *      the key secret (constant-time; a forged callback cannot pass).
 *   2. The order on Razorpay, and that it belongs to THIS account
 *      (`receipt === accountId`), is `paid`, and settled the full amount
 *      for the tier tagged in the order's notes.
 *   3. Only then writes the grant via the service role.
 *
 * Idempotent; safe to call repeatedly.
 */
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('owner')

    const body = await request.json().catch(() => null)
    const orderId: unknown = body?.order_id
    const paymentId: unknown = body?.payment_id
    const signature: unknown = body?.signature
    if (
      typeof orderId !== 'string' ||
      !orderId ||
      typeof paymentId !== 'string' ||
      !paymentId ||
      typeof signature !== 'string' ||
      !signature
    ) {
      return NextResponse.json(
        { error: 'order_id, payment_id and signature are required' },
        { status: 400 },
      )
    }

    // (2) The client can't be allowed to settle on its word — verify the
    // payment signature the checkout widget hands back.
    if (!validatePaymentVerification({ payment_id: paymentId, order_id: orderId }, signature, keySecret())) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    const order = await razorpay().orders.fetch(orderId)

    // (3) Ownership — the order must have been issued for this account.
    if (order.receipt !== accountId) {
      return NextResponse.json(
        { error: 'Order does not belong to this account' },
        { status: 400 },
      )
    }

    // (4) Tier + settlement. Never guess a tier from the amount; the order's
    // notes carry the authoritative tag set at checkout.
    const plan = planFromPaymentNotes(order.notes) as RazorpayPlan | null
    if (!plan) {
      return NextResponse.json(
        { error: 'Order has no valid plan note; contact support' },
        { status: 400 },
      )
    }
    if (
      order.status !== 'paid' ||
      Number(order.amount_paid) < PLAN_PRICE_PAISE[plan]
    ) {
      return NextResponse.json(
        { error: 'Payment is not settled' },
        { status: 400 },
      )
    }

    const result = await applyPaymentState({
      accountId,
      paymentId,
      plan,
      status: order.status,
    })
    if (!result.ok) {
      console.error('[billing/verify]', result.reason)
      return NextResponse.json({ error: result.reason }, { status: 400 })
    }

    console.info(
      `[billing/verify] ${plan} activated for account ${accountId} (${orderId}/${paymentId})`,
    )
    return NextResponse.json({
      success: true,
      order_id: orderId,
      payment_id: paymentId,
      status: order.status,
      transition: result.transition,
      plan,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}