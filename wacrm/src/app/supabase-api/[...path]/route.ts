import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_TARGET =
  process.env.SUPABASE_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://nlchiauveooekcdywbgx.supabase.co'

/**
 * Universal reverse-proxy for Supabase APIs.
 *
 * Prevents "Failed to fetch" errors caused by regional ISP DNS blocks (e.g. Jio,
 * Airtel, Vi in India), corporate firewalls, Brave Shields, and ad-blockers that
 * block direct client-side handshakes to `*.supabase.co`.
 *
 * All client-side requests route to `/supabase-api/*` (same-origin), which this
 * Cloudflare Worker handler seamlessly relays to Supabase.
 */
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
) {
  try {
    const { path = [] } = await context.params
    const targetPath = '/' + path.join('/')
    const incomingUrl = new URL(request.url)
    const targetUrl = new URL(targetPath + incomingUrl.search, SUPABASE_TARGET)

    // Clone headers and remove host/connection hop headers
    const reqHeaders = new Headers(request.headers)
    reqHeaders.delete('host')
    reqHeaders.delete('connection')

    const hasBody =
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.method !== 'OPTIONS'
    const body = hasBody ? await request.arrayBuffer() : undefined

    const upstreamRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: reqHeaders,
      body,
      redirect: 'manual',
    })

    const resHeaders = new Headers(upstreamRes.headers)
    // Guarantee CORS headers so client fetch never gets blocked
    resHeaders.set('Access-Control-Allow-Origin', '*')
    resHeaders.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    )
    resHeaders.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, apikey, x-client-info, prefer',
    )

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Proxy fetch failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const HEAD = proxy

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods':
        'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, apikey, x-client-info, prefer',
      'Access-Control-Max-Age': '86400',
    },
  })
}
