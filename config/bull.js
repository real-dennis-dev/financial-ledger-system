const Queue = require("bull");
const redis = require("./redis");
const logger = require("./logger");

class BullManager {
  constructor() {
    this.queues = {};
    this.initializeQueues();
  }

  getRedisConfig() {
    return {
      host: process.env.BULL_REDIS_HOST || process.env.REDIS_HOST,
      port:
        parseInt(process.env.BULL_REDIS_PORT) ||
        parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      prefix: "bull",
    };
  }

  initializeQueues() {
    const queueConfigs = [
      { name: "transactions", concurrency: 5 },
      { name: "reconciliation", concurrency: 2 },
      { name: "reports", concurrency: 3 },
      { name: "holds", concurrency: 3 },
      { name: "notifications", concurrency: 5 },
      { name: "audit", concurrency: 3 },
      { name: "balance-update", concurrency: 4 },
      { name: "settlement", concurrency: 2 },
      { name: "email", concurrency: 3 },
      { name: "webhook", concurrency: 5 },
    ];

    queueConfigs.forEach(({ name, concurrency }) => {
      this.queues[name] = new Queue(name, {
        redis: this.getRedisConfig(),
        defaultJobOptions: {
          attempts: parseInt(process.env.BULL_ATTEMPTS) || 3,
          backoff: {
            type: "exponential",
            delay: parseInt(process.env.BULL_BACKOFF_DELAY) || 5000,
          },
          timeout: 30000,
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
        limiter: {
          max: 100,
          duration: 1000,
        },
      });

      this.setupQueueEvents(name);
      this.setupWorker(name, concurrency);
    });
  }

  setupQueueEvents(queueName) {
    const queue = this.queues[queueName];

    queue.on("error", (error) => {
      logger.error(`Queue ${queueName} error:`, error);
    });

    queue.on("waiting", (jobId) => {
      logger.debug(`Job ${jobId} waiting in ${queueName}`);
    });

    queue.on("active", (job) => {
      logger.debug(`Job ${job.id} active in ${queueName}`, {
        data: job.data,
        attempts: job.attemptsMade,
      });
    });

    queue.on("stalled", (job) => {
      logger.warn(`Job ${job.id} stalled in ${queueName}`);
    });

    queue.on("progress", (job, progress) => {
      logger.debug(`Job ${job.id} progress: ${progress}% in ${queueName}`);
    });

    queue.on("completed", (job, result) => {
      logger.info(`Job ${job.id} completed in ${queueName}`, {
        duration: job.finishedOn - job.processedOn,
        result: result,
      });
    });

    queue.on("failed", (job, error) => {
      logger.error(`Job ${job.id} failed in ${queueName}:`, {
        error: error.message,
        attempts: job.attemptsMade,
        data: job.data,
      });
    });

    queue.on("paused", () => {
      logger.warn(`Queue ${queueName} paused`);
    });

    queue.on("resumed", () => {
      logger.info(`Queue ${queueName} resumed`);
    });

    queue.on("cleaned", (jobs, type) => {
      logger.info(`Cleaned ${jobs.length} ${type} jobs from ${queueName}`);
    });
  }

  setupWorker(queueName, concurrency) {
    const queue = this.queues[queueName];

    // This will be overridden by specific workers in modules
    queue.process(concurrency, async (job) => {
      logger.info(`Processing job ${job.id} in ${queueName}`);
      throw new Error(`Worker not implemented for ${queueName}`);
    });
  }

  getQueue(name) {
    return this.queues[name];
  }

  async addJob(queueName, data, options = {}) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const jobOptions = {
      jobId: options.idempotencyKey,
      priority: options.priority || 1,
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: "exponential",
        delay: 5000,
      },
      timeout: options.timeout || 30000,
      removeOnComplete: options.removeOnComplete || true,
      removeOnFail: options.removeOnFail || 1000,
      ...options,
    };

    try {
      const job = await queue.add(data, jobOptions);
      logger.info(`Job ${job.id} added to ${queueName}`);
      return job;
    } catch (error) {
      logger.error(`Failed to add job to ${queueName}:`, error);
      throw error;
    }
  }

  async getJobStatus(queueName, jobId) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return { exists: false };
    }

    const state = await job.getState();
    const progress = await job.progress();

    return {
      exists: true,
      id: job.id,
      state,
      progress,
      attempts: job.attemptsMade,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  async retryFailedJobs(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const failedJobs = await queue.getFailed();
    const results = [];

    for (const job of failedJobs) {
      try {
        await job.retry();
        results.push({ jobId: job.id, status: "retried" });
      } catch (error) {
        results.push({ jobId: job.id, status: "error", error: error.message });
      }
    }

    return results;
  }

  async cleanOldJobs(queueName, age = 86400000, limit = 1000) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    try {
      const cleaned = await queue.clean(age, limit, "completed");
      const cleanedFailed = await queue.clean(age, limit, "failed");
      return { completed: cleaned.length, failed: cleanedFailed.length };
    } catch (error) {
      logger.error(`Failed to clean ${queueName}:`, error);
      throw error;
    }
  }

  async pauseQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.pause();
    return { status: "paused" };
  }

  async resumeQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    await queue.resume();
    return { status: "resumed" };
  }

  async getQueueMetrics(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  async close() {
    const closePromises = Object.values(this.queues).map((queue) =>
      queue.close()
    );
    await Promise.all(closePromises);
    logger.info("All Bull queues closed");
  }
}

module.exports = new BullManager();
