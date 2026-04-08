ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS status_label TEXT;

UPDATE stores
SET platform = COALESCE(NULLIF(TRIM(platform), ''), 'Custom API')
WHERE platform IS NULL OR TRIM(platform) = '';

UPDATE stores
SET status_label = CASE
  WHEN is_active = FALSE THEN 'Suspended'
  ELSE COALESCE(NULLIF(TRIM(status_label), ''), 'Trial')
END
WHERE status_label IS NULL OR TRIM(status_label) = '';

ALTER TABLE stores
  ALTER COLUMN platform SET DEFAULT 'Custom API';

ALTER TABLE stores
  ALTER COLUMN status_label SET DEFAULT 'Trial';

ALTER TABLE stores
  DROP CONSTRAINT IF EXISTS stores_status_label_check;

ALTER TABLE stores
  ADD CONSTRAINT stores_status_label_check
  CHECK (status_label IN ('Active', 'Trial', 'Suspended'));
