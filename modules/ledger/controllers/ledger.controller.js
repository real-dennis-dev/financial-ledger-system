const ledgerService = require("../services/ledger.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class LedgerController {
  async createLedgerEntry(req, res, next) {
    try {
      const entryData = {
        ...req.body,
        createdBy: req.user.id,
      };

      const entry = await ledgerService.createEntry(entryData);

      await auditService.logAudit("LEDGER_ENTRY_CREATED", {
        userId: req.user.id,
        entityType: "LEDGER_ENTRY",
        entityId: entry.id,
        changes: entryData,
      });

      res.status(201).json({
        success: true,
        data: entry,
        message: "Ledger entry created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getLedgerEntries(req, res, next) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      const result = await ledgerService.getEntries(filters, { page, limit });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: "Ledger entries retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getLedgerEntry(req, res, next) {
    try {
      const entry = await ledgerService.getEntryById(req.params.id);

      if (!entry) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Ledger entry not found",
          },
        });
      }

      res.json({
        success: true,
        data: entry,
        message: "Ledger entry retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getAccountEntries(req, res, next) {
    try {
      const { accountId } = req.params;
      const { page = 1, limit = 20, ...filters } = req.query;

      const result = await ledgerService.getAccountEntries(accountId, filters, {
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: "Account entries retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getLedgerBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const { asOfDate } = req.query;

      const balance = await ledgerService.getBalance(accountId, { asOfDate });

      res.json({
        success: true,
        data: balance,
        message: "Balance retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async reconcileLedger(req, res, next) {
    try {
      const reconciliationData = {
        ...req.body,
        initiatedBy: req.user.id,
      };

      const result = await ledgerService.reconcile(reconciliationData);

      await auditService.logAudit("LEDGER_RECONCILIATION", {
        userId: req.user.id,
        entityType: "RECONCILIATION",
        changes: reconciliationData,
        result,
      });

      res.json({
        success: true,
        data: result,
        message: "Reconciliation completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async auditLedger(req, res, next) {
    try {
      const { transactionId } = req.params;

      const auditResult = await ledgerService.auditEntries(transactionId);

      await auditService.logAudit("LEDGER_AUDIT", {
        userId: req.user.id,
        entityType: "TRANSACTION",
        entityId: transactionId,
      });

      res.json({
        success: true,
        data: auditResult,
        message: "Audit completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LedgerController();
