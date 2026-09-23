import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { publicKeyId } from '@/lib/billing/config'
import { createPaymentOrder } from '@/lib/billing/razorpay'
import type { RazorpayPlan } from '@/lib/billing/payment-state'

export const dynamic = 'force-dynamic'

function isBillablePlan(value: unknown): value is RazorpayPlan {
  return value === 'pro' || value === 'pro_max'
}

/**
 * POST /api/billing/checkout — create a one-time order (owner)
 *
 * Body: `{ plan: 'pro' | 'pro_max' }`
 *
 * Creates a Razorpay *order* (not a subscription — one-time payments,
 * which don't need the account's Subscriptions module). The order is
 * the server-side contract: its `receipt` is the account id and its
 * `notes.wacrmPlan` is the tier, both read back on verify/webhook so the
 * client can never name its own price. Returns the order id + public key
 * for the client checkout.js widget — never a secret.
 *
 * No account write happens here; the purchase is only recorded once a
 * captured payment is verified server-side.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('owner')

    const body = await request.json().catch(() => null)
    const plan: unknown = body?.plan
    if (!isBillablePlan(plan)) {
      return NextResponse.json(
        { error: "plan must be 'pro' or 'pro_max'" },
        { status: 400 },
      )
    }

    const order = await createPaymentOrder(plan, accountId)

    console.info(`[billing/checkout] user ${userId} opened ${plan} checkout (${order.id})`)
    return NextResponse.json({
      success: true,
      order_id: order.id,
      razorpay_key: publicKeyId(),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}