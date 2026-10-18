import { PLAN_PRICE_PAISE } from './config'
import type { Plan } from '@/lib/auth/plans'

export const YOUPI_BASE_URL =
  process.env.NEXT_PUBLIC_YOUPI_URL || 'https://youpi.tejasgogavale5.workers.dev'

export const YOUPI_MERCHANT_ID =
  process.env.YOUPI_MERCHANT_ID || '00000000-0000-0000-0000-000000000001'

export interface YoupiCreatePaymentResponse {
  paymentId: string
  orderId: string
  amount: string
  amountPaise: number
  currency: string
  status: string
  vpa?: string
  payeeName?: string
  upiUri?: string
  checkoutUrl: string
}

export interface YoupiPaymentDetails {
  paymentId: string
  orderId: string
  amount: string
  amountPaise: number
  currency: string
  status: 'INITIATED' | 'SUCCESS' | 'EXPIRED' | 'FAILED'
  utr?: string
  completedAt?: string
  metadata?: {
    plan?: Plan
    accountId?: string
    wacrmPlan?: Plan
    [key: string]: unknown
  }
}

/**
 * Creates a payment session on Youpi PG for a billable CRM plan (pro / pro_max).
 */
export async function createYoupiPayment(args: {
  plan: 'pro' | 'pro_max'
  accountId: string
  returnUrl?: string
}): Promise<YoupiCreatePaymentResponse> {
  const { plan, accountId, returnUrl } = args
  const paise = PLAN_PRICE_PAISE[plan]
  const amountRupees = (paise / 100).toFixed(2)
  const orderId = `WACRM-${accountId.slice(0, 8)}-${plan}-${Date.now()}`

  const res = await fetch(`${YOUPI_BASE_URL}/api/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Id': YOUPI_MERCHANT_ID,
    },
    body: JSON.stringify({
      orderId,
      amount: amountRupees,
      currency: 'INR',
      returnUrl: returnUrl || '',
      metadata: {
        plan,
        accountId,
        wacrmPlan: plan,
      },
    }),
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    throw new Error(`Failed to create Youpi payment: ${res.status} ${errorText}`)
  }

  return (await res.json()) as YoupiCreatePaymentResponse
}

/**
 * Fetches status and details of a payment by its paymentId from Youpi Edge D1.
 */
export async function fetchYoupiPayment(paymentId: string): Promise<YoupiPaymentDetails> {
  const res = await fetch(`${YOUPI_BASE_URL}/api/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch payment details: ${res.statusText}`)
  }

  return (await res.json()) as YoupiPaymentDetails
}
