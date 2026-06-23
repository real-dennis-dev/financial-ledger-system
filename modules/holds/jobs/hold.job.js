const bull = require("../../config/bull");
const holdService = require("../services/hold.service");
const logger = require("../../config/logger");
const notificationService = require("../../common/services/notification.service");
const auditService = require("../../common/services/audit.service");

class HoldJob {
  constructor() {
    this.setupProcessors();
    this.scheduleJobs();
  }

  setupProcessors() {
    // Process hold expiration
    bull.getQueue("holds").process(async (job) => {
      const { action } = job.data;

      switch (action) {
        case "expireExpiredHolds":
          return await this.expireExpiredHolds();
        case "cleanupCompletedHolds":
          return await this.cleanupCompletedHolds();
        case "sendHoldNotification":
          return await this.sendHoldNotification(job.data);
        default:
          throw new Error(`Unknown hold action: ${action}`);
      }
    });
  }

  scheduleJobs() {
    // Schedule hold expiration every 10 minutes
    bull
      .addJob(
        "holds",
        { action: "expireExpiredHolds" },
        {
          repeat: {
            every: 10 * 60 * 1000, // 10 minutes
          },
          jobId: "hold-expiration-scheduler",
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
      .catch((error) => {
        logger.error("Failed to schedule hold expiration job:", error);
      });

    // Schedule cleanup every night at 2 AM
    bull
      .addJob(
        "holds",
        { action: "cleanupCompletedHolds" },
        {
          repeat: {
            cron: "0 2 * * *", // 2 AM daily
          },
          jobId: "hold-cleanup-scheduler",
          removeOnComplete: true,
          removeOnFail: false,
        }
      )
      .catch((error) => {
        logger.error("Failed to schedule hold cleanup job:", error);
      });
  }

  async expireExpiredHolds() {
    logger.info("Running expired holds expiration job");

    try {
      const result = await holdService.expireExpiredHolds();

      logger.info(`Expired ${result.expired} holds`);

      // Notify about expired holds
      if (result.expired > 0) {
        for (const hold of result.holds) {
          await this.sendHoldNotification({
            holdId: hold.id,
            accountId: hold.account_id,
            amount: hold.amount,
            event: "EXPIRED",
          });
        }
      }

      return result;
    } catch (error) {
      logger.error("Error expiring holds:", error);
      throw error;
    }
  }

  async cleanupCompletedHolds() {
    logger.info("Running completed holds cleanup");

    try {
      // Delete holds older than 30 days
      const result = await db.query(
        `DELETE FROM holds 
         WHERE status IN ('RELEASED', 'EXPIRED')
           AND created_at < NOW() - INTERVAL '30 days'
         RETURNING id`
      );

      logger.info(`Cleaned up ${result.rows.length} old holds`);

      return {
        cleaned: result.rows.length,
        ids: result.rows.map((r) => r.id),
      };
    } catch (error) {
      logger.error("Error cleaning up holds:", error);
      throw error;
    }
  }

  async sendHoldNotification(data) {
    const { holdId, accountId, amount, event } = data;

    try {
      // Get account and user details
      const accountResult = await db.query(
        `SELECT a.*, u.email, u.first_name, u.last_name
         FROM accounts a
         JOIN users u ON a.user_id = u.id
         WHERE a.id = $1`,
        [accountId]
      );

      if (accountResult.rows.length === 0) {
        logger.warn(`Account ${accountId} not found for hold notification`);
        return;
      }

      const account = accountResult.rows[0];
      const message = this.getNotificationMessage(event, amount, account);

      // Send email notification
      await notificationService.sendEmail(
        account.email,
        message.subject,
        message.body
      );

      // Log notification
      await auditService.logAudit("HOLD_NOTIFICATION_SENT", {
        entityType: "HOLD",
        entityId: holdId,
        changes: {
          accountId,
          amount,
          event,
          recipient: account.email,
        },
      });

      logger.info(`Hold notification sent for hold ${holdId}`);
    } catch (error) {
      logger.error(`Error sending hold notification for ${holdId}:`, error);
    }
  }

  getNotificationMessage(event, amount, account) {
    const formattedAmount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: account.currency || "USD",
    }).format(amount);

    const templates = {
      EXPIRED: {
        subject: `Hold Expired - ${formattedAmount}`,
        body: `
          <h2>Hold Expired</h2>
          <p>Hello ${account.first_name},</p>
          <p>A hold of ${formattedAmount} has expired on your account.</p>
          <p>Account: ${account.account_number}</p>
          <p>The held amount has been released back to your available balance.</p>
          <p>Date: ${new Date().toLocaleString()}</p>
        `,
      },
      RELEASED: {
        subject: `Hold Released - ${formattedAmount}`,
        body: `
          <h2>Hold Released</h2>
          <p>Hello ${account.first_name},</p>
          <p>A hold of ${formattedAmount} has been released from your account.</p>
          <p>Account: ${account.account_number}</p>
          <p>The held amount has been returned to your available balance.</p>
          <p>Date: ${new Date().toLocaleString()}</p>
        `,
      },
      CREATED: {
        subject: `Hold Created - ${formattedAmount}`,
        body: `
          <h2>Hold Created</h2>
          <p>Hello ${account.first_name},</p>
          <p>A hold of ${formattedAmount} has been placed on your account.</p>
          <p>Account: ${account.account_number}</p>
          <p>This amount is temporarily reserved and unavailable for use.</p>
          <p>Date: ${new Date().toLocaleString()}</p>
        `,
      },
    };

    return templates[event] || templates.CREATED;
  }

  async triggerExpirationCheck() {
    return bull.addJob(
      "holds",
      { action: "expireExpiredHolds" },
      { jobId: `hold-expire-${Date.now()}` }
    );
  }

  async triggerCleanup() {
    return bull.addJob(
      "holds",
      { action: "cleanupCompletedHolds" },
      { jobId: `hold-cleanup-${Date.now()}` }
    );
  }

  async getJobMetrics() {
    return bull.getQueueMetrics("holds");
  }
}

module.exports = new HoldJob();
