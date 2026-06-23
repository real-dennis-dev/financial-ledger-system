const db = require("../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../config/logger");
const balanceUtil = require("../utils/balance.util");
const cacheService = require("../../common/services/cache.service");
const auditService = require("../../common/services/audit.service");
const {
  NotFoundError,
  InsufficientBalanceError,
} = require("../../common/middleware/error.middleware");

class BalanceService {
  async getBalance(accountId, userId = null) {
    // Check cache first
    const cached = await cacheService.getBalance(accountId);
    if (cached) {
      return cached;
    }

    // Get from database
    const query = `
      SELECT 
        a.id as accountId,
        a.balance,
        a.available_balance,
        a.currency,
        a.updated_at as lastUpdated
      FROM accounts a
      WHERE a.id = $1
    `;

    const params = [accountId];

    // If userId provided, verify ownership
    if (userId) {
      query.push("AND a.user_id = $2");
      params.push(userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      throw new NotFoundError("Account not found");
    }

    const balanceData = result.rows[0];

    // Cache the result
    await cacheService.setBalance(accountId, balanceData, 300);

    return balanceData;
  }

  async getAvailableBalance(accountId, userId = null) {
    const balance = await this.getBalance(accountId, userId);

    // Get active holds
    const holds = await this.getActiveHolds(accountId);

    const availableBalance = balanceUtil.computeAvailableBalance(
      balance.balance,
      holds
    );

    return {
      accountId,
      ledgerBalance: parseFloat(balance.balance),
      availableBalance,
      heldAmount: parseFloat(balance.balance) - availableBalance,
      currency: balance.currency,
      lastUpdated: balance.lastUpdated,
    };
  }

  async getActiveHolds(accountId) {
    const result = await db.query(
      `SELECT 
        id,
        amount,
        status,
        reason,
        expires_at
       FROM holds
       WHERE account_id = $1 
         AND status = 'ACTIVE'
         AND expires_at > NOW()`,
      [accountId]
    );

    return result.rows;
  }

  async updateBalance(accountId, amount, reason, userId, reference = null) {
    // Start transaction
    return db.transaction(async (client) => {
      // Lock the account row for update
      const accountResult = await client.query(
        "SELECT id, balance, currency FROM accounts WHERE id = $1 FOR UPDATE",
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const account = accountResult.rows[0];
      const currentBalance = parseFloat(account.balance);
      const newBalance = currentBalance + parseFloat(amount);

      // Validate balance doesn't go negative
      if (newBalance < 0) {
        throw new InsufficientBalanceError();
      }

      // Update account balance
      await client.query(
        `UPDATE accounts 
         SET balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newBalance, accountId]
      );

      // Create ledger entry
      const entryId = uuidv4();
      const entryType = amount >= 0 ? "CREDIT" : "DEBIT";

      await client.query(
        `INSERT INTO ledger_entries (
          id, account_id, amount, entry_type, reference, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          entryId,
          accountId,
          Math.abs(amount),
          entryType,
          reference || `BALANCE_UPDATE_${Date.now()}`,
          reason || "Balance adjustment",
        ]
      );

      // Log to audit
      await auditService.logAudit("BALANCE_UPDATED", {
        userId,
        entityType: "ACCOUNT",
        entityId: accountId,
        changes: {
          previousBalance: currentBalance,
          newBalance,
          amount,
          reason,
          reference,
        },
      });

      // Invalidate cache
      await cacheService.invalidateAccountCache(accountId);

      return {
        accountId,
        previousBalance: currentBalance,
        balance: newBalance,
        amount,
        currency: account.currency,
        reason,
        reference,
      };
    });
  }

  async getBalanceHistory(accountId, userId, dateRange = {}, pagination = {}) {
    // Verify account ownership
    await this.getBalance(accountId, userId);

    const conditions = ["account_id = $1"];
    const params = [accountId];
    let paramCount = 2;

    if (dateRange.fromDate) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(dateRange.fromDate);
      paramCount++;
    }

    if (dateRange.toDate) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(dateRange.toDate);
      paramCount++;
    }

    const limit = pagination.limit || 50;
    const offset = pagination.offset || 0;

    // Get entries
    const query = `
      SELECT 
        id,
        account_id,
        amount,
        entry_type,
        reference,
        description,
        created_at
      FROM ledger_entries
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${paramCount}
      OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ledger_entries
      WHERE ${conditions.join(" AND ")}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));

    return {
      entries: result.rows,
      pagination: {
        limit,
        offset,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    };
  }

  async validateSufficientBalance(accountId, amount, userId = null) {
    const balance = await this.getBalance(accountId, userId);
    const availableBalance = await this.getAvailableBalance(accountId, userId);

    if (parseFloat(availableBalance.availableBalance) < parseFloat(amount)) {
      return {
        valid: false,
        message: "Insufficient balance",
        required: parseFloat(amount),
        available: availableBalance.availableBalance,
        ledgerBalance: parseFloat(balance.balance),
      };
    }

    return {
      valid: true,
      message: "Sufficient balance",
      available: availableBalance.availableBalance,
      ledgerBalance: parseFloat(balance.balance),
    };
  }

  async reserveBalance(accountId, amount, holdId, userId = null) {
    // Start transaction
    return db.transaction(async (client) => {
      // Lock account
      const accountResult = await client.query(
        "SELECT id, balance, available_balance FROM accounts WHERE id = $1 FOR UPDATE",
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const account = accountResult.rows[0];
      const currentAvailable = parseFloat(account.available_balance);

      if (currentAvailable < parseFloat(amount)) {
        throw new InsufficientBalanceError(
          `Insufficient available balance. Available: ${currentAvailable}, Required: ${amount}`
        );
      }

      // Update available balance
      const newAvailable = currentAvailable - parseFloat(amount);

      await client.query(
        `UPDATE accounts 
         SET available_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newAvailable, accountId]
      );

      // Create hold record
      const holdId = holdId || uuidv4();
      await client.query(
        `INSERT INTO holds (
          id, account_id, amount, status, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          holdId,
          accountId,
          amount,
          "ACTIVE",
          new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
        ]
      );

      // Invalidate cache
      await cacheService.invalidateAccountCache(accountId);

      return {
        holdId,
        accountId,
        amount,
        status: "ACTIVE",
        remainingAvailable: newAvailable,
      };
    });
  }

  async releaseBalance(accountId, amount, holdId, userId = null) {
    // Start transaction
    return db.transaction(async (client) => {
      // Lock account
      const accountResult = await client.query(
        "SELECT id, available_balance FROM accounts WHERE id = $1 FOR UPDATE",
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const account = accountResult.rows[0];
      const currentAvailable = parseFloat(account.available_balance);

      // Update hold status
      await client.query(
        `UPDATE holds 
         SET status = 'RELEASED', released_at = NOW()
         WHERE id = $1 AND account_id = $2`,
        [holdId, accountId]
      );

      // Release the held amount back to available balance
      const newAvailable = currentAvailable + parseFloat(amount);

      await client.query(
        `UPDATE accounts 
         SET available_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newAvailable, accountId]
      );

      // Invalidate cache
      await cacheService.invalidateAccountCache(accountId);

      return {
        holdId,
        accountId,
        amount,
        status: "RELEASED",
        newAvailable,
      };
    });
  }

  async getHeldAmounts(accountId, userId = null) {
    await this.getBalance(accountId, userId);

    const result = await db.query(
      `SELECT 
        id,
        amount,
        status,
        reason,
        expires_at,
        created_at
       FROM holds
       WHERE account_id = $1 
         AND status = 'ACTIVE'
         AND expires_at > NOW()`,
      [accountId]
    );

    const totalHeld = result.rows.reduce(
      (sum, hold) => sum + parseFloat(hold.amount),
      0
    );

    return {
      accountId,
      totalHeld,
      holds: result.rows,
    };
  }

  async getBalanceSummary(accountId, userId = null) {
    const balance = await this.getBalance(accountId, userId);
    const available = await this.getAvailableBalance(accountId, userId);
    const held = await this.getHeldAmounts(accountId, userId);

    return {
      accountId,
      ledgerBalance: parseFloat(balance.balance),
      availableBalance: available.availableBalance,
      heldAmount: held.totalHeld,
      currency: balance.currency,
      lastUpdated: balance.lastUpdated,
    };
  }

  async syncBalances() {
    // Sync ledger entries with account balances
    logger.info("Starting balance synchronization");

    const result = await db.query(`
      WITH balance_calc AS (
        SELECT 
          account_id,
          SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END) as calculated_balance
        FROM ledger_entries
        GROUP BY account_id
      )
      UPDATE accounts a
      SET 
        balance = b.calculated_balance,
        updated_at = NOW()
      FROM balance_calc b
      WHERE a.id = b.account_id
      AND a.balance != b.calculated_balance
      RETURNING a.id, a.balance, b.calculated_balance
    `);

    logger.info(
      `Balance synchronization completed. Updated ${result.rows.length} accounts`
    );

    return {
      updated: result.rows.length,
      accounts: result.rows,
    };
  }
}

module.exports = new BalanceService();
