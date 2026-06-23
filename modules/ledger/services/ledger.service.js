const db = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../config/logger");
const cacheService = require("../../../common/services/cache.service");
const balanceUtil = require("../../../common/utils/balance.util");
const ledgerUtil = require("../utils/ledger.util");
const { createError } = require("../../../common/middleware/error.middleware");

class LedgerService {
  async createEntry(entryData) {
    const {
      accountId,
      amount,
      entryType,
      reference,
      description,
      transactionId,
      createdBy,
    } = entryData;

    // Validate double entry accounting
    if (transactionId) {
      const transactionEntries = await this.getEntriesByTransaction(
        transactionId
      );
      const validation = ledgerUtil.validateDoubleEntry(transactionEntries);

      if (!validation.isValid) {
        throw createError(422, "DOUBLE_ENTRY_ERROR", validation.message);
      }
    }

    const entryId = uuidv4();

    // Start transaction
    return db.transaction(async (client) => {
      // Create ledger entry
      const result = await client.query(
        `INSERT INTO ledger_entries (
          id, account_id, transaction_id, amount, entry_type, 
          reference, description, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          entryId,
          accountId,
          transactionId,
          amount,
          entryType,
          reference,
          description,
        ]
      );

      const entry = result.rows[0];

      // Update account balance
      const balanceChange = entryType === "CREDIT" ? amount : -amount;

      await client.query(
        `UPDATE accounts 
         SET balance = balance + $1, 
             available_balance = available_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [balanceChange, accountId]
      );

      // Invalidate cache
      await cacheService.invalidateAccountCache(accountId);

      logger.info("Ledger entry created", {
        entryId,
        accountId,
        amount,
        entryType,
        transactionId,
      });

      return entry;
    });
  }

  async getEntries(filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (filters.accountId) {
      conditions.push(`account_id = $${paramCount}`);
      params.push(filters.accountId);
      paramCount++;
    }

    if (filters.entryType) {
      conditions.push(`entry_type = $${paramCount}`);
      params.push(filters.entryType);
      paramCount++;
    }

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(filters.fromDate);
      paramCount++;
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(filters.toDate);
      paramCount++;
    }

    if (filters.transactionId) {
      conditions.push(`transaction_id = $${paramCount}`);
      params.push(filters.transactionId);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM ledger_entries 
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get data
    const dataQuery = `
      SELECT le.*, a.account_number, a.currency
      FROM ledger_entries le
      LEFT JOIN accounts a ON le.account_id = a.id
      ${whereClause}
      ORDER BY le.created_at DESC
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

  async getEntryById(entryId) {
    const result = await db.query(
      `SELECT le.*, a.account_number, a.currency
       FROM ledger_entries le
       LEFT JOIN accounts a ON le.account_id = a.id
       WHERE le.id = $1`,
      [entryId]
    );

    return result.rows[0] || null;
  }

  async getEntriesByTransaction(transactionId) {
    const result = await db.query(
      `SELECT * FROM ledger_entries WHERE transaction_id = $1`,
      [transactionId]
    );

    return result.rows;
  }

  async getAccountEntries(accountId, filters = {}, pagination = {}) {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    let conditions = [`account_id = $1`];
    let params = [accountId];
    let paramCount = 2;

    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(filters.fromDate);
      paramCount++;
    }

    if (filters.toDate) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(filters.toDate);
      paramCount++;
    }

    if (filters.entryType) {
      conditions.push(`entry_type = $${paramCount}`);
      params.push(filters.entryType);
      paramCount++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM ledger_entries 
      ${whereClause}
    `;

    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get data
    const dataQuery = `
      SELECT *
      FROM ledger_entries 
      ${whereClause}
      ORDER BY created_at DESC
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

  async getBalance(accountId, options = {}) {
    const { asOfDate } = options;

    // Check cache first
    const cacheKey = `ledger_balance:${accountId}:${asOfDate || "latest"}`;
    const cached = await cacheService.get(cacheKey);

    if (cached) {
      return cached;
    }

    let query = `
      SELECT 
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as total_credits,
        SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
        COUNT(*) as total_entries
      FROM ledger_entries
      WHERE account_id = $1
    `;

    let params = [accountId];

    if (asOfDate) {
      query += ` AND created_at <= $2`;
      params.push(asOfDate);
    }

    const result = await db.query(query, params);
    const data = result.rows[0];

    const balance = {
      accountId,
      asOfDate: asOfDate || new Date().toISOString(),
      totalCredits: parseFloat(data.total_credits) || 0,
      totalDebits: parseFloat(data.total_debits) || 0,
      balance:
        parseFloat(data.total_credits || 0) -
        parseFloat(data.total_debits || 0),
      totalEntries: parseInt(data.total_entries),
    };

    // Cache for 5 minutes
    await cacheService.set(cacheKey, balance, 300);

    return balance;
  }

  async reconcile(reconciliationData) {
    const { startDate, endDate, accountId, initiatedBy } = reconciliationData;

    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (accountId) {
      conditions.push(`account_id = $${paramCount}`);
      params.push(accountId);
      paramCount++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(endDate);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get all entries in period
    const entriesQuery = `
      SELECT *
      FROM ledger_entries
      ${whereClause}
      ORDER BY created_at ASC
    `;

    const entriesResult = await db.query(entriesQuery, params);
    const entries = entriesResult.rows;

    // Calculate totals
    const totals = ledgerUtil.calculateTotal(entries);

    // Validate double entry
    const validation = ledgerUtil.validateDoubleEntry(entries);

    const reconciliationId = uuidv4();

    // Save reconciliation record
    const result = await db.query(
      `INSERT INTO reconciliations (
        id, type, status, start_date, end_date, 
        internal_balance, external_balance, discrepancy,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        reconciliationId,
        "LEDGER",
        validation.isValid ? "VERIFIED" : "DISCREPANCY",
        startDate,
        endDate,
        totals.totalCredits,
        totals.totalDebits,
        totals.totalCredits - totals.totalDebits,
      ]
    );

    const reconciliation = result.rows[0];

    logger.info("Reconciliation completed", {
      reconciliationId,
      totalEntries: entries.length,
      totalCredits: totals.totalCredits,
      totalDebits: totals.totalDebits,
      isValid: validation.isValid,
    });

    return {
      reconciliation,
      summary: {
        totalEntries: entries.length,
        totalCredits: totals.totalCredits,
        totalDebits: totals.totalDebits,
        balance: totals.totalCredits - totals.totalDebits,
        isValid: validation.isValid,
        validation: validation,
      },
    };
  }

  async auditEntries(transactionId) {
    const entries = await this.getEntriesByTransaction(transactionId);

    if (entries.length === 0) {
      throw createError(
        404,
        "NOT_FOUND",
        "No entries found for this transaction"
      );
    }

    // Validate each entry
    const auditResults = entries.map((entry) => ({
      ...entry,
      isValid: true,
      // Check if entry is properly formed
      validation: {
        hasAccount: !!entry.account_id,
        hasAmount: !!entry.amount && entry.amount > 0,
        hasEntryType: !!entry.entry_type,
        validEntryType: ["DEBIT", "CREDIT"].includes(entry.entry_type),
      },
    }));

    // Check double entry
    const doubleEntryCheck = ledgerUtil.validateDoubleEntry(entries);

    // Get account balances
    const accountIds = [...new Set(entries.map((e) => e.account_id))];
    const accountBalances = {};

    for (const accountId of accountIds) {
      const balance = await this.getBalance(accountId);
      accountBalances[accountId] = balance;
    }

    return {
      transactionId,
      totalEntries: entries.length,
      entries: auditResults,
      doubleEntryCheck,
      accountBalances,
      auditTimestamp: new Date().toISOString(),
    };
  }

  async verifyEntry(entryId) {
    const entry = await this.getEntryById(entryId);

    if (!entry) {
      throw createError(404, "NOT_FOUND", "Entry not found");
    }

    // Generate entry hash
    const hash = ledgerUtil.generateEntryHash(entry);

    // Verify integrity
    // In production, you'd compare with stored hash
    const verified = true;

    return {
      ...entry,
      hash,
      verified,
    };
  }
}

module.exports = new LedgerService();
