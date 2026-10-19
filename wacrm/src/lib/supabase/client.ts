import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

const SEVEN_DAYS_IN_SECONDS = 604800 // 7 days

export function createClient() {
  if (browserClient) return browserClient

  // Clean up any legacy or mismatched cookies from previous proxy configs
  if (typeof document !== 'undefined' && document.cookie.includes('sb-crm-auth-token=')) {
    try {
      document.cookie =
        'sb-crm-auth-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=lax;'
    } catch {
      // Ignore in non-standard environments
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  browserClient = createBrowserClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: SEVEN_DAYS_IN_SECONDS,
        path: '/',
        sameSite: 'lax',
      },
      global: {
        fetch: (input, init) => {
          let url =
            typeof input === 'string'
              ? input
              : input instanceof URL
              ? input.toString()
              : input.url

          // In browser, route all direct Supabase traffic through the same-origin reverse-proxy
          if (typeof window !== 'undefined' && url.includes('.supabase.co')) {
            try {
              const parsed = new URL(url)
              url = `${window.location.origin}/supabase-api${parsed.pathname}${parsed.search}`
            } catch {
              // fallback to original url if parsing fails
            }
          }

          if (
            typeof input === 'object' &&
            input !== null &&
            'url' in input &&
            !(input instanceof URL)
          ) {
            return fetch(new Request(url, input), init)
          }

          return fetch(url, init)
        },
      },
    }
  )

  return browserClient
}
