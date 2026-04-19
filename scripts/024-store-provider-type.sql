ALTER TABLE stores
ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'PAYPAL';

UPDATE stores
SET provider_type = 'PAYPAL'
WHERE provider_type IS NULL;

ALTER TABLE transactions
ALTER COLUMN merchant_id DROP NOT NULL;
