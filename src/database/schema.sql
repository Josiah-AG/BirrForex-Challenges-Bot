-- BirrForex Challenges Bot Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    total_participations INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_perfect_scores INTEGER DEFAULT 0,
    last_win_date TIMESTAMP,
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    day VARCHAR(20) NOT NULL,
    date DATE NOT NULL,
    topic VARCHAR(500) NOT NULL,
    short_text TEXT NOT NULL,
    topic_link TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'scheduled',
    prize_amount DECIMAL(10, 2) DEFAULT 20.00,
    num_winners INTEGER DEFAULT 1,
    backup_list_size INTEGER DEFAULT 5,
    challenge_time TIME DEFAULT '20:00:00',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    order_number INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Participants table
CREATE TABLE IF NOT EXISTS participants (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    username VARCHAR(255),
    score INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    completion_time_seconds INTEGER NOT NULL,
    completion_order INTEGER NOT NULL,
    rank INTEGER,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    answers JSONB NOT NULL,
    shuffled_options JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(challenge_id, telegram_id)
);

-- Winners table
CREATE TABLE IF NOT EXISTS winners (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    username VARCHAR(255),
    position INTEGER NOT NULL,
    prize_amount DECIMAL(10, 2) NOT NULL,
    claimed BOOLEAN DEFAULT false,
    claimed_at TIMESTAMP,
    disqualified BOOLEAN DEFAULT false,
    disqualification_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_challenges_date ON challenges(date);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_participants_challenge_id ON participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_participants_telegram_id ON participants(telegram_id);
CREATE INDEX IF NOT EXISTS idx_participants_score ON participants(score);
CREATE INDEX IF NOT EXISTS idx_winners_challenge_id ON winners(challenge_id);
CREATE INDEX IF NOT EXISTS idx_questions_challenge_id ON questions(challenge_id);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('challenge_days', 'wednesday,sunday'),
    ('morning_post_time', '10:00'),
    ('challenge_time', '14:00'),
    ('default_prize_amount', '20'),
    ('backup_list_size', '5')
ON CONFLICT (key) DO NOTHING;
