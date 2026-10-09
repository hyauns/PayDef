-- Migration 031: probe state for shield domains (lib/shield-health.ts).
-- probe_up is the probe's own verdict (NULL = never probed); health_ok stays
-- the field the rest of the system reads and is written by the probe only in
-- SHIELD_HEALTH_MODE=enforce. Idempotent.
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_up BOOLEAN;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_error TEXT;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_checked_at TIMESTAMPTZ;
ALTER TABLE shield_domains ADD COLUMN IF NOT EXISTS probe_changed_at TIMESTAMPTZ;
