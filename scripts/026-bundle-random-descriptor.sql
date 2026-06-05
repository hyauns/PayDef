-- 026: Per-bundle opt-in for the order-traceable masked item name.
--
-- When TRUE, checkout (PayPal-rotation path only) builds the PayPal line-item
-- name as "#<orderId> <random descriptor> <last char of real product>", where
-- the descriptor is picked at random from THIS bundle's items (seeded by the
-- transaction id) and the return/cancel URLs use a randomly-picked shield domain
-- from the bundle's pool. Lets a merchant trace each order in PayPal and recreate
-- the exact product on a shield domain to lift a PayPal limit.
--
-- Default false → no behaviour change for existing bundles/tenants.

ALTER TABLE payment_identity_bundles
  ADD COLUMN IF NOT EXISTS use_random_descriptor BOOLEAN NOT NULL DEFAULT false;
