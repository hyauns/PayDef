-- =============================================================================
-- Migration 014 — Telegram notification config on tenants
--
-- Adds:
--   • telegram_bot_token  — Telegram Bot API token (from @BotFather)
--   • telegram_chat_id    — Target chat/group ID for notifications
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id   TEXT;
