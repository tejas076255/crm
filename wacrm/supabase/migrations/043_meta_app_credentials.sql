-- ============================================================
-- 043_meta_app_credentials — store Meta App ID and Meta App Secret
--
-- Allows storing Meta App ID and Meta App Secret directly in
-- the `whatsapp_config` table (configured via Settings UI)
-- instead of requiring `.env.local` server environment variables.
--
-- `meta_app_secret` is stored AES-256-GCM encrypted using the
-- application's ENCRYPTION_KEY (same as access_token).
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS meta_app_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

COMMENT ON COLUMN whatsapp_config.meta_app_id IS 'Meta App ID (from Meta for Developers -> App Settings -> Basic). Used for resumable media upload in template image headers.';
COMMENT ON COLUMN whatsapp_config.meta_app_secret IS 'AES-256-GCM encrypted Meta App Secret. Used to verify HMAC-SHA256 signature on inbound webhooks.';
