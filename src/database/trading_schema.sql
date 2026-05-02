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
    partner_status VARCHAR(30),
    partner_warned_at TIMESTAMP,
    disqualified BOOLEAN DEFAULT false,
    disqualified_at TIMESTAMP,
    disqualified_reason TEXT,
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
    screenshot_link TEXT,
    screenshot_message_id INTEGER,
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
    allocation_recoveries INTEGER DEFAULT 0,
    kyc_recoveries INTEGER DEFAULT 0,
    real_acct_recoveries INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, date)
);

-- Indexes for trading tables
CREATE INDEX IF NOT EXISTS idx_tc_status ON trading_challenges(status);

-- Failed attempts tracking (for re-engagement)
CREATE TABLE IF NOT EXISTS trading_failed_attempts (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    username VARCHAR(255),
    email VARCHAR(500),
    failure_type VARCHAR(30) NOT NULL,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    engaged BOOLEAN DEFAULT false,
    engage_count INTEGER DEFAULT 0,
    last_engaged_at TIMESTAMP,
    engage_successful BOOLEAN DEFAULT false,
    converted BOOLEAN DEFAULT false,
    converted_at TIMESTAMP,
    UNIQUE(challenge_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_tfa_challenge ON trading_failed_attempts(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tfa_type ON trading_failed_attempts(failure_type);

-- Screening results (daily partner check logs)
CREATE TABLE IF NOT EXISTS trading_screening_results (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    screening_date DATE NOT NULL,
    screening_mode VARCHAR(10) DEFAULT 'night',
    total_screened INTEGER DEFAULT 0,
    all_good INTEGER DEFAULT 0,
    changing_real INTEGER DEFAULT 0,
    changing_demo INTEGER DEFAULT 0,
    left_real INTEGER DEFAULT 0,
    left_demo INTEGER DEFAULT 0,
    warnings_cleared INTEGER DEFAULT 0,
    missed INTEGER DEFAULT 0,
    uids_backfilled INTEGER DEFAULT 0,
    changing_users JSONB,
    left_users JSONB,
    cleared_users JSONB,
    report_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, screening_date, screening_mode)
);

CREATE INDEX IF NOT EXISTS idx_tc_dates ON trading_challenges(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tr_challenge ON trading_registrations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tr_telegram ON trading_registrations(telegram_id);
CREATE INDEX IF NOT EXISTS idx_tr_email ON trading_registrations(email);
CREATE INDEX IF NOT EXISTS idx_ts_challenge ON trading_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tw_challenge ON trading_winners(challenge_id);
CREATE INDEX IF NOT EXISTS idx_tds_challenge_date ON trading_daily_stats(challenge_id, date);

-- Trading Evaluations table (stores evaluation results for submissions)
CREATE TABLE IF NOT EXISTS trading_evaluations (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    registration_id INTEGER,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(10) NOT NULL,
    username VARCHAR(255),
    telegram_id BIGINT NOT NULL,
    email VARCHAR(500),
    file_id TEXT NOT NULL,
    file_message_id INTEGER,
    reported_balance DECIMAL(12, 2) NOT NULL,
    adjusted_balance DECIMAL(12, 2) NOT NULL,
    total_trades INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    profit_removed DECIMAL(12, 2) DEFAULT 0,
    is_qualified BOOLEAN DEFAULT false,
    is_disqualified BOOLEAN DEFAULT false,
    is_test BOOLEAN DEFAULT false,
    disqualify_reason TEXT,
    short_report TEXT,
    full_report TEXT,
    flagged_details JSONB,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, account_number)
);

-- Trading Evaluations Test table (identical structure for testing)
CREATE TABLE IF NOT EXISTS trading_evaluations_test (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER,
    registration_id INTEGER,
    account_number VARCHAR(50) NOT NULL,
    account_type VARCHAR(10) NOT NULL,
    username VARCHAR(255),
    telegram_id BIGINT NOT NULL,
    email VARCHAR(500),
    file_id TEXT NOT NULL,
    file_message_id INTEGER,
    reported_balance DECIMAL(12, 2) NOT NULL,
    adjusted_balance DECIMAL(12, 2) NOT NULL,
    total_trades INTEGER DEFAULT 0,
    flagged_count INTEGER DEFAULT 0,
    profit_removed DECIMAL(12, 2) DEFAULT 0,
    is_qualified BOOLEAN DEFAULT false,
    is_disqualified BOOLEAN DEFAULT false,
    is_test BOOLEAN DEFAULT true,
    disqualify_reason TEXT,
    short_report TEXT,
    full_report TEXT,
    flagged_details JSONB,
    evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_te_challenge ON trading_evaluations(challenge_id);
CREATE INDEX IF NOT EXISTS idx_te_account ON trading_evaluations(account_number);
CREATE INDEX IF NOT EXISTS idx_te_qualified ON trading_evaluations(challenge_id, is_qualified);
