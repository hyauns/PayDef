-- =============================================================================
-- Migration 017 — Capture mode on stores
--
-- Adds capture_mode column to the stores table.
-- Values: 'INSTANT' (default) or 'MANUAL'
--
-- When MANUAL, the checkout API sets PayPal intent to AUTHORIZE instead of
-- CAPTURE, and the merchant must manually capture from the dashboard.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS capture_mode TEXT NOT NULL DEFAULT 'INSTANT';
