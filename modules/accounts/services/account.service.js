const db = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../config/logger");
const cacheService = require("../../../common/services/cache.service");
const auditService = require("../../../common/services/audit.service");
const accountUtil = require("../utils/account.util");
const balanceUtil = require("../../../common/utils/balance.util");

class AccountService {
  /**
   * Create a new account
   * @param {Object} accountData - Account creation data
   * @param {string} accountData.userId - User ID
   * @param {string} accountData.currency - Account currency
   * @param {string} accountData.type - Account type
   * @param {number} [accountData.initialDeposit] - Initial deposit amount
   * @returns {Promise<Object>} Created account
   */
  async createAccount(accountData) {
    const { userId, currency, type, initialDeposit = 0 } = accountData;

    // Validate user exists
    const userCheck = await db.query(
      "SELECT id FROM users WHERE id = $1 AND status = $2",
      [userId, "ACTIVE"]
    );

    if (userCheck.rows.length === 0) {
      const error = new Error("User not found or inactive");
      error.code = "USER_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    // Check if user already has an account with same currency and type
    const existingCheck = await db.query(
      "SELECT id FROM accounts WHERE user_id = $1 AND currency = $2 AND type = $3 AND status != $4",
      [userId, currency, type, "CLOSED"]
    );

    if (existingCheck.rows.length > 0) {
      const error = new Error(
        "Account with this currency and type already exists"
      );
      error.code = "ACCOUNT_EXISTS";
      error.status = 409;
      throw error;
    }

    // Generate account number
    const accountNumber = accountUtil.generateAccountNumber(type);

    // Create account
    const accountId = uuidv4();
    const result = await db.query(
      `INSERT INTO accounts (id, account_number, user_id, currency, type, status, balance, available_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at`,
      [
        accountId,
        accountNumber,
        userId,
        currency,
        type,
        "ACTIVE",
        initialDeposit,
        initialDeposit,
      ]
    );

    const account = result.rows[0];

    // If initial deposit > 0, create ledger entry
    if (initialDeposit > 0) {
      await db.query(
        `INSERT INTO ledger_entries (id, account_id, transaction_id, amount, entry_type, reference, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          uuidv4(),
          accountId,
          null,
          initialDeposit,
          "CREDIT",
          "INITIAL_DEPOSIT",
          "Initial deposit",
        ]
      );
    }

    // Cache the account
    await cacheService.setAccount(accountId, account, 3600);

    logger.info("Account created", {
      accountId,
      userId,
      currency,
      type,
      initialDeposit,
    });

    return this.formatAccount(account);
  }

  /**
   * Get account by ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Account details
   */
  async getAccountById(accountId) {
    // Try cache first
    const cached = await cacheService.getAccount(accountId);
    if (cached) {
      return this.formatAccount(cached);
    }

    const result = await db.query(
      `SELECT id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at, updated_at
       FROM accounts 
       WHERE id = $1 AND status != $2`,
      [accountId, "CLOSED"]
    );

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    // Cache the account
    await cacheService.setAccount(accountId, account, 3600);

    return this.formatAccount(account);
  }

  /**
   * Get accounts by user
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @param {string} [filters.status] - Account status filter
   * @param {string} [filters.currency] - Currency filter
   * @param {number} [filters.page] - Page number
   * @param {number} [filters.limit] - Items per page
   * @returns {Promise<Object>} Accounts with pagination
   */
  async getAccountsByUser(userId, filters = {}) {
    const { status, currency, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at
      FROM accounts 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramCount = 2;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (currency) {
      query += ` AND currency = $${paramCount}`;
      params.push(currency);
      paramCount++;
    }

    // Count query
    const countQuery = query.replace(
      /SELECT.*FROM/,
      "SELECT COUNT(*) as total FROM"
    );
    const countResult = await db.query(
      countQuery,
      params.slice(0, paramCount - 1)
    );
    const total = parseInt(countResult.rows[0].total);

    // Data query with pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${
      paramCount + 1
    }`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const accounts = result.rows.map((account) => this.formatAccount(account));

    return {
      accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update account
   * @param {string} accountId - Account ID
   * @param {Object} updates - Update data
   * @param {string} [updates.status] - New status
   * @param {string} [updates.type] - New type
   * @returns {Promise<Object>} Updated account
   */
  async updateAccount(accountId, updates) {
    const allowedUpdates = ["status", "type"];
    const updateFields = [];
    const params = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      const error = new Error("No valid updates provided");
      error.code = "NO_UPDATES";
      error.status = 400;
      throw error;
    }

    params.push(accountId);
    const query = `
      UPDATE accounts 
      SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at, updated_at
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    // Invalidate cache
    await cacheService.invalidateAccountCache(accountId);

    return this.formatAccount(account);
  }

  /**
   * Close account
   * @param {string} accountId - Account ID
   * @returns {Promise<void>}
   */
  async closeAccount(accountId) {
    // Get account
    const account = await this.getAccountById(accountId);

    // Check if balance is zero
    if (parseFloat(account.balance) !== 0) {
      const error = new Error("Cannot close account with non-zero balance");
      error.code = "BALANCE_NOT_ZERO";
      error.status = 400;
      throw error;
    }

    // Update account status
    const result = await db.query(
      `UPDATE accounts 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id`,
      ["CLOSED", accountId]
    );

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    // Invalidate cache
    await cacheService.invalidateAccountCache(accountId);

    logger.info("Account closed", { accountId });
  }

  /**
   * Get account balance
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Balance information
   */
  async getBalance(accountId) {
    // Try cache first
    const cached = await cacheService.getBalance(accountId);
    if (cached) {
      return cached;
    }

    const result = await db.query(
      `SELECT id, account_number, currency, balance, available_balance
       FROM accounts 
       WHERE id = $1`,
      [accountId]
    );

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    // Get held amount from holds
    const holdsResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total_held
       FROM holds
       WHERE account_id = $1 AND status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`,
      [accountId]
    );

    const heldAmount = parseFloat(holdsResult.rows[0].total_held);

    const balanceData = {
      accountId: account.id,
      accountNumber: account.account_number,
      currency: account.currency,
      balance: parseFloat(account.balance),
      availableBalance: parseFloat(account.available_balance),
      heldAmount,
    };

    // Cache for 5 minutes
    await cacheService.setBalance(accountId, balanceData, 300);

    return balanceData;
  }

  /**
   * Get account statement
   * @param {string} accountId - Account ID
   * @param {Object} dateRange - Date range
   * @param {string} [dateRange.fromDate] - Start date
   * @param {string} [dateRange.toDate] - End date
   * @param {number} [dateRange.page] - Page number
   * @param {number} [dateRange.limit] - Items per page
   * @returns {Promise<Object>} Account statement
   */
  async getStatement(accountId, dateRange = {}) {
    const { fromDate, toDate, page = 1, limit = 20 } = dateRange;
    const offset = (page - 1) * limit;

    // Get account details
    const account = await this.getAccountById(accountId);

    // Build query
    let query = `
      SELECT id, transaction_id, amount, entry_type, reference, description, created_at
      FROM ledger_entries
      WHERE account_id = $1
    `;
    const params = [accountId];
    let paramCount = 2;

    if (fromDate) {
      query += ` AND created_at >= $${paramCount}`;
      params.push(fromDate);
      paramCount++;
    }

    if (toDate) {
      query += ` AND created_at <= $${paramCount}`;
      params.push(toDate);
      paramCount++;
    }

    // Count query
    const countQuery = query.replace(
      /SELECT.*FROM/,
      "SELECT COUNT(*) as total FROM"
    );
    const countResult = await db.query(
      countQuery,
      params.slice(0, paramCount - 1)
    );
    const total = parseInt(countResult.rows[0].total);

    // Data query with pagination
    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${
      paramCount + 1
    }`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Calculate summary
    let openingBalance = 0;
    let closingBalance = 0;
    let totalCredits = 0;
    let totalDebits = 0;

    const transactions = result.rows.map((entry) => {
      const amount = parseFloat(entry.amount);
      const isCredit = entry.entry_type === "CREDIT";

      if (isCredit) {
        totalCredits += amount;
      } else {
        totalDebits += amount;
      }

      return {
        id: entry.id,
        transactionId: entry.transaction_id,
        amount,
        type: entry.entry_type,
        reference: entry.reference,
        description: entry.description,
        createdAt: entry.created_at,
      };
    });

    // Get opening balance (balance before the statement period)
    if (fromDate) {
      const openingResult = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END), 0) as balance
         FROM ledger_entries
         WHERE account_id = $1 AND created_at < $2`,
        [accountId, fromDate]
      );
      openingBalance = parseFloat(openingResult.rows[0].balance);
    }

    closingBalance = openingBalance + totalCredits - totalDebits;

    return {
      account: this.formatAccount(account),
      transactions,
      summary: {
        openingBalance,
        closingBalance,
        totalCredits,
        totalDebits,
        transactionCount: transactions.length,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Freeze account
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated account
   */
  async freezeAccount(accountId) {
    const result = await db.query(
      `UPDATE accounts 
       SET frozen = true, status = 'FROZEN', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at, updated_at`,
      [accountId]
    );

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    // Invalidate cache
    await cacheService.invalidateAccountCache(accountId);
    await cacheService.delete(`balance:${accountId}`);

    return this.formatAccount(account);
  }

  /**
   * Unfreeze account
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated account
   */
  async unfreezeAccount(accountId) {
    const result = await db.query(
      `UPDATE accounts 
       SET frozen = false, status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, account_number, user_id, currency, type, status, balance, available_balance, frozen, created_at, updated_at`,
      [accountId]
    );

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    // Invalidate cache
    await cacheService.invalidateAccountCache(accountId);
    await cacheService.delete(`balance:${accountId}`);

    return this.formatAccount(account);
  }

  /**
   * Validate account existence and status
   * @param {string} accountId - Account ID
   * @param {string} [userId] - User ID to check ownership
   * @returns {Promise<Object>} Account details
   */
  async validateAccount(accountId, userId = null) {
    let query = `
      SELECT id, user_id, status, frozen, currency, type, balance, available_balance
      FROM accounts 
      WHERE id = $1 AND status != 'CLOSED'
    `;
    const params = [accountId];

    if (userId) {
      query += ` AND user_id = $2`;
      params.push(userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      const error = new Error("Account not found");
      error.code = "ACCOUNT_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const account = result.rows[0];

    if (account.frozen) {
      const error = new Error("Account is frozen");
      error.code = "ACCOUNT_FROZEN";
      error.status = 403;
      throw error;
    }

    return account;
  }

  /**
   * Format account for response
   * @param {Object} account - Database account object
   * @returns {Object} Formatted account
   */
  formatAccount(account) {
    return {
      id: account.id,
      accountNumber: account.account_number,
      userId: account.user_id,
      currency: account.currency,
      type: account.type,
      status: account.status,
      balance: parseFloat(account.balance),
      availableBalance: parseFloat(account.available_balance),
      frozen: account.frozen,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  }
}

module.exports = new AccountService();
