import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

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
        { status: 400, headers: CORS_HEADERS },
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400, headers: CORS_HEADERS },
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
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: CORS_HEADERS },
      )
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

    return NextResponse.json(
      {
        success: true,
        user: data.user,
        session: activeSession,
      },
      { headers: CORS_HEADERS },
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
