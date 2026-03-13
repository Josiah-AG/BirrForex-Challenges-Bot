-- Add challenge_time column to challenges table
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS challenge_time TIME DEFAULT '20:00:00';

-- Update existing challenges to have default time
UPDATE challenges SET challenge_time = '20:00:00' WHERE challenge_time IS NULL;
