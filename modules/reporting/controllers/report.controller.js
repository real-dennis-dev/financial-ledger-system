const reportService = require("../services/report.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class ReportController {
  async generateBalanceReport(req, res, next) {
    try {
      const reportData = {
        ...req.body,
        generatedBy: req.user.id,
      };

      const report = await reportService.generateBalanceReport(reportData);

      await auditService.logAudit("REPORT_GENERATED", {
        userId: req.user.id,
        entityType: "REPORT",
        entityId: report.id,
        changes: { type: "BALANCE", filters: req.body },
      });

      // If format is not JSON, return file
      if (req.body.format && req.body.format !== "json") {
        return this.downloadReportResponse(res, report, req.body.format);
      }

      res.json({
        success: true,
        data: report,
        message: "Balance report generated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async generateTransactionReport(req, res, next) {
    try {
      const reportData = {
        ...req.body,
        generatedBy: req.user.id,
      };

      const report = await reportService.generateTransactionReport(reportData);

      await auditService.logAudit("REPORT_GENERATED", {
        userId: req.user.id,
        entityType: "REPORT",
        entityId: report.id,
        changes: { type: "TRANSACTION", filters: req.body },
      });

      if (req.body.format && req.body.format !== "json") {
        return this.downloadReportResponse(res, report, req.body.format);
      }

      res.json({
        success: true,
        data: report,
        message: "Transaction report generated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async generateAuditReport(req, res, next) {
    try {
      const reportData = {
        ...req.body,
        generatedBy: req.user.id,
      };

      const report = await reportService.generateAuditReport(reportData);

      await auditService.logAudit("REPORT_GENERATED", {
        userId: req.user.id,
        entityType: "REPORT",
        entityId: report.id,
        changes: { type: "AUDIT", filters: req.body },
      });

      if (req.body.format && req.body.format !== "json") {
        return this.downloadReportResponse(res, report, req.body.format);
      }

      res.json({
        success: true,
        data: report,
        message: "Audit report generated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getReports(req, res, next) {
    try {
      const { page = 1, limit = 20, type } = req.query;

      const result = await reportService.getReports({
        page: parseInt(page),
        limit: parseInt(limit),
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

  async getReport(req, res, next) {
    try {
      const { id } = req.params;
      const report = await reportService.getReportById(id, req.user.id);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  async downloadReport(req, res, next) {
    try {
      const { id } = req.params;
      const { format = "pdf" } = req.query;

      const report = await reportService.downloadReport(
        id,
        format,
        req.user.id
      );

      this.downloadReportResponse(res, report, format);
    } catch (error) {
      next(error);
    }
  }

  downloadReportResponse(res, report, format) {
    const contentType = format === "pdf" ? "application/pdf" : "text/csv";
    const extension = format === "pdf" ? "pdf" : "csv";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=report-${report.id}.${extension}`
    );

    if (format === "pdf") {
      res.send(report.data);
    } else {
      res.send(report.data);
    }
  }
}

module.exports = new ReportController();
