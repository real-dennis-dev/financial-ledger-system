const bull = require("../../config/bull");
const logger = require("../../config/logger");

class QueueService {
  async addToQueue(queueName, jobData, options = {}) {
    try {
      const job = await bull.addJob(queueName, jobData, options);

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
      logger.error("Failed to add job to queue:", error);
      throw error;
    }
  }

  async processQueue(queueName, handler) {
    const queue = bull.getQueue(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    queue.process(async (job) => {
      logger.info(`Processing job ${job.id} from ${queueName}`);

      try {
        const result = await handler(job.data);
        return result;
      } catch (error) {
        logger.error(`Job ${job.id} failed:`, error);
        throw error;
      }
    });

    logger.info(`Queue processor started for ${queueName}`);
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

  // Convenience methods for specific queues
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
}

module.exports = new QueueService();
