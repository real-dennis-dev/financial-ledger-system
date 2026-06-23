const bull = require("../../../config/bull");
const logger = require("../../../config/logger");
const reconciliationService = require("../services/reconciliation.service");
const notificationService = require("../../../common/services/notification.service");

class ReconciliationJob {
  constructor() {
    this.setupWorkers();
  }

  setupWorkers() {
    const queue = bull.getQueue("reconciliation");
    if (!queue) return;

    // Process reconciliation verification
    queue.process("verify", async (job) => {
      const { reconciliationId } = job.data;

      try {
        await reconciliationService.verifyReconciliation(
          reconciliationId,
          null
        );
        logger.info("Reconciliation verification completed", {
          reconciliationId,
        });
        return { success: true, reconciliationId };
      } catch (error) {
        logger.error("Reconciliation verification failed", {
          reconciliationId,
          error: error.message,
        });
        throw error;
      }
    });

    // Process discrepancy alerts
    queue.process("discrepancy_alert", async (job) => {
      const { reconciliationId, discrepancy } = job.data;

      try {
        // Send alert to reconciliation team
        await notificationService.sendEmail(
          process.env.RECONCILIATION_ALERT_EMAIL ||
            "reconciliation@financial-ledger.com",
          "Reconciliation Discrepancy Alert",
          `
                        <h2>Reconciliation Discrepancy Detected</h2>
                        <p>Reconciliation ID: ${reconciliationId}</p>
                        <p>Discrepancy Amount: $${Math.abs(discrepancy).toFixed(
                          2
                        )}</p>
                        <p>Please investigate and resolve.</p>
                        <a href="${
                          process.env.APP_URL
                        }/reconciliation/${reconciliationId}">View Details</a>
                    `
        );

        logger.info("Discrepancy alert sent", {
          reconciliationId,
          discrepancy,
        });
        return { success: true, reconciliationId };
      } catch (error) {
        logger.error("Discrepancy alert failed", {
          reconciliationId,
          error: error.message,
        });
        throw error;
      }
    });

    // Process reconciliation report generation
    queue.process("generate_report", async (job) => {
      const { reconciliationId, format } = job.data;

      try {
        const report = await reconciliationService.generateReport(
          reconciliationId,
          format || "json"
        );
        logger.info("Reconciliation report generated", { reconciliationId });
        return { success: true, reconciliationId, report };
      } catch (error) {
        logger.error("Reconciliation report generation failed", {
          reconciliationId,
          error: error.message,
        });
        throw error;
      }
    });
  }

  // Schedule jobs
  async scheduleReconciliation(type = "DAILY") {
    const now = new Date();
    let startDate, endDate;

    if (type === "DAILY") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(now);
      endDate.setHours(0, 0, 0, 0);
      endDate.setMilliseconds(-1);
    } else if (type === "HOURLY") {
      startDate = new Date(now);
      startDate.setHours(startDate.getHours() - 1);

      endDate = new Date(now);
      endDate.setMilliseconds(-1);
    }

    const reconciliationData = {
      type,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      initiatedBy: "SYSTEM",
    };

    // Add to queue
    await bull.addJob(
      "reconciliation",
      {
        ...reconciliationData,
        action: "start",
      },
      {
        priority: 1,
        attempts: 3,
      }
    );

    logger.info(`Scheduled ${type} reconciliation`, { startDate, endDate });
  }

  // Cleanup old reconciliation records
  async cleanupOldRecords(days = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const db = require("../../../config/database");
    const result = await db.query(
      "DELETE FROM reconciliations WHERE created_at < $1 AND status = $2 RETURNING id",
      [cutoffDate, "COMPLETED"]
    );

    logger.info("Cleaned up old reconciliations", {
      deletedCount: result.rowCount,
      days,
    });

    return result.rowCount;
  }
}

module.exports = new ReconciliationJob();
