const db = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../config/logger");
const cacheService = require("../../../common/services/cache.service");
const queueService = require("../../../common/services/queue.service");
const notificationService = require("../../../common/services/notification.service");
const transactionUtil = require("../../../common/utils/transaction.util");
const { createError } = require("../../../common/middleware/error.middleware");

class TransactionService {
  async initiate(transactionData) {
    const {
      type,
      amount,
      currency,
      sourceAccountId,
      destinationAccountId,
      description,
      metadata,
      initiatedBy,
      idempotencyKey,
    } = transactionData;

    // Validate transaction
    const validation = transactionUtil.validateTransaction(transactionData);
    if (!validation.isValid) {
      throw createError(422, "VALIDATION_ERROR", validation.errors);
    }

    const transactionId = uuidv4();
    const reference = transactionUtil.generateTransactionRef();

    // Start database transaction
    return db.transaction(async (client) => {
      // Create transaction record
      const result = await client.query(
        `INSERT INTO transactions (
          id, reference, status, type, amount, currency,
          description, metadata, idempotency_key, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          transactionId,
          reference,
          "PENDING",
          type,
          amount,
          currency,
          description || null,
          metadata || {},
          idempotencyKey || null,
        ]
      );

      const transaction = result.rows[0];

      // Create transaction lines
      let lines = [];

      // For transfers, create two lines
      if (type === "TRANSFER") {
        // Debit source account
        const debitLine = await client.query(
          `INSERT INTO transaction_lines (
            id, transaction_id, account_id, debit_amount, credit_amount, entry_type
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [uuidv4(), transactionId, sourceAccountId, amount, 0, "DEBIT"]
        );
        lines.push(debitLine.rows[0]);

        // Credit destination account
        const creditLine = await client.query(
          `INSERT INTO transaction_lines (
            id, transaction_id, account_id, debit_amount, credit_amount, entry_type
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [uuidv4(), transactionId, destinationAccountId, 0, amount, "CREDIT"]
        );
        lines.push(creditLine.rows[0]);
      } else {
        // Single account transaction (deposit, withdrawal)
        const isDeposit = type === "DEPOSIT";
        const line = await client.query(
          `INSERT INTO transaction_lines (
            id, transaction_id, account_id, debit_amount, credit_amount, entry_type
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            uuidv4(),
            transactionId,
            isDeposit ? destinationAccountId : sourceAccountId,
            isDeposit ? 0 : amount,
            isDeposit ? amount : 0,
            isDeposit ? "CREDIT" : "DEBIT",
          ]
        );
        lines.push(line.rows[0]);
      }

      // Queue transaction processing
      await queueService.scheduleTransaction({
        transactionId,
        reference,
        type,
        amount,
        currency,
      });

      // Send notification
      await notificationService.sendTransactionNotification(
        "system@financial-ledger.com",
        transaction
      );

      logger.info("Transaction initiated", {
        transactionId,
        reference,
        type,
        amount,
        currency,
        initiatedBy,
      });

      return {
        ...transaction,
        lines,
      };
    });
  }

  async process(transactionId) {
    const transaction = await this.getById(transactionId);

    if (!transaction) {
      throw createError(404, "NOT_FOUND", "Transaction not found");
    }

    if (transaction.status !== "PENDING") {
      throw createError(422, "INVALID_STATUS", "Transaction is not pending");
    }

    return db.transaction(async (client) => {
      // Update status to processing
      await client.query(
        `UPDATE transactions 
         SET status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [transactionId]
      );

      // Get transaction lines
      const linesResult = await client.query(
        "SELECT * FROM transaction_lines WHERE transaction_id = $1",
        [transactionId]
      );
      const lines = linesResult.rows;

      // Create ledger entries for each line
      for (const line of lines) {
        await client.query(
          `INSERT INTO ledger_entries (
            id, account_id, transaction_id, amount, entry_type,
            reference, description, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [
            uuidv4(),
            line.account_id,
            transactionId,
            line.debit_amount + line.credit_amount,
            line.entry_type,
            transaction.reference,
            `Transaction ${transaction.reference} - ${line.entry_type}`,
          ]
        );

        // Update account balance
        const balanceChange =
          line.entry_type === "CREDIT"
            ? line.credit_amount
            : -line.debit_amount;

        await client.query(
          `UPDATE accounts 
           SET balance = balance + $1, 
               available_balance = available_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [balanceChange, line.account_id]
        );
      }

      // Update transaction status to completed
      const result = await client.query(
        `UPDATE transactions 
         SET status = 'COMPLETED', 
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [transactionId]
      );

      const completedTransaction = result.rows[0];

      // Invalidate caches
      const accountIds = lines.map((l) => l.account_id);
      for (const accountId of accountIds) {
        await cacheService.invalidateAccountCache(accountId);
      }

      // Send completion notification
      await notificationService.sendTransactionNotification(
        "system@financial-ledger.com",
        completedTransaction
      );

      logger.info("Transaction processed", {
        transactionId,
        status: "COMPLETED",
        accountIds,
      });

      return completedTransaction;
    });
  }

  async complete(transactionId, userId) {
    const transaction = await this.getById(transactionId);

    if (!transaction) {
      throw createError(404, "NOT_FOUND", "Transaction not found");
    }

    if (transaction.status !== "PROCESSING") {
      throw createError(422, "INVALID_STATUS", "Transaction is not processing");
    }

    return this.process(transactionId);
  }

  async cancel(transactionId, reason, userId) {
    const transaction = await this.getById(transactionId);

    if (!transaction) {
      throw createError(404, "NOT_FOUND", "Transaction not found");
    }

    if (!["PENDING", "PROCESSING"].includes(transaction.status)) {
      throw createError(422, "INVALID_STATUS", "Cannot cancel transaction");
    }

    const result = await db.query(
      `UPDATE transactions 
       SET status = 'CANCELLED', 
           metadata = jsonb_set(metadata, '{cancellation}', 
             jsonb_build_object('reason', $1, 'cancelledBy', $2, 'cancelledAt', CURRENT_TIMESTAMP)),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [reason, userId, transactionId]
    );

    const cancelledTransaction = result.rows[0];

    logger.info("Transaction cancelled", {
      transactionId,
      reason,
      cancelledBy: userId,
    });

    return cancelledTransaction;
  }

  async getById(transactionId) {
    const result = await db.query(
      `SELECT t.*, 
              json_agg(DISTINCT tl.*) as lines,
              json_agg(DISTINCT le.*) as ledger_entries
       FROM transactions t
       LEFT JOIN transaction_lines tl ON t.id = tl.transaction_id
       LEFT JOIN ledger_entries le ON t.id = le.transaction_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [transactionId]
    );

    return result.rows[0] || null;
  }

  async getByReference(reference) {
    const result = await db.query(
      "SELECT * FROM transactions WHERE reference = $1",
      [reference]
    );

    return result.rows[0] || null;
  }

  async getTransactions(filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (filters.userId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM transaction_lines tl 
        WHERE tl.transaction_id = t.id 
        AND tl.account_id IN (
          SELECT id FROM accounts WHERE user_id = $${paramCount}
        )
      )`);
      params.push(filters.userId);
      paramCount++;
    }

    if (filters.status) {
      conditions.push(`t.status = $${paramCount}`);
      params.push(filters.status);
      paramCount++;
    }

    if (filters.type) {
      conditions.push(`t.type = $${paramCount}`);
      params.push(filters.type);
      paramCount++;
    }

    if (filters.fromDate) {
      conditions.push(`t.created_at >= $${paramCount}`);
      params.push(filters.fromDate);
      paramCount++;
    }

    if (filters.toDate) {
      conditions.push(`t.created_at <= $${paramCount}`);
      params.push(filters.toDate);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT t.id) as total 
      FROM transactions t
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get data
    const dataQuery = `
      SELECT t.*, 
             json_agg(DISTINCT tl.*) as lines
      FROM transactions t
      LEFT JOIN transaction_lines tl ON t.id = tl.transaction_id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(dataQuery, params);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStatus(transactionId) {
    const result = await db.query(
      `SELECT id, status, reference, created_at, completed_at
       FROM transactions
       WHERE id = $1`,
      [transactionId]
    );

    return result.rows[0] || null;
  }

  async getPending(userId) {
    const result = await db.query(
      `SELECT t.*
       FROM transactions t
       WHERE t.status IN ('PENDING', 'PROCESSING')
       AND EXISTS (
         SELECT 1 FROM transaction_lines tl 
         WHERE tl.transaction_id = t.id 
         AND tl.account_id IN (
           SELECT id FROM accounts WHERE user_id = $1
         )
       )
       ORDER BY t.created_at ASC`,
      [userId]
    );

    return result.rows;
  }

  async getHistory(userId, filters = {}, pagination = {}) {
    return this.getTransactions({ ...filters, userId }, pagination);
  }

  async validate(transactionData) {
    return transactionUtil.validateTransaction(transactionData);
  }

  async settle(transactionId) {
    const transaction = await this.getById(transactionId);

    if (!transaction) {
      throw createError(404, "NOT_FOUND", "Transaction not found");
    }

    if (transaction.status !== "COMPLETED") {
      throw createError(
        422,
        "INVALID_STATUS",
        "Transaction must be completed to settle"
      );
    }

    // Settlement logic
    // This would typically involve inter-bank settlement
    // For now, just mark as settled in metadata

    const result = await db.query(
      `UPDATE transactions 
       SET metadata = jsonb_set(metadata, '{settlement}', 
         jsonb_build_object('settledAt', CURRENT_TIMESTAMP, 'status', 'SETTLED')),
       updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [transactionId]
    );

    logger.info("Transaction settled", {
      transactionId,
      reference: transaction.reference,
    });

    return result.rows[0];
  }
}

module.exports = new TransactionService();
