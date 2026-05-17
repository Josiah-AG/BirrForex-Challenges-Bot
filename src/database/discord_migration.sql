-- Discord Integration Migration
-- Adds support for challenges created from Discord bot

-- Add source tracking to trading_challenges
ALTER TABLE trading_challenges 
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS team_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMP,
  ADD COLUMN IF NOT EXISTS discord_channel_message_id VARCHAR(50);

-- Add discord_user_id to trading_registrations (links Discord member to registration)
ALTER TABLE trading_registrations
  ADD COLUMN IF NOT EXISTS discord_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'telegram';

-- Index for Discord lookups
CREATE INDEX IF NOT EXISTS idx_tc_source ON trading_challenges(source);
CREATE INDEX IF NOT EXISTS idx_tc_team_only ON trading_challenges(team_only);
CREATE INDEX IF NOT EXISTS idx_tr_discord_user ON trading_registrations(discord_user_id);
