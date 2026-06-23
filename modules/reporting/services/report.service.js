const db = require("../../../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../config/logger");
const queueService = require("../../../common/services/queue.service");
const reportingUtil = require("../utils/report.util");
const {
  NotFound,
  BadRequest,
} = require("../../../common/middleware/error.middleware");

class ReportService {
  async generateBalanceReport(reportData) {
    const {
      accountId,
      startDate,
      endDate,
      generatedBy,
      format = "json",
    } = reportData;

    // Validate dates
    const dateValidation = reportingUtil.validateReportFilters({
      startDate,
      endDate,
    });
    if (!dateValidation.isValid) {
      throw new BadRequest(dateValidation.errors.join(", "));
    }

    // Get account details
    let account = null;
    if (accountId) {
      const accountResult = await db.query(
        "SELECT * FROM accounts WHERE id = $1",
        [accountId]
      );
      if (accountResult.rows.length > 0) {
        account = accountResult.rows[0];
      }
    }

    // Get balance data
    let balanceData;
    if (accountId) {
      balanceData = await this.getAccountBalanceHistory(
        accountId,
        startDate,
        endDate
      );
    } else {
      balanceData = await this.getSystemBalanceHistory(startDate, endDate);
    }

    // Generate report
    const reportId = uuidv4();
    const report = {
      id: reportId,
      type: "BALANCE",
      generatedBy,
      generatedAt: new Date().toISOString(),
      filters: { accountId, startDate, endDate },
      data: {
        account,
        balanceHistory: balanceData,
        summary: this.calculateBalanceSummary(balanceData),
      },
    };

    // Store report in database
    await this.saveReport(report);

    logger.info("Balance report generated", {
      reportId,
      accountId,
      generatedBy,
    });

    // If format is not JSON, process accordingly
    if (format !== "json") {
      return this.formatReportData(report, format);
    }

    return report;
  }

  async generateTransactionReport(reportData) {
    const {
      accountId,
      startDate,
      endDate,
      type,
      status,
      generatedBy,
      format = "json",
    } = reportData;

    const dateValidation = reportingUtil.validateReportFilters({
      startDate,
      endDate,
    });
    if (!dateValidation.isValid) {
      throw new BadRequest(dateValidation.errors.join(", "));
    }

    // Build query
    let query = `
            SELECT t.*, tl.account_id, tl.debit_amount, tl.credit_amount,
                   a.account_number, a.currency
            FROM transactions t
            JOIN transaction_lines tl ON t.id = tl.transaction_id
            LEFT JOIN accounts a ON tl.account_id = a.id
            WHERE t.created_at BETWEEN $1 AND $2
        `;
    let params = [startDate, endDate];
    let paramCount = 3;

    if (accountId) {
      query += ` AND tl.account_id = $${paramCount}`;
      params.push(accountId);
      paramCount++;
    }

    if (type) {
      query += ` AND t.type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (status) {
      query += ` AND t.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    query += " ORDER BY t.created_at DESC";

    const result = await db.query(query, params);

    // Generate report
    const reportId = uuidv4();
    const report = {
      id: reportId,
      type: "TRANSACTION",
      generatedBy,
      generatedAt: new Date().toISOString(),
      filters: { accountId, startDate, endDate, type, status },
      data: {
        transactions: result.rows,
        summary: this.calculateTransactionSummary(result.rows),
      },
    };

    await this.saveReport(report);

    logger.info("Transaction report generated", {
      reportId,
      accountId,
      generatedBy,
    });

    if (format !== "json") {
      return this.formatReportData(report, format);
    }

    return report;
  }

  async generateAuditReport(reportData) {
    const {
      startDate,
      endDate,
      action,
      entityType,
      userId,
      generatedBy,
      format = "json",
    } = reportData;

    const dateValidation = reportingUtil.validateReportFilters({
      startDate,
      endDate,
    });
    if (!dateValidation.isValid) {
      throw new BadRequest(dateValidation.errors.join(", "));
    }

    // Get audit logs
    let query = `
            SELECT * FROM audit_logs
            WHERE created_at BETWEEN $1 AND $2
        `;
    let params = [startDate, endDate];
    let paramCount = 3;

    if (action) {
      query += ` AND action = $${paramCount}`;
      params.push(action);
      paramCount++;
    }

    if (entityType) {
      query += ` AND entity_type = $${paramCount}`;
      params.push(entityType);
      paramCount++;
    }

    if (userId) {
      query += ` AND user_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    query += " ORDER BY created_at DESC";

    const result = await db.query(query, params);

    // Get user details if userId provided
    let user = null;
    if (userId) {
      const userResult = await db.query(
        "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
        [userId]
      );
      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
      }
    }

    // Generate report
    const reportId = uuidv4();
    const report = {
      id: reportId,
      type: "AUDIT",
      generatedBy,
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, action, entityType, userId },
      data: {
        user,
        auditLogs: result.rows,
        summary: this.calculateAuditSummary(result.rows),
      },
    };

    await this.saveReport(report);

    logger.info("Audit report generated", { reportId, userId, generatedBy });

    if (format !== "json") {
      return this.formatReportData(report, format);
    }

    return report;
  }

  async getReportById(reportId, userId) {
    const result = await db.query("SELECT * FROM reports WHERE id = $1", [
      reportId,
    ]);

    if (result.rows.length === 0) {
      throw new NotFound("Report not found");
    }

    const report = result.rows[0];

    // Check access
    if (report.generated_by !== userId) {
      // Check if user has admin role
      const userResult = await db.query(
        "SELECT role FROM users WHERE id = $1",
        [userId]
      );
      const userRole = userResult.rows[0]?.role || "user";
      if (userRole !== "admin") {
        throw new BadRequest("You do not have access to this report");
      }
    }

    return report;
  }

  async getReports(filters) {
    const { page, limit, type, userId } = filters;
    const offset = (page - 1) * limit;

    let conditions = [];
    let params = [];
    let paramCount = 1;

    if (type) {
      conditions.push(`type = $${paramCount}`);
      params.push(type);
      paramCount++;
    }

    if (userId) {
      conditions.push(`generated_by = $${paramCount}`);
      params.push(userId);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
            SELECT *
            FROM reports
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount}
            OFFSET $${paramCount + 1}
        `;

    const countQuery = `
            SELECT COUNT(*) as total
            FROM reports
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

  async downloadReport(reportId, format, userId) {
    const report = await this.getReportById(reportId, userId);

    return this.formatReportData(report, format);
  }

  async scheduleReport(reportConfig) {
    const { type, schedule, filters, format, recipient } = reportConfig;

    const job = await queueService.addToQueue(
      "reports",
      {
        type,
        schedule,
        filters,
        format,
        recipient,
      },
      {
        priority: 3,
        attempts: 3,
      }
    );

    logger.info("Report scheduled", { jobId: job.id, type, schedule });

    return job;
  }

  // Helper methods
  async saveReport(report) {
    await db.query(
      `INSERT INTO reports (
                id, type, generated_by, generated_at,
                filters, data, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        report.id,
        report.type,
        report.generatedBy,
        report.generatedAt,
        JSON.stringify(report.filters),
        JSON.stringify(report.data),
        new Date().toISOString(),
      ]
    );
  }

  async getAccountBalanceHistory(accountId, startDate, endDate) {
    const result = await db.query(
      `SELECT 
                DATE(created_at) as date,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as credits,
                SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as debits,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END) as net_change
             FROM ledger_entries
             WHERE account_id = $1
             AND created_at BETWEEN $2 AND $3
             GROUP BY DATE(created_at)
             ORDER BY date`,
      [accountId, startDate, endDate]
    );

    return result.rows;
  }

  async getSystemBalanceHistory(startDate, endDate) {
    const result = await db.query(
      `SELECT 
                DATE(created_at) as date,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as total_credits,
                SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END) as net_change
             FROM ledger_entries
             WHERE created_at BETWEEN $1 AND $2
             GROUP BY DATE(created_at)
             ORDER BY date`,
      [startDate, endDate]
    );

    return result.rows;
  }

  calculateBalanceSummary(balanceHistory) {
    let totalCredits = 0;
    let totalDebits = 0;
    let netChange = 0;

    for (const entry of balanceHistory) {
      totalCredits += parseFloat(entry.credits || 0);
      totalDebits += parseFloat(entry.debits || 0);
      netChange += parseFloat(entry.net_change || 0);
    }

    return {
      totalCredits: Math.round(totalCredits * 10000) / 10000,
      totalDebits: Math.round(totalDebits * 10000) / 10000,
      netChange: Math.round(netChange * 10000) / 10000,
      totalEntries: balanceHistory.length,
      startDate: balanceHistory[0]?.date || null,
      endDate: balanceHistory[balanceHistory.length - 1]?.date || null,
    };
  }

  calculateTransactionSummary(transactions) {
    const summary = {
      total: transactions.length,
      totalAmount: 0,
      byType: {},
      byStatus: {},
      byCurrency: {},
    };

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount) || 0;
      summary.totalAmount += amount;
      summary.byType[tx.type] = (summary.byType[tx.type] || 0) + 1;
      summary.byStatus[tx.status] = (summary.byStatus[tx.status] || 0) + 1;
      summary.byCurrency[tx.currency] =
        (summary.byCurrency[tx.currency] || 0) + amount;
    }

    return {
      ...summary,
      totalAmount: Math.round(summary.totalAmount * 10000) / 10000,
    };
  }

  calculateAuditSummary(auditLogs) {
    const summary = {
      total: auditLogs.length,
      byAction: {},
      byEntityType: {},
      uniqueUsers: new Set(),
    };

    for (const log of auditLogs) {
      summary.byAction[log.action] = (summary.byAction[log.action] || 0) + 1;
      summary.byEntityType[log.entity_type] =
        (summary.byEntityType[log.entity_type] || 0) + 1;
      if (log.user_id) {
        summary.uniqueUsers.add(log.user_id);
      }
    }

    return {
      ...summary,
      uniqueUsers: summary.uniqueUsers.size,
    };
  }

  async formatReportData(report, format) {
    const reportingUtil = require("../../../common/utils/reporting.util");

    if (format === "pdf") {
      const pdfData = await reportingUtil.generatePDF(report.data, {
        title: `${report.type} Report`,
        sections: [
          {
            title: "Summary",
            type: "summary",
            dataKey: "summary",
          },
          {
            title: "Details",
            type: "table",
            dataKey: this.getReportDataKey(report.type),
            columns: this.getReportColumns(report.type),
          },
        ],
      });

      return {
        id: report.id,
        data: pdfData,
        contentType: "application/pdf",
        filename: `${report.type.toLowerCase()}-report-${report.id}.pdf`,
      };
    }

    if (format === "csv") {
      const dataKey = this.getReportDataKey(report.type);
      const columns = this.getReportColumns(report.type);
      const csvData = reportingUtil.generateCSV(
        report.data[dataKey] || [],
        columns
      );

      return {
        id: report.id,
        data: csvData,
        contentType: "text/csv",
        filename: `${report.type.toLowerCase()}-report-${report.id}.csv`,
      };
    }

    return report;
  }

  getReportDataKey(type) {
    const map = {
      BALANCE: "balanceHistory",
      TRANSACTION: "transactions",
      AUDIT: "auditLogs",
    };
    return map[type] || "data";
  }

  getReportColumns(type) {
    const map = {
      BALANCE: [
        { key: "date", label: "Date" },
        { key: "credits", label: "Credits" },
        { key: "debits", label: "Debits" },
        { key: "net_change", label: "Net Change" },
      ],
      TRANSACTION: [
        { key: "reference", label: "Reference" },
        { key: "type", label: "Type" },
        { key: "amount", label: "Amount" },
        { key: "currency", label: "Currency" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created At" },
      ],
      AUDIT: [
        { key: "action", label: "Action" },
        { key: "entity_type", label: "Entity Type" },
        { key: "entity_id", label: "Entity ID" },
        { key: "user_id", label: "User ID" },
        { key: "created_at", label: "Created At" },
      ],
    };
    return map[type] || [];
  }
}

module.exports = new ReportService();
