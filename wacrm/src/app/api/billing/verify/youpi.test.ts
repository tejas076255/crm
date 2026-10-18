import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  requireRole: vi.fn(),
  fetchYoupiPayment: vi.fn(),
  applyPaymentState: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, init }),
  },
}))

vi.mock('@/lib/auth/account', () => ({
  requireRole: h.requireRole,
  toErrorResponse: () => ({ body: { error: 'err' }, init: { status: 500 } }),
}))

vi.mock('@/lib/billing/youpi', () => ({
  fetchYoupiPayment: h.fetchYoupiPayment,
}))

vi.mock('@/lib/billing/config', () => ({
  keySecret: () => 'key-secret',
  PLAN_PRICE_PAISE: { free: 0, pro: 600000, pro_max: 800000 },
}))

vi.mock('@/lib/billing/payment-state', () => ({
  applyPaymentState: h.applyPaymentState,
  planFromPaymentNotes: vi.fn(),
}))

import { POST } from './route'

type MockResponse = { body: unknown; init?: { status?: number } }

function called(promise: Promise<unknown>): Promise<MockResponse> {
  return promise as unknown as Promise<MockResponse>
}

function req(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as Request
}

const SUCCESS_YOUPI_PAYMENT = {
  paymentId: 'youpi-pay-123',
  orderId: 'WACRM-acc-1-pro-100',
  amount: '6000.00',
  amountPaise: 600000,
  currency: 'INR',
  status: 'SUCCESS' as const,
  utr: '123456789012',
  completedAt: '2026-10-18T05:35:19.496Z',
  metadata: {
    plan: 'pro',
    accountId: 'acc-1',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  h.requireRole.mockResolvedValue({ accountId: 'acc-1' })
  h.fetchYoupiPayment.mockResolvedValue(SUCCESS_YOUPI_PAYMENT)
  h.applyPaymentState.mockResolvedValue({ ok: true, transition: 'activated → pro' })
})

describe('POST /api/billing/verify with YOUPI PG', () => {
  it('activates Pro plan on confirmed Youpi payment', async () => {
    const res = await called(
      POST(req({ gateway: 'youpi', payment_id: 'youpi-pay-123', plan: 'pro' })),
    )

    expect(res.init?.status).toBeUndefined()
    expect(res.body).toMatchObject({
      success: true,
      gateway: 'youpi',
      payment_id: 'youpi-pay-123',
      order_id: 'WACRM-acc-1-pro-100',
      utr: '123456789012',
      status: 'paid',
      plan: 'pro',
    })

    expect(h.fetchYoupiPayment).toHaveBeenCalledWith('youpi-pay-123')
    expect(h.applyPaymentState).toHaveBeenCalledWith({
      accountId: 'acc-1',
      paymentId: 'youpi-pay-123',
      plan: 'pro',
      status: 'paid',
    })
  })

  it('rejects if payment is not confirmed yet (INITIATED)', async () => {
    h.fetchYoupiPayment.mockResolvedValue({
      ...SUCCESS_YOUPI_PAYMENT,
      status: 'INITIATED',
    })

    const res = await called(
      POST(req({ gateway: 'youpi', payment_id: 'youpi-pay-123', plan: 'pro' })),
    )

    expect(res.init?.status).toBe(400)
    expect(res.body).toMatchObject({
      error: 'Payment has not been confirmed or verified yet',
    })
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('rejects if payment belongs to a different account', async () => {
    h.fetchYoupiPayment.mockResolvedValue({
      ...SUCCESS_YOUPI_PAYMENT,
      metadata: { plan: 'pro', accountId: 'different-account' },
    })

    const res = await called(
      POST(req({ gateway: 'youpi', payment_id: 'youpi-pay-123', plan: 'pro' })),
    )

    expect(res.init?.status).toBe(400)
    expect(res.body).toMatchObject({
      error: 'Payment does not belong to this account',
    })
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('rejects if payment amount is less than required plan price', async () => {
    h.fetchYoupiPayment.mockResolvedValue({
      ...SUCCESS_YOUPI_PAYMENT,
      amountPaise: 400000, // ₹4000 instead of ₹6000
    })

    const res = await called(
      POST(req({ gateway: 'youpi', payment_id: 'youpi-pay-123', plan: 'pro' })),
    )

    expect(res.init?.status).toBe(400)
    expect(res.body).toMatchObject({
      error: 'Payment amount is less than plan price',
    })
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })
})
