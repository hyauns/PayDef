-- =============================================================================
-- Migration: System Settings — key-value config store for gateway settings
--
-- Stores global configuration (rotation rules, Telegram alerts, security,
-- gateway controls, and platform API key).
-- Safe to re-run: uses IF NOT EXISTS + ON CONFLICT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default settings (no-op if already present)
INSERT INTO system_settings (key, value) VALUES
  ('rotation_rules',    '{"defaultDailyLimit": 5000, "alertThreshold": 90, "rotationStrategy": "weighted_random"}'::jsonb),
  ('telegram',          '{"botToken": "", "chatId": ""}'::jsonb),
  ('security',          '{"priceRevalidation": true, "ipWhitelist": ""}'::jsonb),
  ('gateway_controls',  '{"rotationEnabled": true, "maintenanceMode": false}'::jsonb),
  ('gateway_api_key',   '{"key": ""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
