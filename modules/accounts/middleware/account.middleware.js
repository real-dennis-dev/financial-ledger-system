const accountService = require("../services/account.service");
const logger = require("../../../config/logger");

/**
 * Validate that the authenticated user owns the account
 */
const validateAccountAccess = async (req, res, next) => {
  try {
    const accountId = req.params.id || req.params.accountId;
    const userId = req.user.id;

    await accountService.validateAccount(accountId, userId);

    next();
  } catch (error) {
    logger.error("Account access validation error:", error);
    next(error);
  }
};

/**
 * Validate account status
 */
const validateAccountStatus = async (req, res, next) => {
  try {
    const accountId = req.params.id || req.params.accountId;
    const account = await accountService.validateAccount(accountId);

    // Check if account is active
    if (account.status !== "ACTIVE") {
      const error = new Error("Account is not active");
      error.code = "ACCOUNT_INACTIVE";
      error.status = 403;
      throw error;
    }

    // Check if account is frozen
    if (account.frozen) {
      const error = new Error("Account is frozen");
      error.code = "ACCOUNT_FROZEN";
      error.status = 403;
      throw error;
    }

    req.account = account;
    next();
  } catch (error) {
    logger.error("Account status validation error:", error);
    next(error);
  }
};

/**
 * Validate sufficient balance
 */
const validateSufficientBalance = (amount) => {
  return async (req, res, next) => {
    try {
      const accountId = req.params.id || req.params.accountId;
      const transactionAmount = parseFloat(amount || req.body.amount);

      if (!transactionAmount || transactionAmount <= 0) {
        const error = new Error("Invalid amount");
        error.code = "INVALID_AMOUNT";
        error.status = 400;
        throw error;
      }

      const account = await accountService.getAccountById(accountId);

      if (parseFloat(account.availableBalance) < transactionAmount) {
        const error = new Error("Insufficient balance");
        error.code = "INSUFFICIENT_BALANCE";
        error.status = 422;
        error.details = {
          available: account.availableBalance,
          required: transactionAmount,
        };
        throw error;
      }

      req.validatedAmount = transactionAmount;
      next();
    } catch (error) {
      logger.error("Balance validation error:", error);
      next(error);
    }
  };
};

/**
 * Validate account ownership and existence
 */
const validateAccountOwnership = async (req, res, next) => {
  try {
    const accountId = req.params.id || req.params.accountId;
    const userId = req.user.id;

    const account = await accountService.getAccountById(accountId);

    if (account.userId !== userId) {
      const error = new Error("Access denied");
      error.code = "ACCESS_DENIED";
      error.status = 403;
      throw error;
    }

    req.validatedAccount = account;
    next();
  } catch (error) {
    logger.error("Account ownership validation error:", error);
    next(error);
  }
};

/**
 * Validate account closure requirements
 */
const validateAccountClosure = async (req, res, next) => {
  try {
    const accountId = req.params.id || req.params.accountId;
    const account = await accountService.getAccountById(accountId);

    // Check if account has any pending transactions
    const pendingResult = await db.query(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE account_id = $1 AND status IN ('PENDING', 'PROCESSING')`,
      [accountId]
    );

    if (parseInt(pendingResult.rows[0].count) > 0) {
      const error = new Error("Account has pending transactions");
      error.code = "HAS_PENDING_TRANSACTIONS";
      error.status = 400;
      throw error;
    }

    // Check if account balance is zero
    if (parseFloat(account.balance) !== 0) {
      const error = new Error("Account balance must be zero to close");
      error.code = "BALANCE_NOT_ZERO";
      error.status = 400;
      throw error;
    }

    next();
  } catch (error) {
    logger.error("Account closure validation error:", error);
    next(error);
  }
};

module.exports = {
  validateAccountAccess,
  validateAccountStatus,
  validateSufficientBalance,
  validateAccountOwnership,
  validateAccountClosure,
};
