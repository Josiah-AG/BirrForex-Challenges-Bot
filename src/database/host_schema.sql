-- ============================================================
-- Host Mode Schema — Multi-tenant challenge hosting
-- ============================================================

-- Hosts table — stores host accounts
CREATE TABLE IF NOT EXISTS hosts (
    id SERIAL PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(500) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    has_broker_integration BOOLEAN DEFAULT false,
    broker_email_encrypted TEXT,
    broker_password_encrypted TEXT,
    broker_api_key_encrypted TEXT,
    encryption_iv VARCHAR(64),
    active BOOLEAN DEFAULT true,
    max_concurrent_challenges INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP
);

-- Host login history — audit trail
CREATE TABLE IF NOT EXISTS host_login_history (
    id SERIAL PRIMARY KEY,
    host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
    login_at TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hosts_email ON hosts(email);
CREATE INDEX IF NOT EXISTS idx_hosts_active ON hosts(active);
CREATE INDEX IF NOT EXISTS idx_host_login_history_host ON host_login_history(host_id);
CREATE INDEX IF NOT EXISTS idx_host_login_history_time ON host_login_history(login_at);

-- CSV uploads — pending participant data uploaded by host
CREATE TABLE IF NOT EXISTS host_csv_uploads (
    id SERIAL PRIMARY KEY,
    host_id INTEGER REFERENCES hosts(id) ON DELETE CASCADE,
    challenge_id INTEGER REFERENCES trading_challenges(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    total_rows INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    uploaded_at TIMESTAMP DEFAULT NOW(),
    approved_at TIMESTAMP,
    processed_at TIMESTAMP
);

-- CSV rows — individual participant entries from the upload
CREATE TABLE IF NOT EXISTS host_csv_rows (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES host_csv_uploads(id) ON DELETE CASCADE,
    nickname VARCHAR(30) NOT NULL,
    account_type VARCHAR(10) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    mt5_server VARCHAR(100) NOT NULL,
    investor_password TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    registration_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_host_csv_uploads_challenge ON host_csv_uploads(challenge_id);
CREATE INDEX IF NOT EXISTS idx_host_csv_rows_upload ON host_csv_rows(upload_id);
