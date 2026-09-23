import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs } from './defaults'
import {
  generateOpenAi,
  PROVIDER_ENDPOINTS,
} from './providers/openai'
import { generateAnthropic } from './providers/anthropic'
import { generateCohere } from './providers/cohere'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
}

/**
 * Normalizes custom endpoint URL (appends /chat/completions if needed).
 */
export function resolveCustomEndpoint(baseUrl?: string | null): string {
  if (!baseUrl || !baseUrl.trim()) {
    return 'http://localhost:11434/v1/chat/completions'
  }
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages } = args
  const timeoutMs = aiRequestTimeoutMs()
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
  }

  let result: { text: string; usage: AiUsage | null }
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs)
      break
    case 'anthropic':
      result = await generateAnthropic(providerArgs)
      break
    case 'gemini':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.gemini,
        providerName: 'Google Gemini',
      })
      break
    case 'openrouter':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.openrouter,
        providerName: 'OpenRouter',
        headers: {
          'HTTP-Referer': 'https://wacrm.com',
          'X-Title': 'WACRM',
        },
      })
      break
    case 'groq':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.groq,
        providerName: 'Groq',
      })
      break
    case 'deepseek':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.deepseek,
        providerName: 'DeepSeek',
      })
      break
    case 'mistral':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.mistral,
        providerName: 'Mistral AI',
      })
      break
    case 'xai':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: PROVIDER_ENDPOINTS.xai,
        providerName: 'xAI (Grok)',
      })
      break
    case 'cohere':
      result = await generateCohere(providerArgs)
      break
    case 'custom':
      result = await generateOpenAi(providerArgs, {
        endpointUrl: resolveCustomEndpoint(config.baseUrl),
        providerName: 'Custom AI',
      })
      break
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      })
  }

  return parseGeneration(result.text, result.usage)
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null,
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  const text = raw.split(HANDOFF_SENTINEL).join('').trim()
  return { text, handoff, usage }
}
