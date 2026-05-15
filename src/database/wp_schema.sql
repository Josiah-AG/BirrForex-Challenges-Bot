-- ============================================================
-- WinnerPip Schema — Real-time Trade Monitoring & Leaderboard
-- Run this ONCE on your Railway PostgreSQL database
-- ============================================================

-- 1. Add new columns to existing trading_registrations table
ALTER TABLE trading_registrations 
  ADD COLUMN IF NOT EXISTS investor_password TEXT,
  ADD COLUMN IF NOT EXISTS connection_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS connection_verified_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_pull_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS pull_status VARCHAR(20) DEFAULT 'never_pulled',
  ADD COLUMN IF NOT EXISTS pull_error TEXT;

-- 2. Pull Batches — Log of each VPS pull run
CREATE TABLE IF NOT EXISTS wp_pull_batches (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    total_accounts INTEGER DEFAULT 0,
    successful INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    new_trades_found INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',
    error_log TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Pull Errors — Individual account pull failures
CREATE TABLE IF NOT EXISTS wp_pull_errors (
    id SERIAL PRIMARY KEY,
    pull_batch_id INTEGER REFERENCES wp_pull_batches(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Trades — Every closed trade pulled from MT5
CREATE TABLE IF NOT EXISTS wp_trades (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    ticket BIGINT NOT NULL,
    symbol VARCHAR(50),
    trade_type VARCHAR(10),
    volume DECIMAL(10,4),
    open_time TIMESTAMP,
    close_time TIMESTAMP,
    open_price DECIMAL(15,6),
    close_price DECIMAL(15,6),
    stop_loss DECIMAL(15,6),
    take_profit DECIMAL(15,6),
    profit DECIMAL(12,2) DEFAULT 0,
    commission DECIMAL(12,2) DEFAULT 0,
    swap DECIMAL(12,2) DEFAULT 0,
    comment TEXT,
    is_qualified BOOLEAN DEFAULT true,
    violations JSONB DEFAULT '[]',
    pull_batch_id INTEGER REFERENCES wp_pull_batches(id),
    synced_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(challenge_id, account_number, ticket)
);

-- 5. Deals — Raw MT5 deals (balance operations, deposits, withdrawals, trades)
CREATE TABLE IF NOT EXISTS wp_deals (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    ticket BIGINT NOT NULL,
    deal_type VARCHAR(20),
    symbol VARCHAR(50),
    direction VARCHAR(10),
    volume DECIMAL(10,4) DEFAULT 0,
    price DECIMAL(15,6) DEFAULT 0,
    profit DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    comment TEXT,
    time TIMESTAMP,
    pull_batch_id INTEGER REFERENCES wp_pull_batches(id),
    synced_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(challenge_id, account_number, ticket)
);

-- 6. Leaderboard — Current standings (updated after each evaluation)
CREATE TABLE IF NOT EXISTS wp_leaderboard (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    telegram_id BIGINT,
    username VARCHAR(255),
    account_type VARCHAR(10) NOT NULL,
    rank INTEGER,
    starting_balance DECIMAL(12,2) DEFAULT 0,
    current_balance DECIMAL(12,2) DEFAULT 0,
    adjusted_balance DECIMAL(12,2) DEFAULT 0,
    qualified_profit DECIMAL(12,2) DEFAULT 0,
    gross_profit DECIMAL(12,2) DEFAULT 0,
    profit_removed DECIMAL(12,2) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    qualified_trades INTEGER DEFAULT 0,
    flagged_trades INTEGER DEFAULT 0,
    active_days INTEGER DEFAULT 0,
    is_qualified BOOLEAN DEFAULT false,
    is_disqualified BOOLEAN DEFAULT false,
    disqualify_reason TEXT,
    last_trade_time TIMESTAMP,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(challenge_id, registration_id)
);

-- 7. Challenge Rules — Configurable rules per challenge
CREATE TABLE IF NOT EXISTS wp_challenge_rules (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    rule_code VARCHAR(50) NOT NULL,
    rule_label VARCHAR(200) NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    penalty VARCHAR(20) DEFAULT 'flag',
    order_number INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================

-- Trades
CREATE INDEX IF NOT EXISTS idx_wp_trades_challenge ON wp_trades(challenge_id);
CREATE INDEX IF NOT EXISTS idx_wp_trades_registration ON wp_trades(registration_id);
CREATE INDEX IF NOT EXISTS idx_wp_trades_account ON wp_trades(account_number);
CREATE INDEX IF NOT EXISTS idx_wp_trades_close_time ON wp_trades(close_time);
CREATE INDEX IF NOT EXISTS idx_wp_trades_qualified ON wp_trades(challenge_id, is_qualified);

-- Deals
CREATE INDEX IF NOT EXISTS idx_wp_deals_challenge ON wp_deals(challenge_id);
CREATE INDEX IF NOT EXISTS idx_wp_deals_registration ON wp_deals(registration_id);
CREATE INDEX IF NOT EXISTS idx_wp_deals_account ON wp_deals(account_number);
CREATE INDEX IF NOT EXISTS idx_wp_deals_time ON wp_deals(time);

-- Leaderboard
CREATE INDEX IF NOT EXISTS idx_wp_leaderboard_challenge ON wp_leaderboard(challenge_id);
CREATE INDEX IF NOT EXISTS idx_wp_leaderboard_rank ON wp_leaderboard(challenge_id, account_type, rank);
CREATE INDEX IF NOT EXISTS idx_wp_leaderboard_telegram ON wp_leaderboard(telegram_id);

-- Pull batches
CREATE INDEX IF NOT EXISTS idx_wp_pull_batches_challenge ON wp_pull_batches(challenge_id);
CREATE INDEX IF NOT EXISTS idx_wp_pull_batches_status ON wp_pull_batches(status);

-- Pull errors
CREATE INDEX IF NOT EXISTS idx_wp_pull_errors_batch ON wp_pull_errors(pull_batch_id);
CREATE INDEX IF NOT EXISTS idx_wp_pull_errors_registration ON wp_pull_errors(registration_id);

-- Challenge rules
CREATE INDEX IF NOT EXISTS idx_wp_challenge_rules_challenge ON wp_challenge_rules(challenge_id);

-- Registration pull status
CREATE INDEX IF NOT EXISTS idx_trading_reg_pull_status ON trading_registrations(pull_status);
CREATE INDEX IF NOT EXISTS idx_trading_reg_connection ON trading_registrations(connection_verified);
