import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   `META_APP_SECRET` is **required**. If it's missing we fail closed —
 *   every request is rejected until the operator configures the
 *   secret. A previous version fell open with a warning log, which is
 *   unsafe for a public template: anyone who forgets the env var would
 *   be running a fully spoofable webhook.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  candidateSecrets?: string[],
): boolean {
  const secrets: string[] = []

  if (candidateSecrets && candidateSecrets.length > 0) {
    for (const s of candidateSecrets) {
      if (s && !secrets.includes(s)) secrets.push(s)
    }
  }

  const envSecret = process.env.META_APP_SECRET
  if (envSecret && !secrets.includes(envSecret)) {
    secrets.push(envSecret)
  }

  if (secrets.length === 0) {
    console.error(
      '[webhook] No Meta App Secret found (neither in DB nor in META_APP_SECRET env) — rejecting request. ' +
        'Configure the secret in Settings → WhatsApp Configuration or set META_APP_SECRET in environment variables.',
    )
    return false
  }

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  for (const secret of secrets) {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

    const a = Buffer.from(signatureHeader)
    const b = Buffer.from(expected)

    // Bail if lengths differ — timingSafeEqual throws otherwise.
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true
    }
  }

  return false
}
