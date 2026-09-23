import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  requireRole: vi.fn(),
  validatePaymentVerification: vi.fn(),
  ordersFetch: vi.fn(),
  applyPaymentState: vi.fn(),
  planFromPaymentNotes: vi.fn(),
}))

// `next/server` — NextResponse.json returns the {body, init} pair the
// tests assert on directly (same convention as the whatsapp webhook test).
// The runtime shape differs from the real NextResponse type, so results
// are read through `called()` below.
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, init }),
  },
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: h.requireRole,
  toErrorResponse: () => ({ body: { error: 'err' }, init: { status: 500 } }),
}))

vi.mock('razorpay/dist/utils/razorpay-utils', () => ({
  validatePaymentVerification: h.validatePaymentVerification,
}))

vi.mock('@/lib/billing/razorpay', () => ({
  razorpay: () => ({ orders: { fetch: h.ordersFetch } }),
}))

vi.mock('@/lib/billing/config', () => ({
  keySecret: () => 'key-secret',
  PLAN_PRICE_PAISE: { free: 0, pro: 600000, pro_max: 800000 },
}))

vi.mock('@/lib/billing/payment-state', () => ({
  applyPaymentState: h.applyPaymentState,
  planFromPaymentNotes: h.planFromPaymentNotes,
}))

import { POST } from './route'

type MockResponse = { body: unknown; init?: { status?: number } }

function called(promise: Promise<unknown>): Promise<MockResponse> {
  return promise as unknown as Promise<MockResponse>
}

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Request
}

/** A settled, owned order matching the mocked signature. */
const PAID_ORDER = {
  id: 'order_1',
  receipt: 'acc-1',
  status: 'paid',
  amount_paid: 600000,
  notes: { wacrmPlan: 'pro' },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireRole.mockResolvedValue({ accountId: 'acc-1' })
  h.validatePaymentVerification.mockReturnValue(true)
  h.ordersFetch.mockResolvedValue(PAID_ORDER)
  h.planFromPaymentNotes.mockReturnValue('pro')
  h.applyPaymentState.mockResolvedValue({ ok: true, transition: 'activated → pro' })
})

describe('POST /api/billing/verify', () => {
  it('activates a signed, owned, settled payment', async () => {
    const res = await called(
      POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })),
    )

    expect(res.init?.status).toBeUndefined()
    expect(res.body).toMatchObject({
      success: true,
      order_id: 'order_1',
      payment_id: 'pay_1',
      status: 'paid',
      transition: 'activated → pro',
      plan: 'pro',
    })
    expect(h.validatePaymentVerification).toHaveBeenCalledWith(
      { payment_id: 'pay_1', order_id: 'order_1' },
      'sig',
      'key-secret',
    )
    expect(h.applyPaymentState).toHaveBeenCalledWith({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: 'pro',
      status: 'paid',
    })
  })

  it('rejects a missing body field with 400', async () => {
    const res = await called(
      POST(req({ order_id: 'order_1', signature: 'sig' })),
    )
    expect(res.init?.status).toBe(400)
    expect(h.ordersFetch).not.toHaveBeenCalled()
  })

  it('rejects an invalid payment signature with 400 before touching Razorpay', async () => {
    h.validatePaymentVerification.mockReturnValue(false)

    const res = await called(
      POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'bad' })),
    )

    expect(res.init?.status).toBe(400)
    expect(h.ordersFetch).not.toHaveBeenCalled()
  })

  it('rejects an order that does not belong to the account', async () => {
    h.ordersFetch.mockResolvedValue({ ...PAID_ORDER, receipt: 'acc-999' })

    const res = await called(
      POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })),
    )

    expect(res.init?.status).toBe(400)
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('rejects a paid order whose notes carry no plan', async () => {
    h.planFromPaymentNotes.mockReturnValue(null)

    const res = await called(
      POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })),
    )

    expect(res.init?.status).toBe(400)
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('rejects an unsettled order (not paid or under amount)', async () => {
    for (const bad of [
      { ...PAID_ORDER, status: 'created' },
      { ...PAID_ORDER, amount_paid: 599999 },
    ]) {
      h.ordersFetch.mockResolvedValue(bad)
      const res = await called(
        POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })),
      )
      expect(res.init?.status).toBe(400)
    }
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('reports a failed state write as 400', async () => {
    h.applyPaymentState.mockResolvedValue({ ok: false, reason: 'upgrade failed' })

    const res = await called(
      POST(req({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })),
    )

    expect(res.init?.status).toBe(400)
    expect(res.body).toMatchObject({ error: 'upgrade failed' })
  })
})