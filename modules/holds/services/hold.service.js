const db = require("../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../config/logger");
const holdUtil = require("../utils/hold.util");
const balanceService = require("../services/balance.service");
const auditService = require("../../common/services/audit.service");
const {
  NotFoundError,
  InsufficientBalanceError,
} = require("../../common/middleware/error.middleware");

class HoldService {
  async createHold(holdData) {
    const { accountId, amount, reason, expiresIn, userId } = holdData;

    // Validate account exists and has sufficient balance
    const balanceValidation = await balanceService.validateSufficientBalance(
      accountId,
      amount,
      userId
    );

    if (!balanceValidation.valid) {
      throw new InsufficientBalanceError(
        `Insufficient balance. Available: ${balanceValidation.available}, Required: ${amount}`
      );
    }

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

      // Calculate expiry date
      const expiresAt = holdUtil.calculateExpiryDate(expiresIn || 24);

      // Create hold
      const holdId = uuidv4();
      await client.query(
        `INSERT INTO holds (
          id, account_id, amount, status, reason, expires_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [holdId, accountId, amount, "ACTIVE", reason, expiresAt]
      );

      // Update available balance
      const newAvailable = currentAvailable - parseFloat(amount);
      await client.query(
        `UPDATE accounts 
         SET available_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newAvailable, accountId]
      );

      // Log to audit
      await auditService.logAudit("HOLD_CREATED", {
        userId,
        entityType: "HOLD",
        entityId: holdId,
        changes: {
          accountId,
          amount,
          reason,
          expiresAt,
        },
      });

      return {
        id: holdId,
        accountId,
        amount: parseFloat(amount),
        status: "ACTIVE",
        reason,
        expiresAt,
        createdAt: new Date().toISOString(),
      };
    });
  }

  async getHoldById(holdId) {
    const result = await db.query(
      `SELECT 
        h.*,
        a.account_number,
        a.user_id
       FROM holds h
       JOIN accounts a ON h.account_id = a.id
       WHERE h.id = $1`,
      [holdId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError("Hold not found");
    }

    return this.formatHold(result.rows[0]);
  }

  async getHolds(filters) {
    const { userId, accountId, status, page = 1, limit = 20 } = filters;

    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (userId) {
      conditions.push(`a.user_id = $${paramCount}`);
      params.push(userId);
      paramCount++;
    }

    if (accountId) {
      conditions.push(`h.account_id = $${paramCount}`);
      params.push(accountId);
      paramCount++;
    }

    if (status) {
      conditions.push(`h.status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const offset = (page - 1) * limit;

    // Get holds
    const query = `
      SELECT 
        h.*,
        a.account_number,
        a.user_id
      FROM holds h
      JOIN accounts a ON h.account_id = a.id
      ${whereClause}
      ORDER BY h.created_at DESC
      LIMIT $${paramCount}
      OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM holds h
      JOIN accounts a ON h.account_id = a.id
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));

    return {
      holds: result.rows.map((h) => this.formatHold(h)),
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    };
  }

  async releaseHold(holdId, userId, reason = null) {
    // Start transaction
    return db.transaction(async (client) => {
      // Get hold with lock
      const holdResult = await client.query(
        "SELECT * FROM holds WHERE id = $1 FOR UPDATE",
        [holdId]
      );

      if (holdResult.rows.length === 0) {
        throw new NotFoundError("Hold not found");
      }

      const hold = holdResult.rows[0];

      if (hold.status !== "ACTIVE") {
        throw new Error(`Hold is already ${hold.status.toLowerCase()}`);
      }

      // Lock account
      const accountResult = await client.query(
        "SELECT id, available_balance FROM accounts WHERE id = $1 FOR UPDATE",
        [hold.account_id]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const account = accountResult.rows[0];
      const currentAvailable = parseFloat(account.available_balance);

      // Update hold status
      await client.query(
        `UPDATE holds 
         SET status = 'RELEASED', 
             released_at = NOW(),
             reason = COALESCE($1, reason || 'Released by user')
         WHERE id = $2`,
        [reason, holdId]
      );

      // Release amount back to available balance
      const newAvailable = currentAvailable + parseFloat(hold.amount);
      await client.query(
        `UPDATE accounts 
         SET available_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newAvailable, hold.account_id]
      );

      // Log audit
      await auditService.logAudit("HOLD_RELEASED", {
        userId,
        entityType: "HOLD",
        entityId: holdId,
        changes: {
          accountId: hold.account_id,
          amount: hold.amount,
          reason,
        },
      });

      return {
        id: hold.id,
        accountId: hold.account_id,
        amount: parseFloat(hold.amount),
        status: "RELEASED",
        reason: reason || "Released by user",
        releasedAt: new Date().toISOString(),
      };
    });
  }

  async expireHold(holdId, userId) {
    // Start transaction
    return db.transaction(async (client) => {
      // Get hold with lock
      const holdResult = await client.query(
        "SELECT * FROM holds WHERE id = $1 FOR UPDATE",
        [holdId]
      );

      if (holdResult.rows.length === 0) {
        throw new NotFoundError("Hold not found");
      }

      const hold = holdResult.rows[0];

      if (hold.status !== "ACTIVE") {
        throw new Error(`Hold is already ${hold.status.toLowerCase()}`);
      }

      // Lock account
      const accountResult = await client.query(
        "SELECT id, available_balance FROM accounts WHERE id = $1 FOR UPDATE",
        [hold.account_id]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const account = accountResult.rows[0];
      const currentAvailable = parseFloat(account.available_balance);

      // Update hold status
      await client.query(
        `UPDATE holds 
         SET status = 'EXPIRED'
         WHERE id = $1`,
        [holdId]
      );

      // Release amount back to available balance
      const newAvailable = currentAvailable + parseFloat(hold.amount);
      await client.query(
        `UPDATE accounts 
         SET available_balance = $1, updated_at = NOW()
         WHERE id = $2`,
        [newAvailable, hold.account_id]
      );

      // Log audit
      await auditService.logAudit("HOLD_EXPIRED", {
        userId,
        entityType: "HOLD",
        entityId: holdId,
        changes: {
          accountId: hold.account_id,
          amount: hold.amount,
        },
      });

      return {
        id: hold.id,
        accountId: hold.account_id,
        amount: parseFloat(hold.amount),
        status: "EXPIRED",
      };
    });
  }

  async getAccountHolds(accountId, userId = null, status = "ACTIVE") {
    // Verify account access
    if (userId) {
      const accountResult = await db.query(
        "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
        [accountId, userId]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }
    }

    const conditions = ["account_id = $1"];
    const params = [accountId];
    let paramCount = 2;

    if (status) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    const query = `
      SELECT *
      FROM holds
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
    `;

    const result = await db.query(query, params);

    return result.rows.map((h) => this.formatHold(h));
  }

  async validateHold(holdData) {
    const { accountId, amount, expiresIn } = holdData;

    // Validate amount
    const amountValidation = holdUtil.validateHoldAmount(amount);
    if (!amountValidation.valid) {
      return {
        valid: false,
        errors: amountValidation.errors,
      };
    }

    // Validate expiry
    if (expiresIn && (expiresIn < 1 || expiresIn > 720)) {
      return {
        valid: false,
        errors: ["Expiry must be between 1 and 720 hours"],
      };
    }

    // Validate account exists
    const accountResult = await db.query(
      "SELECT id FROM accounts WHERE id = $1",
      [accountId]
    );

    if (accountResult.rows.length === 0) {
      return {
        valid: false,
        errors: ["Account not found"],
      };
    }

    return {
      valid: true,
      errors: [],
    };
  }

  async expireExpiredHolds() {
    logger.info("Starting expired holds cleanup");

    return db.transaction(async (client) => {
      // Find expired holds
      const expiredResult = await client.query(
        `SELECT id, account_id, amount
         FROM holds
         WHERE status = 'ACTIVE'
           AND expires_at < NOW()
         FOR UPDATE`
      );

      if (expiredResult.rows.length === 0) {
        logger.info("No expired holds found");
        return { expired: 0 };
      }

      // Process each expired hold
      for (const hold of expiredResult.rows) {
        // Lock account
        const accountResult = await client.query(
          "SELECT id, available_balance FROM accounts WHERE id = $1 FOR UPDATE",
          [hold.account_id]
        );

        if (accountResult.rows.length > 0) {
          const account = accountResult.rows[0];
          const currentAvailable = parseFloat(account.available_balance);
          const newAvailable = currentAvailable + parseFloat(hold.amount);

          // Update account balance
          await client.query(
            `UPDATE accounts 
             SET available_balance = $1, updated_at = NOW()
             WHERE id = $2`,
            [newAvailable, hold.account_id]
          );
        }

        // Update hold status
        await client.query(
          `UPDATE holds 
           SET status = 'EXPIRED'
           WHERE id = $1`,
          [hold.id]
        );

        logger.info(`Hold ${hold.id} expired and released ${hold.amount}`);
      }

      logger.info(`Expired ${expiredResult.rows.length} holds`);

      return {
        expired: expiredResult.rows.length,
        holds: expiredResult.rows,
      };
    });
  }

  formatHold(hold) {
    return {
      id: hold.id,
      accountId: hold.account_id,
      accountNumber: hold.account_number,
      amount: parseFloat(hold.amount),
      status: hold.status,
      reason: hold.reason,
      expiresAt: hold.expires_at,
      createdAt: hold.created_at,
      releasedAt: hold.released_at,
    };
  }
}

module.exports = new HoldService();
