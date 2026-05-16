-- Migration: Add nickname, investor_password to registrations for WinnerPip flow
-- Also add nickname to wp_leaderboard

-- Add nickname column to trading_registrations (unique per challenge)
ALTER TABLE trading_registrations
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);

-- Add unique constraint for nickname per challenge (only if not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tr_challenge_nickname
  ON trading_registrations(challenge_id, nickname)
  WHERE nickname IS NOT NULL;

-- Add nickname to wp_leaderboard
ALTER TABLE wp_leaderboard
  ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);
