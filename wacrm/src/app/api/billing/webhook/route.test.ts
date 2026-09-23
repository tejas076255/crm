import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  validateWebhookSignature: vi.fn(),
  ordersFetch: vi.fn(),
  applyPaymentState: vi.fn(),
  planFromPaymentNotes: vi.fn(),
  findAccountByPayment: vi.fn(),
  findAccountById: vi.fn(),
  afterCallbacks: [] as (() => Promise<void> | void)[],
}))

// `after` collects callbacks the test drains manually, exactly as the
// runtime would; NextResponse.json keeps the {body, init} shape.
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void> | void) => {
    h.afterCallbacks.push(cb)
  },
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, init }),
  },
}))

vi.mock('razorpay', () => ({
  default: { validateWebhookSignature: h.validateWebhookSignature },
}))

vi.mock('@/lib/billing/config', () => ({
  webhookSecret: () => 'webhook-secret',
}))

vi.mock('@/lib/billing/razorpay', () => ({
  razorpay: () => ({ orders: { fetch: h.ordersFetch } }),
}))

vi.mock('@/lib/billing/payment-state', () => ({
  applyPaymentState: h.applyPaymentState,
  planFromPaymentNotes: h.planFromPaymentNotes,
}))

vi.mock('@/lib/billing/admin', () => ({
  findAccountByPayment: h.findAccountByPayment,
  findAccountById: h.findAccountById,
}))

import { POST } from './route'

/** NextResponse is mocked to {body, init}; read results through this cast. */
type MockResponse = { body: unknown; init?: { status?: number } }

function webhookRequest(body: unknown, signature: string | null = 'sig') {
  return {
    text: async () => JSON.stringify(body),
    headers: { get: () => signature },
  } as unknown as Request
}

async function run(body: unknown, signature?: string | null): Promise<MockResponse> {
  const res = (await POST(webhookRequest(body, signature))) as unknown as MockResponse
  for (const cb of h.afterCallbacks) await cb()
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  h.afterCallbacks = []
  h.validateWebhookSignature.mockReturnValue(true)
  h.ordersFetch.mockResolvedValue({
    id: 'order_1',
    receipt: 'acc-1',
    status: 'paid',
    notes: { wacrmPlan: 'pro' },
  })
  h.planFromPaymentNotes.mockReturnValue('pro')
  h.applyPaymentState.mockResolvedValue({ ok: true, transition: 'activated → pro' })
  h.findAccountByPayment.mockResolvedValue({ id: 'acc-1', plan: 'free' })
  h.findAccountById.mockResolvedValue({ id: 'acc-1', plan: 'free' })
})

describe('POST /api/billing/webhook — signature gate', () => {
  it('rejects an invalid signature with 401 and never processes', async () => {
    h.validateWebhookSignature.mockReturnValue(false)

    const res = await run({ event: 'payment.captured' }, 'bad')

    expect(res.init?.status).toBe(401)
    expect(h.afterCallbacks).toHaveLength(0)
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('rejects when the signature header is missing', async () => {
    const res = await run({ event: 'payment.captured' }, null)

    expect(res.init?.status).toBe(401)
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })
})

describe('POST /api/billing/webhook — event routing', () => {
  it('payment.captured links by payment id and activates', async () => {
    const body = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_1', order_id: 'order_1', status: 'captured' },
        },
      },
    }

    const res = await run(body)

    // Acknowledged immediately; the write ran via the after() callback.
    expect(res.body).toEqual({ status: 'received' })
    // The authoritative order is fetched (payment notes may be empty).
    expect(h.ordersFetch).toHaveBeenCalledWith('order_1')
    expect(h.findAccountByPayment).toHaveBeenCalledWith('pay_1')
    expect(h.applyPaymentState).toHaveBeenCalledWith({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: 'pro',
      status: 'paid',
    })
  })

  it('order.paid uses the order entity directly and links by receipt', async () => {
    const body = {
      event: 'order.paid',
      payload: {
        order: {
          entity: {
            id: 'order_1',
            receipt: 'acc-1',
            status: 'paid',
            notes: { wacrmPlan: 'pro_max' },
          },
        },
      },
    }
    h.planFromPaymentNotes.mockReturnValue('pro_max')

    const res = await run(body)

    expect(res.body).toEqual({ status: 'received' })
    // No fetch needed — the payload already IS the order.
    expect(h.ordersFetch).not.toHaveBeenCalled()
    expect(h.findAccountById).toHaveBeenCalledWith('acc-1')
    expect(h.applyPaymentState).toHaveBeenCalledWith({
      accountId: 'acc-1',
      paymentId: undefined,
      plan: 'pro_max',
      status: 'paid',
    })
  })

  it('falls back to receipt when the payment id has no stored account yet', async () => {
    h.findAccountByPayment.mockResolvedValue(null)

    await run({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
    })

    expect(h.findAccountById).toHaveBeenCalledWith('acc-1')
  })

  it('ignores (acks but does not activate) a non-payment event', async () => {
    const res = await run({ event: 'invoice.paid' })

    expect(res.body).toEqual({ status: 'ignored' })
    expect(h.afterCallbacks).toHaveLength(0)
    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('ignores an event with no order receipt — cannot link an account', async () => {
    h.ordersFetch.mockResolvedValue({ id: 'order_1', status: 'paid' })

    await run({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
    })

    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('ignores when the order carries no wacrmPlan note', async () => {
    h.planFromPaymentNotes.mockReturnValue(null)

    await run({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
    })

    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })

  it('ignores when no account is linked to the payment or receipt', async () => {
    h.findAccountByPayment.mockResolvedValue(null)
    h.findAccountById.mockResolvedValue(null)

    await run({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } },
    })

    expect(h.applyPaymentState).not.toHaveBeenCalled()
  })
})
