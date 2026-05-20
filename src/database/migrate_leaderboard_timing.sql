-- Migration: Add leaderboard_updated_at to trading_challenges
-- Required for the new leaderboard timing logic (update at start of next cycle)

ALTER TABLE trading_challenges
ADD COLUMN IF NOT EXISTS leaderboard_updated_at TIMESTAMP;

-- Add comment for clarity
COMMENT ON COLUMN trading_challenges.leaderboard_updated_at IS 'When leaderboard rankings were last recalculated';
