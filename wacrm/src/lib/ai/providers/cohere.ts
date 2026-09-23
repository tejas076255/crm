import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const COHERE_URL = 'https://api.cohere.com/v2/chat'

interface CohereResponse {
  message?: {
    content?: Array<{ type?: string; text?: string }>
  }
  usage?: {
    tokens?: {
      input_tokens?: number
      output_tokens?: number
    }
  }
}

/**
 * Call Cohere's v2 Chat endpoint with the caller's own key.
 * Returns the raw assistant text + token usage (handoff parsing happens in `generateReply`).
 */
export async function generateCohere(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...mergeConsecutive(messages).map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ]

    res = await fetch(COHERE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Cohere', res)
  }

  const data = (await res.json().catch(() => null)) as CohereResponse | null
  const text = data?.message?.content
    ?.filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('')
    .trim()

  if (!text) {
    throw new AiError('Cohere returned an empty response.', {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.tokens?.input_tokens,
    completion: data?.usage?.tokens?.output_tokens,
  })

  return { text, usage }
}
