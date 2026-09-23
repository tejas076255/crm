import { NextResponse } from 'next/server'

import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/billing/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/cancel — revoke the account's paid plan (owner)
 *
 * One-time payments have no recurring charge to stop, so there is nothing
 * to call on Razorpay — cancelling is purely a local downgrade: the
 * service role flips the account back to `free` + `plan_status='cancelled'`
 * (the plan columns are REVOKEd from authenticated in migrations 040/042).
 * Safe to call with no paid plan; it's a no-op that still reports the
 * resulting state.
 */
export async function POST() {
  try {
    const { accountId } = await requireRole('owner')

    const ok = await supabaseAdmin()
      .from('accounts')
      .update({ plan: 'free', plan_status: 'cancelled', razorpay_payment_id: null })
      .eq('id', accountId)
      .select('id')
      .maybeSingle()
      .then(({ error }) => !error)

    if (!ok) {
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 })
    }

    return NextResponse.json({ success: true, plan: 'free' })
  } catch (err) {
    return toErrorResponse(err)
  }
}