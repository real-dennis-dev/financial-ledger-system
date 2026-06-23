const db = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../config/logger");
const queueService = require("../../../common/services/queue.service");
const reconciliationUtil = require("../utils/reconciliation.util");
const {
  NotFound,
  BadRequest,
} = require("../../../common/middleware/error.middleware");

class ReconciliationService {
  async startReconciliation(reconciliationData) {
    const { type, startDate, endDate, externalData, initiatedBy } =
      reconciliationData;

    // Get internal ledger balances
    const internalBalance = await this.getInternalLedgerBalance(
      startDate,
      endDate
    );

    // Get external balances (if provided)
    const externalBalance = externalData?.externalBalance || null;

    // Calculate discrepancy
    const discrepancy =
      externalBalance !== null
        ? reconciliationUtil.calculateDiscrepancy(
            internalBalance,
            externalBalance
          )
        : null;

    const reconciliationId = uuidv4();

    const result = await db.query(
      `INSERT INTO reconciliations (
                id, type, status, start_date, end_date,
                internal_balance, external_balance, discrepancy,
                created_at, verified_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
      [
        reconciliationId,
        type,
        "PENDING",
        startDate,
        endDate,
        internalBalance,
        externalBalance,
        discrepancy,
        new Date().toISOString(),
        initiatedBy,
      ]
    );

    const reconciliation = result.rows[0];

    // Queue verification job
    await queueService.addToQueue(
      "reconciliation",
      {
        reconciliationId,
        type: "verify",
      },
      {
        priority: 2,
        attempts: 3,
      }
    );

    logger.info("Reconciliation started", {
      reconciliationId,
      type,
      startDate,
      endDate,
      discrepancy,
    });

    return reconciliation;
  }

  async getReconciliationById(reconciliationId) {
    const result = await db.query(
      `SELECT r.*, 
                    u.email as verified_by_email,
                    u.first_name as verified_by_first_name,
                    u.last_name as verified_by_last_name
             FROM reconciliations r
             LEFT JOIN users u ON r.verified_by = u.id
             WHERE r.id = $1`,
      [reconciliationId]
    );

    if (result.rows.length === 0) {
      throw new NotFound("Reconciliation not found");
    }

    return result.rows[0];
  }

  async getReconciliations(filters) {
    const { page, limit, status, type, userId } = filters;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (status) {
      conditions.push(`status = $${paramCount}`);
      params.push(status);
      paramCount++;
    }

    if (type) {
      conditions.push(`type = $${paramCount}`);
      params.push(type);
      paramCount++;
    }

    if (userId) {
      conditions.push(`verified_by = $${paramCount}`);
      params.push(userId);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
            SELECT *
            FROM reconciliations
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount}
            OFFSET $${paramCount + 1}
        `;

    const countQuery = `
            SELECT COUNT(*) as total
            FROM reconciliations
            ${whereClause}
        `;

    params.push(limit, offset);

    const [results, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)),
    ]);

    return {
      data: results.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
      },
    };
  }

  async verifyReconciliation(reconciliationId, userId) {
    const reconciliation = await this.getReconciliationById(reconciliationId);

    if (reconciliation.status === "COMPLETED") {
      throw new BadRequest("Reconciliation already verified");
    }

    // Recalculate balances
    const internalBalance = await this.getInternalLedgerBalance(
      reconciliation.start_date,
      reconciliation.end_date
    );

    const externalBalance = reconciliation.external_balance;
    const discrepancy = reconciliationUtil.calculateDiscrepancy(
      internalBalance,
      externalBalance
    );

    const result = await db.query(
      `UPDATE reconciliations 
             SET status = $1,
                 internal_balance = $2,
                 discrepancy = $3,
                 verified_by = $4,
                 verified_at = $5,
                 updated_at = $6
             WHERE id = $7
             RETURNING *`,
      [
        discrepancy === 0 ? "COMPLETED" : "IN_PROGRESS",
        internalBalance,
        discrepancy,
        userId,
        new Date().toISOString(),
        new Date().toISOString(),
        reconciliationId,
      ]
    );

    const updatedReconciliation = result.rows[0];

    // If discrepancy found, queue for resolution
    if (discrepancy !== 0) {
      await queueService.addToQueue(
        "reconciliation",
        {
          reconciliationId,
          type: "discrepancy_alert",
          discrepancy,
        },
        {
          priority: 1,
          attempts: 3,
        }
      );
    }

    logger.info("Reconciliation verified", {
      reconciliationId,
      internalBalance,
      externalBalance,
      discrepancy,
    });

    return updatedReconciliation;
  }

  async resolveDiscrepancy(reconciliationId, resolution) {
    const { adjustmentAmount, adjustmentAccountId, notes, resolvedBy } =
      resolution;

    const reconciliation = await this.getReconciliationById(reconciliationId);

    if (reconciliation.status === "COMPLETED") {
      throw new BadRequest("Reconciliation already completed");
    }

    // Start a database transaction
    return await db.transaction(async (client) => {
      // If adjustment is needed
      if (adjustmentAmount && adjustmentAmount !== 0) {
        // Create adjustment transaction
        const adjustmentTransactionId = uuidv4();

        await client.query(
          `INSERT INTO transactions (
                        id, reference, status, type, amount,
                        currency, description, metadata, created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            adjustmentTransactionId,
            `ADJ-${Date.now()}`,
            "COMPLETED",
            "ADJUSTMENT",
            Math.abs(adjustmentAmount),
            reconciliation.currency || "USD",
            `Reconciliation adjustment: ${notes || "No notes provided"}`,
            JSON.stringify({
              reconciliationId,
              resolution,
              resolvedBy,
            }),
            new Date().toISOString(),
          ]
        );

        // Create transaction line
        await client.query(
          `INSERT INTO transaction_lines (
                        id, transaction_id, account_id,
                        debit_amount, credit_amount, entry_type
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            uuidv4(),
            adjustmentTransactionId,
            adjustmentAccountId,
            adjustmentAmount > 0 ? adjustmentAmount : 0,
            adjustmentAmount < 0 ? Math.abs(adjustmentAmount) : 0,
            "ADJUSTMENT",
          ]
        );

        // Update account balance
        await client.query(
          `UPDATE accounts 
                     SET balance = balance + $1,
                         updated_at = $2
                     WHERE id = $3`,
          [adjustmentAmount, new Date().toISOString(), adjustmentAccountId]
        );
      }

      // Update reconciliation
      const result = await client.query(
        `UPDATE reconciliations 
                 SET status = $1,
                     discrepancy = $2,
                     resolution = $3,
                     updated_at = $4
                 WHERE id = $5
                 RETURNING *`,
        [
          "COMPLETED",
          0,
          JSON.stringify({
            ...resolution,
            adjusted: adjustmentAmount || 0,
            resolvedAt: new Date().toISOString(),
          }),
          new Date().toISOString(),
          reconciliationId,
        ]
      );

      logger.info("Reconciliation discrepancy resolved", {
        reconciliationId,
        adjustmentAmount,
        resolvedBy,
      });

      return result.rows[0];
    });
  }

  async generateReport(reconciliationId, format = "json") {
    const reconciliation = await this.getReconciliationById(reconciliationId);

    // Get detailed reconciliation data
    const reportData = await this.getReconciliationDetails(reconciliationId);

    const formattedData =
      reconciliationUtil.formatReconciliationReport(reportData);

    if (format === "json") {
      return formattedData;
    }

    // For PDF/CSV, use reporting utility
    const reportingUtil = require("../../../common/utils/reporting.util");

    if (format === "pdf") {
      const pdfData = await reportingUtil.generatePDF(formattedData, {
        title: `Reconciliation Report - ${reconciliationId}`,
        sections: [
          {
            title: "Reconciliation Summary",
            type: "summary",
            dataKey: "summary",
          },
          {
            title: "Transaction Details",
            type: "table",
            dataKey: "transactions",
            columns: [
              { key: "reference", label: "Reference" },
              { key: "amount", label: "Amount" },
              { key: "type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "createdAt", label: "Date" },
            ],
          },
        ],
      });

      return {
        data: pdfData,
        contentType: "application/pdf",
        filename: `reconciliation-report-${reconciliationId}.pdf`,
      };
    }

    if (format === "csv") {
      const csvData = reportingUtil.generateCSV(reportData.transactions || [], [
        { key: "reference", label: "Reference" },
        { key: "amount", label: "Amount" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Date" },
      ]);

      return {
        data: csvData,
        contentType: "text/csv",
        filename: `reconciliation-report-${reconciliationId}.csv`,
      };
    }

    return formattedData;
  }

  async getInternalLedgerBalance(startDate, endDate) {
    const result = await db.query(
      `SELECT 
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as total_credits,
                SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as total_debits
             FROM ledger_entries
             WHERE created_at BETWEEN $1 AND $2`,
      [startDate, endDate]
    );

    const data = result.rows[0];
    return (
      (parseFloat(data.total_credits) || 0) -
      (parseFloat(data.total_debits) || 0)
    );
  }

  async getReconciliationDetails(reconciliationId) {
    // Get transactions during the period
    const reconciliation = await this.getReconciliationById(reconciliationId);

    const transactions = await db.query(
      `SELECT t.*, tl.account_id, tl.debit_amount, tl.credit_amount
             FROM transactions t
             JOIN transaction_lines tl ON t.id = tl.transaction_id
             WHERE t.created_at BETWEEN $1 AND $2
             ORDER BY t.created_at DESC`,
      [reconciliation.start_date, reconciliation.end_date]
    );

    const ledgerEntries = await db.query(
      `SELECT * FROM ledger_entries
             WHERE created_at BETWEEN $1 AND $2
             ORDER BY created_at DESC`,
      [reconciliation.start_date, reconciliation.end_date]
    );

    return {
      reconciliation,
      transactions: transactions.rows,
      ledgerEntries: ledgerEntries.rows,
    };
  }

  async compareLedgers(internalLedger, externalLedger) {
    return reconciliationUtil.compareBalances(internalLedger, externalLedger);
  }
}

module.exports = new ReconciliationService();
