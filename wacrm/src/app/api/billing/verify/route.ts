import { NextResponse } from 'next/server'
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { keySecret, PLAN_PRICE_PAISE } from '@/lib/billing/config'
import { razorpay } from '@/lib/billing/razorpay'
import { fetchYoupiPayment } from '@/lib/billing/youpi'
import {
  applyPaymentState,
  planFromPaymentNotes,
  type RazorpayPlan,
} from '@/lib/billing/payment-state'

export const dynamic = 'force-dynamic'

function isBillablePlan(value: unknown): value is RazorpayPlan {
  return value === 'pro' || value === 'pro_max'
}

/**
 * POST /api/billing/verify — activate a plan after a one-time payment (owner)
 *
 * Supports:
 * 1. YOUPI PG — serverless edge verification against Cloudflare D1
 * 2. Razorpay — HMAC signature verification & order settlement check
 */
export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('owner')

    const body = await request.json().catch(() => null)
    const orderId: unknown = body?.order_id
    const paymentId: unknown = body?.payment_id
    const signature: unknown = body?.signature
    const gateway: unknown = body?.gateway

    // -----------------------------------------------------------------
    // 1. YOUPI PG VERIFICATION PATH
    // -----------------------------------------------------------------
    if (gateway === 'youpi' || (!signature && typeof paymentId === 'string' && paymentId)) {
      const pId = typeof paymentId === 'string' ? paymentId : ''
      if (!pId) {
        return NextResponse.json(
          { error: 'payment_id is required' },
          { status: 400 },
        )
      }

      const payment = await fetchYoupiPayment(pId)

      // (a) Must be confirmed SUCCESS on the gateway
      if (payment.status !== 'SUCCESS') {
        return NextResponse.json(
          { error: 'Payment has not been confirmed or verified yet' },
          { status: 400 },
        )
      }

      // (b) Ownership check
      if (
        payment.metadata?.accountId &&
        payment.metadata.accountId !== accountId
      ) {
        return NextResponse.json(
          { error: 'Payment does not belong to this account' },
          { status: 400 },
        )
      }

      // (c) Plan identification
      const targetPlan =
        payment.metadata?.plan ||
        payment.metadata?.wacrmPlan ||
        (isBillablePlan(body?.plan) ? body.plan : null)

      if (!isBillablePlan(targetPlan)) {
        return NextResponse.json(
          { error: 'Payment has no valid plan note; contact support' },
          { status: 400 },
        )
      }

      // (d) Amount settlement check
      if (payment.amountPaise < PLAN_PRICE_PAISE[targetPlan]) {
        return NextResponse.json(
          { error: 'Payment amount is less than plan price' },
          { status: 400 },
        )
      }

      const result = await applyPaymentState({
        accountId,
        paymentId: pId,
        plan: targetPlan,
        status: 'paid',
      })

      if (!result.ok) {
        console.error('[billing/verify/youpi]', result.reason)
        return NextResponse.json({ error: result.reason }, { status: 400 })
      }

      console.info(
        `[billing/verify/youpi] ${targetPlan} activated for account ${accountId} (payment: ${pId}, utr: ${payment.utr ?? 'none'})`,
      )

      return NextResponse.json({
        success: true,
        gateway: 'youpi',
        order_id: payment.orderId || (typeof orderId === 'string' ? orderId : pId),
        payment_id: pId,
        utr: payment.utr,
        status: 'paid',
        transition: result.transition,
        plan: targetPlan,
      })
    }

    // -----------------------------------------------------------------
    // 2. RAZORPAY VERIFICATION PATH
    // -----------------------------------------------------------------
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

    // Verify HMAC signature
    if (!validatePaymentVerification({ payment_id: paymentId, order_id: orderId }, signature, keySecret())) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 })
    }

    const order = await razorpay().orders.fetch(orderId)

    // Ownership
    if (order.receipt !== accountId) {
      return NextResponse.json(
        { error: 'Order does not belong to this account' },
        { status: 400 },
      )
    }

    // Tier + settlement
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
      gateway: 'razorpay',
      order_id: orderId,
      payment_id: paymentId,
      status: order.status,
      transition: result.transition,
      plan,
    })
  } catch (err) {
    console.error('[billing/verify] error:', err)
    if (err instanceof Error && (err.name === 'UnauthorizedError' || err.name === 'ForbiddenError')) {
      return toErrorResponse(err)
    }
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}