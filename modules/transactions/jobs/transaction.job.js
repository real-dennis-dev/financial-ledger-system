const bull = require("../../../config/bull");
const logger = require("../../../config/logger");
const transactionService = require("../services/transaction.service");

class TransactionJobs {
  constructor() {
    this.initializeWorkers();
  }

  initializeWorkers() {
    // Process pending transactions
    const transactionQueue = bull.getQueue("transactions");
    transactionQueue.process(5, async (job) => {
      logger.info(`Processing transaction job ${job.id}`, job.data);

      try {
        const { transactionId } = job.data;
        const result = await transactionService.process(transactionId);

        logger.info(`Transaction job ${job.id} completed`, {
          transactionId,
          status: result.status,
        });

        return result;
      } catch (error) {
        logger.error(`Transaction job ${job.id} failed:`, error);
        throw error;
      }
    });

    // Settlement worker
    const settlementQueue = bull.getQueue("settlement");
    settlementQueue.process(2, async (job) => {
      logger.info(`Processing settlement job ${job.id}`, job.data);

      try {
        const { transactionId } = job.data;
        const result = await transactionService.settle(transactionId);

        logger.info(`Settlement job ${job.id} completed`, {
          transactionId: result.id,
          reference: result.reference,
        });

        return result;
      } catch (error) {
        logger.error(`Settlement job ${job.id} failed:`, error);
        throw error;
      }
    });
  }

  // Schedule recurring jobs
  async scheduleRecurringJobs() {
    // Process pending transactions every 5 minutes
    const transactionQueue = bull.getQueue("transactions");
    await transactionQueue.add(
      { type: "recurring", action: "processPending" },
      {
        repeat: { cron: "*/5 * * * *" },
        jobId: "processPendingTransactions",
      }
    );

    // Settle completed transactions every 15 minutes
    const settlementQueue = bull.getQueue("settlement");
    await settlementQueue.add(
      { type: "recurring", action: "settleCompleted" },
      {
        repeat: { cron: "*/15 * * * *" },
        jobId: "settleTransactions",
      }
    );

    // Cleanup expired transactions daily at midnight
    const cleanupQueue = bull.getQueue("transactions");
    await cleanupQueue.add(
      { type: "recurring", action: "cleanupExpired" },
      {
        repeat: { cron: "0 0 * * *" },
        jobId: "cleanupExpiredTransactions",
      }
    );

    logger.info("Recurring transaction jobs scheduled");
  }

  // Job handlers
  async handleProcessPending() {
    logger.info("Processing pending transactions");
    try {
      // Get all pending transactions
      const result = await db.query(
        `SELECT id FROM transactions 
         WHERE status = 'PENDING' 
         AND created_at < NOW() - INTERVAL '5 minutes'`
      );

      for (const row of result.rows) {
        await transactionService.process(row.id);
      }

      logger.info(`Processed ${result.rows.length} pending transactions`);
    } catch (error) {
      logger.error("Error processing pending transactions:", error);
    }
  }

  async handleSettleCompleted() {
    logger.info("Settling completed transactions");
    try {
      // Get completed transactions that need settlement
      const result = await db.query(
        `SELECT id FROM transactions 
         WHERE status = 'COMPLETED' 
         AND (metadata->>'settled') IS NULL
         AND completed_at < NOW() - INTERVAL '30 minutes'`
      );

      for (const row of result.rows) {
        await transactionService.settle(row.id);
      }

      logger.info(`Settled ${result.rows.length} transactions`);
    } catch (error) {
      logger.error("Error settling transactions:", error);
    }
  }

  async handleCleanupExpired() {
    logger.info("Cleaning up expired transactions");
    try {
      // Clean transactions older than 30 days
      const result = await db.query(
        `DELETE FROM transactions 
         WHERE status IN ('COMPLETED', 'FAILED', 'CANCELLED')
         AND created_at < NOW() - INTERVAL '30 days'
         RETURNING id`
      );

      logger.info(`Cleaned up ${result.rows.length} expired transactions`);
    } catch (error) {
      logger.error("Error cleaning up expired transactions:", error);
    }
  }

  // Manual job triggers
  async processTransaction(transactionId) {
    return transactionService.process(transactionId);
  }

  async settleTransaction(transactionId) {
    return transactionService.settle(transactionId);
  }

  async retryFailedTransaction(transactionId) {
    const transaction = await transactionService.getById(transactionId);

    if (!transaction || transaction.status !== "FAILED") {
      throw new Error("Transaction is not failed");
    }

    // Reset status and retry
    await db.query(
      `UPDATE transactions 
       SET status = 'PENDING', 
           updated_at = CURRENT_TIMESTAMP,
           metadata = jsonb_set(metadata, '{retryCount}', 
             COALESCE(metadata->'retryCount', '0')::int + 1)
       WHERE id = $1`,
      [transactionId]
    );

    return transactionService.process(transactionId);
  }
}

module.exports = new TransactionJobs();
