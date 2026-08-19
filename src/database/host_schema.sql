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
