const accountService = require("../services/account.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class AccountController {
  /**
   * Create a new account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async createAccount(req, res, next) {
    try {
      const accountData = {
        ...req.body,
        userId: req.user.id,
      };

      const account = await accountService.createAccount(accountData);

      await auditService.logAudit("ACCOUNT_CREATED", {
        userId: req.user.id,
        accountId: account.id,
        accountNumber: account.accountNumber,
        currency: account.currency,
        type: account.type,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.status(201).json({
        success: true,
        data: account,
        message: "Account created successfully",
      });
    } catch (error) {
      logger.error("Create account error:", error);
      next(error);
    }
  }

  /**
   * Get account by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getAccount(req, res, next) {
    try {
      const account = await accountService.getAccountById(req.params.id);

      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      logger.error("Get account error:", error);
      next(error);
    }
  }

  /**
   * Get user accounts
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getAccounts(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        currency: req.query.currency,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
      };

      const result = await accountService.getAccountsByUser(
        req.user.id,
        filters
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Get accounts error:", error);
      next(error);
    }
  }

  /**
   * Update account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async updateAccount(req, res, next) {
    try {
      const account = await accountService.updateAccount(
        req.params.id,
        req.body
      );

      await auditService.logAudit("ACCOUNT_UPDATED", {
        userId: req.user.id,
        accountId: account.id,
        accountNumber: account.accountNumber,
        updates: req.body,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: account,
        message: "Account updated successfully",
      });
    } catch (error) {
      logger.error("Update account error:", error);
      next(error);
    }
  }

  /**
   * Close account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async closeAccount(req, res, next) {
    try {
      await accountService.closeAccount(req.params.id);

      await auditService.logAudit("ACCOUNT_CLOSED", {
        userId: req.user.id,
        accountId: req.params.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Account closed successfully",
      });
    } catch (error) {
      logger.error("Close account error:", error);
      next(error);
    }
  }

  /**
   * Get account balance
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getAccountBalance(req, res, next) {
    try {
      const balance = await accountService.getBalance(req.params.id);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      logger.error("Get balance error:", error);
      next(error);
    }
  }

  /**
   * Get account statement
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async getAccountStatement(req, res, next) {
    try {
      const dateRange = {
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
      };

      const statement = await accountService.getStatement(
        req.params.id,
        dateRange
      );

      res.json({
        success: true,
        data: statement,
      });
    } catch (error) {
      logger.error("Get statement error:", error);
      next(error);
    }
  }

  /**
   * Freeze account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async freezeAccount(req, res, next) {
    try {
      const account = await accountService.freezeAccount(req.params.id);

      await auditService.logAudit("ACCOUNT_FROZEN", {
        userId: req.user.id,
        accountId: account.id,
        accountNumber: account.accountNumber,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: account,
        message: "Account frozen successfully",
      });
    } catch (error) {
      logger.error("Freeze account error:", error);
      next(error);
    }
  }

  /**
   * Unfreeze account
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async unfreezeAccount(req, res, next) {
    try {
      const account = await accountService.unfreezeAccount(req.params.id);

      await auditService.logAudit("ACCOUNT_UNFROZEN", {
        userId: req.user.id,
        accountId: account.id,
        accountNumber: account.accountNumber,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: account,
        message: "Account unfrozen successfully",
      });
    } catch (error) {
      logger.error("Unfreeze account error:", error);
      next(error);
    }
  }
}

module.exports = new AccountController();
