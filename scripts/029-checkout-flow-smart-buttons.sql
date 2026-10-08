-- 029-checkout-flow-smart-buttons.sql
-- Allows the per-store PayPal Smart Buttons (iframe) checkout flow.
-- Widening only: every existing row (REDIRECT / POPUP_BRIDGE / NULL) stays valid.

ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_checkout_flow_check;

ALTER TABLE stores
  ADD CONSTRAINT stores_checkout_flow_check
  CHECK (checkout_flow IN ('REDIRECT', 'POPUP_BRIDGE', 'SMART_BUTTONS'));
