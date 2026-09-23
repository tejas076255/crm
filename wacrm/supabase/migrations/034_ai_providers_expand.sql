-- ============================================================
-- 034_ai_providers_expand.sql
-- Expand AI provider support beyond OpenAI and Anthropic.
-- Supports Google Gemini, OpenRouter, Groq, DeepSeek, Mistral,
-- xAI (Grok), Cohere, and Custom OpenAI-compatible / Ollama endpoints.
-- ============================================================

-- Drop restrictive provider check constraints so any supported AI provider is allowed
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;

-- Optional base_url for custom OpenAI-compatible endpoints / Ollama / self-hosted LLMs
ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url text;
