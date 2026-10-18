import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/signup — Server-side signup proxy
 *
 * Prevents "Failed to fetch" caused by browser ad-blockers, Brave Shields,
 * or cross-origin restrictions blocking direct client calls to *.supabase.co.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = body?.email
    const password = body?.password
    const fullName = body?.fullName
    const inviteToken = body?.inviteToken

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const emailRedirectTo = inviteToken
      ? `${new URL(request.url).origin}/join/${encodeURIComponent(inviteToken)}`
      : undefined

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || '',
        },
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    let activeSession = data.session

    // If auto-confirm is enabled and a user is created, log in to establish server session cookies
    if (data.user && !activeSession) {
      const signInRes = await supabase.auth.signInWithPassword({
        email,
        password,
      }).catch(() => null)
      if (signInRes?.data?.session) {
        activeSession = signInRes.data.session
      }
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      session: activeSession,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
