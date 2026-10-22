-- Operational reads exclude replaced/removed registrations, but retain DQ accounts.
-- Base tables remain the write targets and retain historical evidence.
CREATE OR REPLACE VIEW wp_current_registrations AS
  SELECT * FROM trading_registrations WHERE status IS DISTINCT FROM 'removed';
CREATE OR REPLACE VIEW wp_current_trades AS
  SELECT t.* FROM wp_trades t JOIN wp_current_registrations r
    ON r.id=t.registration_id AND r.challenge_id=t.challenge_id;
CREATE OR REPLACE VIEW wp_current_leaderboard AS
  SELECT l.* FROM wp_leaderboard l JOIN wp_current_registrations r
    ON r.id=l.registration_id AND r.challenge_id=l.challenge_id;
