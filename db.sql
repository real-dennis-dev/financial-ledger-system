-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    status VARCHAR(50),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    account_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    currency VARCHAR(3) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    balance DECIMAL(19,4) DEFAULT 0,
    available_balance DECIMAL(19,4) DEFAULT 0,
    frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ledger entries table
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY,
    account_id UUID REFERENCES accounts(id),
    transaction_id UUID,
    amount DECIMAL(19,4) NOT NULL,
    entry_type VARCHAR(20) NOT NULL, -- DEBIT, CREDIT
    reference VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    reference VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(19,4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    description TEXT,
    metadata JSONB,
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Transaction lines table
CREATE TABLE transaction_lines (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    account_id UUID REFERENCES accounts(id),
    debit_amount DECIMAL(19,4) DEFAULT 0,
    credit_amount DECIMAL(19,4) DEFAULT 0,
    entry_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Holds table
CREATE TABLE holds (
    id UUID PRIMARY KEY,
    account_id UUID REFERENCES accounts(id),
    transaction_id UUID REFERENCES transactions(id),
    amount DECIMAL(19,4) NOT NULL,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP
);

-- Reconciliation table
CREATE TABLE reconciliations (
    id UUID PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    internal_balance DECIMAL(19,4),
    external_balance DECIMAL(19,4),
    discrepancy DECIMAL(19,4),
    resolution TEXT,
    verified_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create reports table
CREATE TABLE reports (
    id UUID PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMP NOT NULL,
    filters JSONB,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX idx_reports_generated_by ON reports(generated_by);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_reports_generated_at ON reports(generated_at);