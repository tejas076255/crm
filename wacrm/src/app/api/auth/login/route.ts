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
 * POST /api/auth/login — Server-side login proxy
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = body?.email
    const password = body?.password

    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: CORS_HEADERS },
      )
    }

    return NextResponse.json(
      {
        success: true,
        user: data.user,
        session: data.session,
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
