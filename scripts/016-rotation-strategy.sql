-- =============================================================================
-- Migration 016 — Rotation strategy on tenants
--
-- Adds:
--   • rotation_strategy  — ENUM: VOLUME, TIME, SEQUENTIAL (default: SEQUENTIAL)
--   • rotation_interval  — minutes between rotation for TIME strategy (default: 120)
--   • last_rotation_index — round-robin pointer for SEQUENTIAL strategy
--   • last_rotation_at   — timestamp of last rotation for TIME strategy
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS rotation_strategy    TEXT NOT NULL DEFAULT 'SEQUENTIAL',
  ADD COLUMN IF NOT EXISTS rotation_interval    INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS last_rotation_index  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rotation_at     TIMESTAMPTZ DEFAULT NOW();
