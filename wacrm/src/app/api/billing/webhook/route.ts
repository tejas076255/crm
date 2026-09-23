import { NextResponse, after } from 'next/server'
import Razorpay from 'razorpay'

import { webhookSecret } from '@/lib/billing/config'
import { razorpay } from '@/lib/billing/razorpay'
import {
  applyPaymentState,
  planFromPaymentNotes,
} from '@/lib/billing/payment-state'
import { findAccountById, findAccountByPayment } from '@/lib/billing/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** One-time payment events we react to. Others (subscription.*, invoice.*,
 *  failed/attempted payments) are ignored — access follows a captured
 *  payment or a paid order. */
const PAYMENT_EVENTS = new Set(['payment.captured', 'order.paid'])

interface RazorpayWebhookPayload {
  event?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any
}

interface RazorpayOrderEntity {
  id: string
  receipt?: string | null
  status?: string
  notes?: Record<string, unknown> | null
}

/**
 * POST /api/billing/webhook — authoritative plan updates from Razorpay
 *
 * Verifies the HMAC-SHA256 signature on the raw body (a forged event
 * must never flip an account's plan) then reduces each captured-payment
 * event to the account columns via `applyPaymentState`. Sends 200
 * immediately and processes in `after()` so Razorpay acks fast and the
 * write still runs to completion on serverless.
 *
 * Signature header: `x-razorpay-signature`, value = HMAC-SHA256(raw body,
 * webhook secret). The same secret must be registered under Razorpay
 * Dashboard → Settings → Webhooks (events: payment.captured, order.paid).
 *
 * NOTE: in local/test setups the happy path works without a webhook at
 * all — `/api/billing/verify` (which the client calls on success) uses
 * the key secret, not this route. The webhook only guarantees activation
 * when the client is killed mid-payment.
 */
export async function POST(request: Request) {
  // Read raw bytes before parsing — re-encoding would break the HMAC.
  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature')

  let valid = false
  try {
    valid = Razorpay.validateWebhookSignature(rawBody, signature ?? '', webhookSecret())
  } catch {
    valid = false
  }
  if (!valid || !signature) {
    // 401 (not 200) — Razorpay's dashboard shows a failure loudly when
    // the secret mismatches instead of silently dropping plan events.
    console.warn('[billing/webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body: RazorpayWebhookPayload
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.event || !PAYMENT_EVENTS.has(body.event)) {
    // Not a capture/paid event — acknowledge and ignore.
    return NextResponse.json({ status: 'ignored' }, { status: 200 })
  }

  after(() => processPaymentEvent(body))

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

/** Apply one verified payment event to its account. Never throws —
 *  failures are logged so a bad event can't take the route down. */
async function processPaymentEvent(body: RazorpayWebhookPayload) {
  try {
    // Recover the authoritative order. `payment.captured` carries the
    // payment entity, whose own notes may be EMPTY — the order is what
    // carries `receipt` (account id) and `notes.wacrmPlan`, so always
    // resolve the plan and owner from the order. `order.paid` already IS
    // the order entity.
    const order = await resolveOrder(body)
    if (!order?.id || typeof order.receipt !== 'string') {
      console.warn('[billing/webhook] event missing order + receipt')
      return
    }

    // `payment.captured` carries a payment id; `order.paid` does not.
    const paymentId: string | undefined =
      body.payload?.payment?.entity?.id ?? undefined

    const plan = planFromPaymentNotes(order.notes)
    if (!plan) {
      console.warn(
        `[billing/webhook] order ${order.id} has no wacrmPlan note — refusing to guess the tier`,
      )
      return
    }

    // Link the account: the stamped payment id is exact when present;
    // the order's receipt (account id, set at checkout) covers the first
    // payment and every `order.paid` event.
    const account = paymentId
      ? (await findAccountByPayment(paymentId)) ?? (await findAccountById(order.receipt))
      : await findAccountById(order.receipt)
    if (!account) {
      console.warn(
        `[billing/webhook] no account linked to payment ${paymentId ?? '(none)'} / order ${order.id} — ignoring`,
      )
      return
    }

    const result = await applyPaymentState({
      accountId: account.id,
      paymentId,
      plan,
      status: order.status,
    })

    if (!result.ok) {
      console.error('[billing/webhook]', result.reason)
      return
    }
    console.info(
      `[billing/webhook] ${body.event} → ${result.transition} (account ${account.id})`,
    )
  } catch (err) {
    console.error('[billing/webhook] processing failed:', err)
  }
}

/** The order behind a capture/paid event — fetched from Razorpay, never
 *  trusted from the payload alone. */
async function resolveOrder(
  body: RazorpayWebhookPayload,
): Promise<RazorpayOrderEntity | null> {
  if (body.event === 'order.paid') {
    return body.payload?.order?.entity ?? null
  }
  // payment.captured — payment entity's order_id drives the fetch.
  const payment = body.payload?.payment?.entity
  const orderId = typeof payment?.order_id === 'string' ? payment.order_id : null
  if (!orderId) return null
  const order = await razorpay().orders.fetch(orderId)
  return order as RazorpayOrderEntity
}