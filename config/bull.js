const Queue = require("bull");
const logger = require("./logger");

class BullManager {
  constructor() {
    this.queues = {};
    this.isRedisAvailable = false;
    this.initializeQueues();
  }

  getRedisConfig() {
    return {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB, 10) || 0,
      // Prevent Bull from crashing the process on connection issues
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Optional: retry strategy that never throws
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn(
            `Redis connection retry limit reached (${times}). Queues will remain unavailable until Redis is back.`
          );
          return null; // stop retrying aggressively
        }
        return Math.min(times * 200, 2000);
      },
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

    const redisConfig = this.getRedisConfig();

    queueConfigs.forEach(({ name, concurrency }) => {
      try {
        const queue = new Queue(name, {
          redis: redisConfig,
          defaultJobOptions: {
            attempts: parseInt(process.env.BULL_ATTEMPTS, 10) || 3,
            backoff: {
              type: "exponential",
              delay: parseInt(process.env.BULL_BACKOFF_DELAY, 10) || 5000,
            },
            timeout: 30000,
            removeOnComplete: 100,
            removeOnFail: 1000,
          },
          limiter: {
            max: 100,
            duration: 1000,
          },
          // settings that help survive Redis downtime
          settings: {
            lockDuration: 30000,
            stalledInterval: 30000,
            maxStalledCount: 1,
          },
        });

        // Catch connection / client errors so they never crash the process
        queue.on("error", (error) => {
          this.isRedisAvailable = false;
          logger.error(`Queue ${name} error (Redis may be down):`, {
            message: error.message,
            code: error.code,
          });
        });

        // Optional: detect successful connection
        queue.client.on("ready", () => {
          this.isRedisAvailable = true;
          logger.info(`Redis connected – queue "${name}" is ready`);
        });

        queue.client.on("end", () => {
          this.isRedisAvailable = false;
          logger.warn(`Redis connection ended for queue "${name}"`);
        });

        this.queues[name] = queue;
        this.setupQueueEvents(name);
        this.setupWorker(name, concurrency);
      } catch (error) {
        // Queue creation itself failed (e.g. invalid config)
        this.isRedisAvailable = false;
        logger.error(
          `Failed to create queue "${name}". Queue will be unavailable.`,
          { message: error.message }
        );
        // Store a null placeholder so getQueue() still returns something
        this.queues[name] = null;
      }
    });

    if (!this.isRedisAvailable) {
      logger.warn(
        "Bull queues initialized but Redis is not available. " +
          "Job processing and enqueueing will be disabled until Redis connects."
      );
    }
  }

  setupQueueEvents(queueName) {
    const queue = this.queues[queueName];
    if (!queue) return;

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
        result,
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
    if (!queue) return;

    // Default placeholder – override in modules via QueueService.processQueue
    queue.process(concurrency, async (job) => {
      logger.info(`Processing job ${job.id} in ${queueName}`);
      throw new Error(`Worker not implemented for ${queueName}`);
    });
  }

  getQueue(name) {
    return this.queues[name] || null;
  }

  isAvailable() {
    return this.isRedisAvailable;
  }

  async addJob(queueName, data, options = {}) {
    const queue = this.queues[queueName];

    if (!queue) {
      logger.warn(
        `Cannot add job – queue "${queueName}" is not available (Redis down or failed to init)`
      );
      return null;
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
      removeOnComplete: options.removeOnComplete ?? true,
      removeOnFail: options.removeOnFail || 1000,
      ...options,
    };

    try {
      const job = await queue.add(data, jobOptions);
      logger.info(`Job ${job.id} added to ${queueName}`);
      return job;
    } catch (error) {
      this.isRedisAvailable = false;
      logger.error(`Failed to add job to ${queueName} (Redis may be down):`, {
        message: error.message,
        code: error.code,
      });
      // Do NOT re-throw – keep the server alive
      return null;
    }
  }

  async getJobStatus(queueName, jobId) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`getJobStatus skipped – queue "${queueName}" unavailable`);
      return { exists: false, error: "Queue unavailable (Redis down)" };
    }

    try {
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
    } catch (error) {
      this.isRedisAvailable = false;
      logger.error(`getJobStatus failed for ${queueName}:`, {
        message: error.message,
      });
      return { exists: false, error: error.message };
    }
  }

  async retryFailedJobs(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`retryFailedJobs skipped – queue "${queueName}" unavailable`);
      return [];
    }

    try {
      const failedJobs = await queue.getFailed();
      const results = [];

      for (const job of failedJobs) {
        try {
          await job.retry();
          results.push({ jobId: job.id, status: "retried" });
        } catch (error) {
          results.push({
            jobId: job.id,
            status: "error",
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      this.isRedisAvailable = false;
      logger.error(`retryFailedJobs failed for ${queueName}:`, {
        message: error.message,
      });
      return [];
    }
  }

  async cleanOldJobs(queueName, age = 86400000, limit = 1000) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`cleanOldJobs skipped – queue "${queueName}" unavailable`);
      return { completed: 0, failed: 0 };
    }

    try {
      const cleaned = await queue.clean(age, "completed", limit);
      const cleanedFailed = await queue.clean(age, "failed", limit);
      return { completed: cleaned.length, failed: cleanedFailed.length };
    } catch (error) {
      this.isRedisAvailable = false;
      logger.error(`Failed to clean ${queueName}:`, { message: error.message });
      return { completed: 0, failed: 0 };
    }
  }

  async pauseQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`pauseQueue skipped – queue "${queueName}" unavailable`);
      return { status: "unavailable" };
    }

    try {
      await queue.pause();
      return { status: "paused" };
    } catch (error) {
      logger.error(`pauseQueue failed for ${queueName}:`, {
        message: error.message,
      });
      return { status: "error", error: error.message };
    }
  }

  async resumeQueue(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`resumeQueue skipped – queue "${queueName}" unavailable`);
      return { status: "unavailable" };
    }

    try {
      await queue.resume();
      return { status: "resumed" };
    } catch (error) {
      logger.error(`resumeQueue failed for ${queueName}:`, {
        message: error.message,
      });
      return { status: "error", error: error.message };
    }
  }

  async getQueueMetrics(queueName) {
    const queue = this.queues[queueName];
    if (!queue) {
      logger.warn(`getQueueMetrics skipped – queue "${queueName}" unavailable`);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
        available: false,
      };
    }

    try {
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
        available: true,
      };
    } catch (error) {
      this.isRedisAvailable = false;
      logger.error(`getQueueMetrics failed for ${queueName}:`, {
        message: error.message,
      });
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
        available: false,
        error: error.message,
      };
    }
  }

  async close() {
    const closePromises = Object.values(this.queues)
      .filter(Boolean)
      .map((queue) =>
        queue.close().catch((err) => {
          logger.warn("Error closing queue:", err.message);
        })
      );

    await Promise.all(closePromises);
    logger.info("All Bull queues closed (or attempted to close)");
  }
}

module.exports = new BullManager();
