-- =====================================================
-- ENUM TYPES (All enums defined at the top)
-- =====================================================

-- Account Enums
CREATE TYPE account_type AS ENUM ('CHECKING', 'SAVINGS', 'INVESTMENT', 'LOAN', 'CREDIT_CARD', 'MORTGAGE', 'BUSINESS');
CREATE TYPE account_status AS ENUM ('ACTIVE', 'INACTIVE', 'CLOSED', 'FROZEN', 'PENDING');

-- Transaction Enums
CREATE TYPE transaction_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED');
CREATE TYPE transaction_type AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'PAYMENT', 'FEE', 'INTEREST', 'REFUND', 'CHARGEBACK');

-- Entry Type Enum
CREATE TYPE entry_type AS ENUM ('DEBIT', 'CREDIT');

-- Hold Enums
CREATE TYPE hold_status AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- Reconciliation Enums
CREATE TYPE reconciliation_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');
CREATE TYPE reconciliation_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'DISCREPANCY');

-- Report Enums
CREATE TYPE report_type AS ENUM ('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'TRANSACTION_HISTORY', 'ACCOUNT_SUMMARY', 'AGING_REPORT');

-- User Enums
CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'LOCKED');

-- =====================================================
-- TABLE 1: users
-- =====================================================
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

-- =====================================================
-- TABLE 2: accounts
-- =====================================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    account_number VARCHAR(50) UNIQUE NOT NULL,
    user_id UUID,
    currency VARCHAR(3) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    balance DECIMAL(19,4) DEFAULT 0,
    available_balance DECIMAL(19,4) DEFAULT 0,
    frozen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE 3: transactions
-- =====================================================
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

-- =====================================================
-- TABLE 4: ledger_entries
-- =====================================================
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY,
    account_id UUID,
    transaction_id UUID,
    amount DECIMAL(19,4) NOT NULL,
    entry_type VARCHAR(20) NOT NULL,
    reference VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE 5: transaction_lines
-- =====================================================
CREATE TABLE transaction_lines (
    id UUID PRIMARY KEY,
    transaction_id UUID,
    account_id UUID,
    debit_amount DECIMAL(19,4) DEFAULT 0,
    credit_amount DECIMAL(19,4) DEFAULT 0,
    entry_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE 6: holds
-- =====================================================
CREATE TABLE holds (
    id UUID PRIMARY KEY,
    account_id UUID,
    transaction_id UUID,
    amount DECIMAL(19,4) NOT NULL,
    status VARCHAR(50) NOT NULL,
    reason VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP
);

-- =====================================================
-- TABLE 7: reconciliations
-- =====================================================
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
    verified_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP
);

-- =====================================================
-- TABLE 8: audit_logs
-- =====================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    changes JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLE 9: reports
-- =====================================================
CREATE TABLE reports (
    id UUID PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    generated_by UUID,
    generated_at TIMESTAMP NOT NULL,
    filters JSONB,
    data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ALTER TABLE STATEMENTS (Ordered to avoid reference clashes)
-- =====================================================

-- 1. Add foreign key from accounts to users
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_user FOREIGN KEY (user_id) REFERENCES users(id);

-- 2. Add foreign key from ledger_entries to accounts
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_account FOREIGN KEY (account_id) REFERENCES accounts(id);

-- 3. Add foreign key from ledger_entries to transactions
ALTER TABLE ledger_entries ADD CONSTRAINT fk_ledger_entries_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);

-- 4. Add foreign key from transaction_lines to transactions
ALTER TABLE transaction_lines ADD CONSTRAINT fk_transaction_lines_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);

-- 5. Add foreign key from transaction_lines to accounts
ALTER TABLE transaction_lines ADD CONSTRAINT fk_transaction_lines_account FOREIGN KEY (account_id) REFERENCES accounts(id);

-- 6. Add foreign key from holds to accounts
ALTER TABLE holds ADD CONSTRAINT fk_holds_account FOREIGN KEY (account_id) REFERENCES accounts(id);

-- 7. Add foreign key from holds to transactions
ALTER TABLE holds ADD CONSTRAINT fk_holds_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id);

-- 8. Add foreign key from reconciliations to users (verified_by)
ALTER TABLE reconciliations ADD CONSTRAINT fk_reconciliations_verified_by FOREIGN KEY (verified_by) REFERENCES users(id);

-- 9. Add foreign key from audit_logs to users
ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id);

-- 10. Add foreign key from reports to users (generated_by)
ALTER TABLE reports ADD CONSTRAINT fk_reports_generated_by FOREIGN KEY (generated_by) REFERENCES users(id);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_status ON users(status);

-- Accounts indexes
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts(account_number);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_type ON accounts(type);

-- Transactions indexes
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_completed_at ON transactions(completed_at);
CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key);

-- Ledger entries indexes
CREATE INDEX idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_entries_created_at ON ledger_entries(created_at);

-- Transaction lines indexes
CREATE INDEX idx_transaction_lines_transaction_id ON transaction_lines(transaction_id);
CREATE INDEX idx_transaction_lines_account_id ON transaction_lines(account_id);

-- Holds indexes
CREATE INDEX idx_holds_account_id ON holds(account_id);
CREATE INDEX idx_holds_transaction_id ON holds(transaction_id);
CREATE INDEX idx_holds_status ON holds(status);
CREATE INDEX idx_holds_expires_at ON holds(expires_at);

-- Reconciliations indexes
CREATE INDEX idx_reconciliations_type ON reconciliations(type);
CREATE INDEX idx_reconciliations_status ON reconciliations(status);
CREATE INDEX idx_reconciliations_start_date ON reconciliations(start_date);
CREATE INDEX idx_reconciliations_end_date ON reconciliations(end_date);
CREATE INDEX idx_reconciliations_verified_by ON reconciliations(verified_by);
CREATE INDEX idx_reconciliations_created_at ON reconciliations(created_at);
CREATE INDEX idx_reconciliations_verified_at ON reconciliations(verified_at);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Reports indexes
CREATE INDEX idx_reports_generated_by ON reports(generated_by);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_reports_generated_at ON reports(generated_at);