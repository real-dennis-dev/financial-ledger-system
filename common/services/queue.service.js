const bull = require("../../config/bull"); // adjust path as needed
const logger = require("../../config/logger");

class QueueService {
  async addToQueue(queueName, jobData, options = {}) {
    try {
      const job = await bull.addJob(queueName, jobData, options);

      if (!job) {
        // Redis was down or queue unavailable – do not crash
        logger.warn("Job could not be added – Redis/queue unavailable", {
          queueName,
          data: jobData,
        });
        return {
          jobId: null,
          queueName,
          status: "unavailable",
          message: "Queue service is currently unavailable (Redis down)",
        };
      }

      logger.info("Job added to queue", {
        queueName,
        jobId: job.id,
        data: jobData,
      });

      return {
        jobId: job.id,
        queueName,
        status: "queued",
      };
    } catch (error) {
      // Extra safety net – should rarely reach here now
      logger.error("Unexpected error adding job to queue:", {
        message: error.message,
        queueName,
      });
      return {
        jobId: null,
        queueName,
        status: "error",
        message: error.message,
      };
    }
  }

  async processQueue(queueName, handler) {
    const queue = bull.getQueue(queueName);

    if (!queue) {
      logger.warn(
        `Cannot start processor for "${queueName}" – queue unavailable (Redis down)`
      );
      return;
    }

    try {
      queue.process(async (job) => {
        logger.info(`Processing job ${job.id} from ${queueName}`);

        try {
          const result = await handler(job.data);
          return result;
        } catch (error) {
          logger.error(`Job ${job.id} failed:`, {
            message: error.message,
            queueName,
          });
          throw error; // let Bull handle retries
        }
      });

      logger.info(`Queue processor started for ${queueName}`);
    } catch (error) {
      logger.error(`Failed to attach processor for ${queueName}:`, {
        message: error.message,
      });
    }
  }

  async getJobStatus(queueName, jobId) {
    return bull.getJobStatus(queueName, jobId);
  }

  async retryFailedJobs(queueName) {
    return bull.retryFailedJobs(queueName);
  }

  async pauseQueue(queueName) {
    return bull.pauseQueue(queueName);
  }

  async resumeQueue(queueName) {
    return bull.resumeQueue(queueName);
  }

  async getQueueMetrics(queueName) {
    return bull.getQueueMetrics(queueName);
  }

  async cleanQueue(queueName, age = 86400000, limit = 1000) {
    return bull.cleanOldJobs(queueName, age, limit);
  }

  // Convenience methods
  async scheduleTransaction(transactionData) {
    return this.addToQueue("transactions", transactionData, {
      priority: 1,
      attempts: 3,
    });
  }

  async scheduleReconciliation(reconciliationData) {
    return this.addToQueue("reconciliation", reconciliationData, {
      priority: 2,
      attempts: 2,
    });
  }

  async scheduleReport(reportData) {
    return this.addToQueue("reports", reportData, {
      priority: 3,
      attempts: 2,
    });
  }

  async scheduleNotification(notificationData) {
    return this.addToQueue("notifications", notificationData, {
      priority: 4,
      attempts: 3,
    });
  }

  async scheduleAudit(auditData) {
    return this.addToQueue("audit", auditData, {
      priority: 5,
      attempts: 3,
    });
  }

  // Helper so callers can check availability
  isAvailable() {
    return bull.isAvailable();
  }
}

module.exports = new QueueService();
