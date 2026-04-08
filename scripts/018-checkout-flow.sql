-- 018-checkout-flow.sql
-- Adds per-store checkout presentation mode.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS checkout_flow TEXT;

UPDATE stores
SET checkout_flow = 'REDIRECT'
WHERE checkout_flow IS NULL;

ALTER TABLE stores
  ALTER COLUMN checkout_flow SET DEFAULT 'REDIRECT';

ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_checkout_flow_check;

ALTER TABLE stores
  ADD CONSTRAINT stores_checkout_flow_check
  CHECK (checkout_flow IN ('REDIRECT', 'POPUP_BRIDGE'));
