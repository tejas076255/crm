import { describe, expect, it, vi, beforeEach } from 'vitest'

// `setAccountPlan` is the only side effect — stub it so the pure state
// mapping above it is what the tests exercise.
const h = vi.hoisted(() => ({
  setAccountPlan: vi.fn(),
}))

vi.mock('./admin', () => ({
  setAccountPlan: h.setAccountPlan,
}))

import {
  applyPaymentState,
  paymentIsCaptured,
  planFromPaymentNotes,
} from './payment-state'

beforeEach(() => {
  vi.clearAllMocks()
  h.setAccountPlan.mockResolvedValue(true)
})

describe('planFromPaymentNotes', () => {
  it('reads the wacrmPlan note for a billable tier', () => {
    expect(planFromPaymentNotes({ wacrmPlan: 'pro' })).toBe('pro')
    expect(planFromPaymentNotes({ wacrmPlan: 'pro_max' })).toBe('pro_max')
  })

  it('returns null for unknown / free / garbage tags', () => {
    expect(planFromPaymentNotes({ wacrmPlan: 'free' })).toBeNull()
    expect(planFromPaymentNotes({ wacrmPlan: 'enterprise' })).toBeNull()
    expect(planFromPaymentNotes({ wacrmPlan: 123 })).toBeNull()
  })

  it('returns null for missing notes', () => {
    expect(planFromPaymentNotes(undefined)).toBeNull()
    expect(planFromPaymentNotes(null)).toBeNull()
    expect(planFromPaymentNotes({})).toBeNull()
  })
})

describe('paymentIsCaptured', () => {
  it('accepts the two captured states', () => {
    expect(paymentIsCaptured('captured')).toBe(true)
    expect(paymentIsCaptured('paid')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(paymentIsCaptured('created')).toBe(false)
    expect(paymentIsCaptured('attempted')).toBe(false)
    expect(paymentIsCaptured('authorized')).toBe(false)
    expect(paymentIsCaptured('failed')).toBe(false)
    expect(paymentIsCaptured(undefined)).toBe(false)
  })
})

describe('applyPaymentState', () => {
  it('activates a captured payment with the tagged plan and stamps the payment id', async () => {
    const result = await applyPaymentState({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: 'pro',
      status: 'captured',
    })

    expect(result).toEqual({ ok: true, transition: 'activated → pro' })
    expect(h.setAccountPlan).toHaveBeenCalledWith('acc-1', {
      plan: 'pro',
      plan_status: 'active',
      razorpay_payment_id: 'pay_1',
    })
  })

  it('activates on a paid order without a payment id (order.paid event)', async () => {
    const result = await applyPaymentState({
      accountId: 'acc-1',
      plan: 'pro_max',
      status: 'paid',
    })

    expect(result).toEqual({ ok: true, transition: 'activated → pro_max' })
    expect(h.setAccountPlan).toHaveBeenCalledWith('acc-1', {
      plan: 'pro_max',
      plan_status: 'active',
    })
  })

  it('is a no-op for a non-captured status — account stays free', async () => {
    const result = await applyPaymentState({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: 'pro',
      status: 'authorized',
    })

    expect(result.ok).toBe(true)
    expect(h.setAccountPlan).not.toHaveBeenCalled()
  })

  it('refuses (not ok) when the money is in but the plan tag is missing', async () => {
    const result = await applyPaymentState({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: null,
      status: 'captured',
    })

    expect(result.ok).toBe(false)
    expect(h.setAccountPlan).not.toHaveBeenCalled()
  })

  it('reports a failed upgrade write as not-ok', async () => {
    h.setAccountPlan.mockResolvedValue(false)

    const result = await applyPaymentState({
      accountId: 'acc-1',
      paymentId: 'pay_1',
      plan: 'pro',
      status: 'captured',
    })

    expect(result.ok).toBe(false)
  })
})
