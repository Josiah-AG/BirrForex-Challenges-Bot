-- Trading Challenges Database Schema
-- Completely separate from weekly quiz tables

-- Trading Challenges table
CREATE TABLE IF NOT EXISTS trading_challenges (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('demo', 'real', 'hybrid')),
    status VARCHAR(30) DEFAULT 'draft',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    starting_balance DECIMAL(10, 2) NOT NULL,
    target_balance DECIMAL(10, 2) NOT NULL,
    pdf_url TEXT,
    video_url TEXT,
    real_winners_count INTEGER DEFAULT 0,
    demo_winners_count INTEGER DEFAULT 0,
    real_prizes JSONB,
    demo_prizes JSONB,
    prize_pool_text TEXT,
    announcement_posted BOOLEAN DEFAULT false,
    submission_deadline TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trading Registrations table
CREATE TABLE IF NOT EXISTS trading_registrations (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    username VARCHAR(255),
    account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('demo', 'real')),
    email VARCHAR(500) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    mt5_server VARCHAR(100),
    client_uid VARCHAR(100),
    status VARCHAR(30) DEFAULT 'registered',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, telegram_id),
    UNIQUE(challenge_id, email)
);

-- Trading Submissions table (post-challenge results)
CREATE TABLE IF NOT EXISTS trading_submissions (
    id SERIAL PRIMARY KEY,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    final_balance DECIMAL(10, 2) NOT NULL,
    balance_screenshot_file_id TEXT,
    investor_password VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(registration_id)
);

-- Trading Winners table
CREATE TABLE IF NOT EXISTS trading_winners (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES trading_registrations(id) ON DELETE CASCADE,
    category VARCHAR(10) NOT NULL CHECK (category IN ('demo', 'real')),
    position INTEGER NOT NULL,
    prize_amount VARCHAR(100) NOT NULL,
    claimed BOOLEAN DEFAULT false,
    claimed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trading Daily Stats (for admin registration summaries)
CREATE TABLE IF NOT EXISTS trading_daily_stats (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    new_registrations INTEGER DEFAULT 0,
    demo_registrations INTEGER DEFAULT 0,
    real_registrations INTEGER DEFAULT 0,
    allocation_failures INTEGER DEFAULT 0,
    kyc_failures INTEGER DEFAULT 0,
    real_acct_failures INTEGER DEFAULT 0,
    manual_reviews INTEGER DEFAULT 0,
    account_changes INTEGER DEFAULT 0,
    category_switches INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, date)
);

-- Indexes for trading tables
CREATE INDEX IF NOT EXISTS idx_tc_status ON trading_challenges(status);
CREATE INDEX IF NOT EXISTS idx_tc_dates ON trading_challenges(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tr_challenge ON trading_registrations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tr_telegram ON trading_registrations(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tr_email ON trading_registrations(email);
CREATE INDEX IF NOT EXISTS idx_ts_challenge ON trading_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tw_challenge ON trading_winners(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tds_challenge_date ON trading_daily_stats(challenge_id, date);
