const nodemailer = require("nodemailer");
const axios = require("axios");
const logger = require("../../config/logger");
const queueService = require("./queue.service");

class NotificationService {
  constructor() {
    this.transporter = null;
    this.initializeEmail();
  }

  initializeEmail() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  async sendEmail(to, subject, body, options = {}) {
    try {
      if (!this.transporter) {
        throw new Error("Email transporter not configured");
      }

      const mailOptions = {
        from:
          options.from ||
          process.env.SMTP_FROM ||
          "noreply@financial-ledger.com",
        to,
        subject,
        html: body,
        ...options,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info("Email sent", {
        to,
        subject,
        messageId: info.messageId,
      });

      return info;
    } catch (error) {
      logger.error("Email send error:", error);
      throw error;
    }
  }

  async sendSMS(to, message) {
    try {
      const smsProvider = process.env.SMS_PROVIDER || "twilio";

      // Implement SMS provider specific logic
      // This is a placeholder
      logger.info("SMS sent", {
        to,
        message: message.substring(0, 100),
      });

      return {
        to,
        message,
        status: "sent",
      };
    } catch (error) {
      logger.error("SMS send error:", error);
      throw error;
    }
  }

  async pushNotification(userId, message, data = {}) {
    try {
      // Implement push notification logic
      // This is a placeholder
      logger.info("Push notification sent", {
        userId,
        message: message.substring(0, 100),
        data,
      });

      return {
        userId,
        message,
        data,
        status: "sent",
      };
    } catch (error) {
      logger.error("Push notification error:", error);
      throw error;
    }
  }

  async webhook(url, payload) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": this.generateWebhookSignature(payload),
        },
        timeout: 5000,
      });

      logger.info("Webhook sent", {
        url,
        status: response.status,
      });

      return response.data;
    } catch (error) {
      logger.error("Webhook error:", error);
      throw error;
    }
  }

  generateWebhookSignature(payload) {
    const crypto = require("crypto");
    const secret = process.env.WEBHOOK_SECRET || "webhook-secret";
    return crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");
  }

  // Template methods
  async sendTransactionNotification(email, transactionData) {
    const subject = `Transaction ${transactionData.reference} - ${transactionData.status}`;
    const body = this.generateTransactionEmail(transactionData);
    return this.sendEmail(email, subject, body);
  }

  async sendAccountStatement(email, accountData, statement) {
    const subject = `Account Statement - ${accountData.accountNumber}`;
    const body = this.generateStatementEmail(accountData, statement);
    return this.sendEmail(email, subject, body);
  }

  async sendPasswordReset(email, resetToken) {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    const subject = "Password Reset Request";
    const body = this.generatePasswordResetEmail(resetUrl);
    return this.sendEmail(email, subject, body);
  }

  async sendWelcomeEmail(email, userData) {
    const subject = "Welcome to Financial Ledger System";
    const body = this.generateWelcomeEmail(userData);
    return this.sendEmail(email, subject, body);
  }

  // Email templates
  generateTransactionEmail(transaction) {
    return `
      <h2>Transaction ${transaction.reference}</h2>
      <p>Status: ${transaction.status}</p>
      <p>Amount: ${transaction.amount} ${transaction.currency}</p>
      <p>Type: ${transaction.type}</p>
      <p>Description: ${transaction.description || "N/A"}</p>
      <p>Date: ${new Date(transaction.createdAt).toLocaleString()}</p>
    `;
  }

  generateStatementEmail(account, statement) {
    return `
      <h2>Account Statement</h2>
      <p>Account: ${account.accountNumber}</p>
      <p>Period: ${statement.startDate} to ${statement.endDate}</p>
      <p>Opening Balance: ${statement.openingBalance}</p>
      <p>Closing Balance: ${statement.closingBalance}</p>
      <p>Total Credits: ${statement.totalCredits}</p>
      <p>Total Debits: ${statement.totalDebits}</p>
    `;
  }

  generatePasswordResetEmail(resetUrl) {
    return `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
  }

  generateWelcomeEmail(userData) {
    return `
      <h2>Welcome to Financial Ledger System</h2>
      <p>Hello ${userData.firstName} ${userData.lastName},</p>
      <p>Your account has been created successfully.</p>
      <p>Email: ${userData.email}</p>
      <p>Please login to get started.</p>
    `;
  }

  // Queue-based notification
  async sendEmailAsync(to, subject, body, options = {}) {
    return queueService.addToQueue(
      "email",
      {
        to,
        subject,
        body,
        options,
      },
      {
        priority: 1,
        attempts: 3,
      }
    );
  }

  async sendWebhookAsync(url, payload) {
    return queueService.addToQueue(
      "webhook",
      {
        url,
        payload,
      },
      {
        priority: 2,
        attempts: 3,
      }
    );
  }
}

module.exports = new NotificationService();
