const bull = require("../../../config/bull");
const logger = require("../../../config/logger");
const reportService = require("../services/report.service");
const notificationService = require("../../../common/services/notification.service");
const db = require("../../../config/database");

class ReportJob {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = bull.getQueue("reports");
    if (!queue) return;

    // Generate scheduled reports
    queue.process("generate_scheduled", async (job) => {
      const { type, filters, format, recipient } = job.data;

      try {
        let report;

        switch (type) {
          case "BALANCE":
            report = await reportService.generateBalanceReport({
              ...filters,
              generatedBy: "SYSTEM",
            });
            break;
          case "TRANSACTION":
            report = await reportService.generateTransactionReport({
              ...filters,
              generatedBy: "SYSTEM",
            });
            break;
          case "AUDIT":
            report = await reportService.generateAuditReport({
              ...filters,
              generatedBy: "SYSTEM",
            });
            break;
          default:
            throw new Error(`Unsupported report type: ${type}`);
        }

        // Deliver report
        if (recipient) {
          await notificationService.sendEmail(
            recipient,
            `${type} Report - ${new Date().toISOString()}`,
            `Your ${type.toLowerCase()} report has been generated.`,
            {
              attachments: [
                {
                  filename: `${type.toLowerCase()}-report-${report.id}.${
                    format || "json"
                  }`,
                  content:
                    format === "pdf"
                      ? report.data
                      : JSON.stringify(report.data, null, 2),
                  contentType:
                    format === "pdf" ? "application/pdf" : "application/json",
                },
              ],
            }
          );
        }

        logger.info("Scheduled report generated", {
          type,
          reportId: report.id,
          recipient,
        });

        return { success: true, reportId: report.id };
      } catch (error) {
        logger.error("Scheduled report generation failed", {
          type,
          error: error.message,
        });
        throw error;
      }
    });

    // Deliver report
    queue.process("deliver", async (job) => {
      const { reportId, recipient, format } = job.data;

      try {
        const report = await reportService.getReportById(reportId, "SYSTEM");

        await notificationService.sendEmail(
          recipient,
          `Report ${reportId}`,
          `Your report has been generated.`,
          {
            attachments: [
              {
                filename: `report-${reportId}.${format || "json"}`,
                content:
                  format === "pdf"
                    ? report.data
                    : JSON.stringify(report.data, null, 2),
                contentType:
                  format === "pdf" ? "application/pdf" : "application/json",
              },
            ],
          }
        );

        logger.info("Report delivered", { reportId, recipient });
        return { success: true, reportId };
      } catch (error) {
        logger.error("Report delivery failed", {
          reportId,
          error: error.message,
        });
        throw error;
      }
    });

    // Cleanup old reports
    queue.process("cleanup", async (job) => {
      const { days = 90 } = job.data;

      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await db.query(
          "DELETE FROM reports WHERE created_at < $1 RETURNING id",
          [cutoffDate]
        );

        logger.info("Cleaned up old reports", {
          deletedCount: result.rowCount,
          days,
        });

        return { deletedCount: result.rowCount };
      } catch (error) {
        logger.error("Report cleanup failed", { error: error.message });
        throw error;
      }
    });
  }

  // Schedule recurring reports
  async scheduleDailyReports() {
    const schedule = "0 0 * * *"; // Daily at midnight
    const formats = ["json", "pdf"];

    for (const format of formats) {
      await bull.addJob(
        "reports",
        {
          type: "BALANCE",
          schedule,
          filters: {
            startDate: new Date(Date.now() - 86400000).toISOString(),
            endDate: new Date().toISOString(),
          },
          format,
          recipient: process.env.REPORT_RECIPIENT_EMAIL,
        },
        {
          priority: 2,
          attempts: 3,
        }
      );

      await bull.addJob(
        "reports",
        {
          type: "TRANSACTION",
          schedule,
          filters: {
            startDate: new Date(Date.now() - 86400000).toISOString(),
            endDate: new Date().toISOString(),
          },
          format,
          recipient: process.env.REPORT_RECIPIENT_EMAIL,
        },
        {
          priority: 2,
          attempts: 3,
        }
      );
    }

    logger.info("Scheduled daily reports");
  }

  async scheduleWeeklyReports() {
    const schedule = "0 0 * * 0"; // Weekly on Sunday

    await bull.addJob(
      "reports",
      {
        type: "AUDIT",
        schedule,
        filters: {
          startDate: new Date(Date.now() - 604800000).toISOString(),
          endDate: new Date().toISOString(),
        },
        format: "pdf",
        recipient:
          process.env.REPORT_RECIPIENT_EMAIL || "admin@financial-ledger.com",
      },
      {
        priority: 2,
        attempts: 3,
      }
    );

    logger.info("Scheduled weekly reports");
  }

  async cleanupOldReports(days = 90) {
    await bull.addJob(
      "reports",
      {
        action: "cleanup",
        days,
      },
      {
        priority: 5,
        attempts: 3,
      }
    );

    logger.info("Scheduled report cleanup", { days });
  }
}

module.exports = new ReportJob();
