import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// decrypt is identity in tests so we don't depend on real ciphertext.
vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => `plain:${v}`,
}))

import { loadAiConfig, encodeDbModel, decodeDbModel } from './config'

function dbReturning(row: Record<string, unknown> | null): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  return chain as unknown as SupabaseClient
}

const ROW = {
  provider: 'openai',
  model: 'gpt-x',
  api_key: 'enc-key',
  system_prompt: null,
  is_active: false,
  auto_reply_enabled: false,
  auto_reply_max_per_conversation: 3,
  embeddings_api_key: null,
}

describe('loadAiConfig requireActive', () => {
  it('returns null for an inactive config by default', async () => {
    expect(await loadAiConfig(dbReturning(ROW), 'acct')).toBeNull()
  })

  it('returns the config when requireActive is false (Playground path)', async () => {
    const config = await loadAiConfig(dbReturning(ROW), 'acct', {
      requireActive: false,
    })
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('openai')
    expect(config!.apiKey).toBe('plain:enc-key')
  })

  it('returns null when there is no row', async () => {
    expect(
      await loadAiConfig(dbReturning(null), 'acct', { requireActive: false }),
    ).toBeNull()
  })

  it('decodes encoded provider and model seamlessly', async () => {
    const encodedRow = {
      ...ROW,
      provider: 'openai',
      model: 'gemini:gemini-2.5-flash',
    }
    const config = await loadAiConfig(dbReturning(encodedRow), 'acct', {
      requireActive: false,
    })
    expect(config).not.toBeNull()
    expect(config!.provider).toBe('gemini')
    expect(config!.model).toBe('gemini-2.5-flash')
  })
})

describe('encodeDbModel and decodeDbModel', () => {
  it('handles openai and anthropic natively', () => {
    expect(encodeDbModel('openai', 'gpt-4o')).toEqual({
      dbProvider: 'openai',
      dbModel: 'gpt-4o',
    })
    expect(decodeDbModel('openai', 'gpt-4o')).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      baseUrl: null,
    })

    expect(encodeDbModel('anthropic', 'claude-3-5-sonnet')).toEqual({
      dbProvider: 'anthropic',
      dbModel: 'claude-3-5-sonnet',
    })
    expect(decodeDbModel('anthropic', 'claude-3-5-sonnet')).toEqual({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      baseUrl: null,
    })
  })

  it('handles custom base URL endpoints', () => {
    const enc = encodeDbModel('custom', 'llama3.2', 'http://localhost:11434/v1')
    expect(enc.dbProvider).toBe('openai')
    expect(enc.dbModel).toContain('custom:')

    const dec = decodeDbModel(enc.dbProvider, enc.dbModel)
    expect(dec).toEqual({
      provider: 'custom',
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434/v1',
    })
  })

  it('handles all new providers with prefixes', () => {
    const providers = [
      'gemini',
      'openrouter',
      'groq',
      'deepseek',
      'mistral',
      'xai',
      'cohere',
    ] as const

    for (const p of providers) {
      const enc = encodeDbModel(p, 'sample-model')
      expect(enc.dbProvider).toBe('openai')
      expect(enc.dbModel).toBe(`${p}:sample-model`)

      const dec = decodeDbModel(enc.dbProvider, enc.dbModel)
      expect(dec.provider).toBe(p)
      expect(dec.model).toBe('sample-model')
      expect(dec.baseUrl).toBeNull()
    }
  })
})

