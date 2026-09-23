import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

export const PROVIDER_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
}

export const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  deepseek: 'DeepSeek',
  mistral: 'Mistral AI',
  xai: 'xAI (Grok)',
  cohere: 'Cohere',
  custom: 'Custom AI',
}

export interface OpenAiCompatibleOptions {
  endpointUrl?: string
  providerName?: string
  headers?: Record<string, string>
}

interface OpenAiResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * Call OpenAI or any OpenAI-compatible Chat Completions endpoint
 * with the caller's own key. Returns the raw assistant text + token usage.
 */
export async function generateOpenAi(
  args: ProviderArgs,
  options?: OpenAiCompatibleOptions,
): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args
  const endpoint = options?.endpointUrl || OPENAI_URL
  const providerLabel = options?.providerName || 'OpenAI'

  // Reasoning models (o1, o3, gpt-5) use max_completion_tokens;
  // standard models and OpenAI-compatible providers use max_tokens.
  const isReasoningModel =
    model.startsWith('o1') || model.startsWith('o3') || model.startsWith('gpt-5')
  const tokenPayload = isReasoningModel
    ? { max_completion_tokens: MAX_OUTPUT_TOKENS }
    : { max_tokens: MAX_OUTPUT_TOKENS }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        ...tokenPayload,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError(providerLabel, res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(`${providerLabel} returned an empty response.`, {
      code: 'empty_response',
    })
  }
  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })
  return { text, usage }
}
