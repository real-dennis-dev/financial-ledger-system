const reconciliationService = require("../services/reconciliation.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class ReconciliationController {
  async startReconciliation(req, res, next) {
    try {
      const reconciliationData = {
        ...req.body,
        initiatedBy: req.user.id,
      };

      const reconciliation = await reconciliationService.startReconciliation(
        reconciliationData
      );

      await auditService.logAudit("RECONCILIATION_STARTED", {
        userId: req.user.id,
        entityType: "RECONCILIATION",
        entityId: reconciliation.id,
        changes: reconciliationData,
      });

      res.status(201).json({
        success: true,
        data: reconciliation,
        message: "Reconciliation started successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getReconciliation(req, res, next) {
    try {
      const { id } = req.params;
      const reconciliation = await reconciliationService.getReconciliationById(
        id
      );

      res.json({
        success: true,
        data: reconciliation,
      });
    } catch (error) {
      next(error);
    }
  }

  async getReconciliations(req, res, next) {
    try {
      const { page = 1, limit = 20, status, type } = req.query;

      const result = await reconciliationService.getReconciliations({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        type,
        userId: req.user.id,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyReconciliation(req, res, next) {
    try {
      const { id } = req.params;

      const reconciliation = await reconciliationService.verifyReconciliation(
        id,
        req.user.id
      );

      await auditService.logAudit("RECONCILIATION_VERIFIED", {
        userId: req.user.id,
        entityType: "RECONCILIATION",
        entityId: id,
        changes: { verifiedBy: req.user.id },
      });

      res.json({
        success: true,
        data: reconciliation,
        message: "Reconciliation verified successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async resolveDiscrepancy(req, res, next) {
    try {
      const { id } = req.params;
      const resolution = {
        ...req.body,
        resolvedBy: req.user.id,
      };

      const reconciliation = await reconciliationService.resolveDiscrepancy(
        id,
        resolution
      );

      await auditService.logAudit("RECONCILIATION_RESOLVED", {
        userId: req.user.id,
        entityType: "RECONCILIATION",
        entityId: id,
        changes: resolution,
      });

      res.json({
        success: true,
        data: reconciliation,
        message: "Discrepancy resolved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getReconciliationReport(req, res, next) {
    try {
      const { id } = req.params;
      const { format = "json" } = req.query;

      const report = await reconciliationService.generateReport(id, format);

      if (format === "pdf" || format === "csv") {
        res.setHeader("Content-Type", report.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${report.filename}`
        );
        return res.send(report.data);
      }

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReconciliationController();
