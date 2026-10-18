import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { publicKeyId } from '@/lib/billing/config'
import { createPaymentOrder } from '@/lib/billing/razorpay'
import { createYoupiPayment, YOUPI_BASE_URL, YOUPI_MERCHANT_ID } from '@/lib/billing/youpi'
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
 * Supports YOUPI PG (Direct serverless UPI) and Razorpay fallback.
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

    const hasRazorpay = Boolean(
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      !body?.preferYoupi
    )

    if (hasRazorpay) {
      const order = await createPaymentOrder(plan, accountId)
      console.info(`[billing/checkout] user ${userId} opened ${plan} checkout on Razorpay (${order.id})`)
      return NextResponse.json({
        success: true,
        gateway: 'razorpay',
        order_id: order.id,
        razorpay_key: publicKeyId(),
      })
    }

    // Default: YOUPI PG direct serverless UPI payment
    const youpiPayment = await createYoupiPayment({ plan, accountId })
    console.info(`[billing/checkout] user ${userId} opened ${plan} checkout on Youpi PG (${youpiPayment.paymentId})`)

    return NextResponse.json({
      success: true,
      gateway: 'youpi',
      payment_id: youpiPayment.paymentId,
      order_id: youpiPayment.orderId,
      amount: youpiPayment.amount,
      checkout_url: youpiPayment.checkoutUrl,
      youpi_url: YOUPI_BASE_URL,
      merchant_id: YOUPI_MERCHANT_ID,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}