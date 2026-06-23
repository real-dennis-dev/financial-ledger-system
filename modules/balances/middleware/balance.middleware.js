const balanceService = require("../services/balance.service");
const logger = require("../../config/logger");

class BalanceMiddleware {
  async checkSufficientBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const { amount } = req.body;
      const userId = req.user.id;

      if (!amount) {
        return next();
      }

      const validation = await balanceService.validateSufficientBalance(
        accountId,
        amount,
        userId
      );

      if (!validation.valid) {
        return res.status(422).json({
          success: false,
          error: {
            code: "INSUFFICIENT_BALANCE",
            message: validation.message,
            details: {
              required: validation.required,
              available: validation.available,
              ledgerBalance: validation.ledgerBalance,
            },
          },
        });
      }

      // Attach balance info to request
      req.balanceInfo = validation;
      next();
    } catch (error) {
      next(error);
    }
  }

  async validateBalanceOperation(req, res, next) {
    try {
      const { accountId } = req.params;
      const { amount } = req.body;
      const userId = req.user.id;

      // Check if account exists
      await balanceService.getBalance(accountId, userId);

      // Validate amount is not zero
      if (parseFloat(amount) === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_AMOUNT",
            message: "Amount cannot be zero",
          },
        });
      }

      // Validate account is not frozen
      const account = await balanceService.getBalance(accountId, userId);
      if (account.frozen) {
        return res.status(403).json({
          success: false,
          error: {
            code: "ACCOUNT_FROZEN",
            message: "Account is frozen",
          },
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  validateBalanceUpdate(req, res, next) {
    const { amount } = req.body;

    // Check if amount is a valid number
    if (isNaN(parseFloat(amount)) || !isFinite(amount)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_AMOUNT",
          message: "Amount must be a valid number",
        },
      });
    }

    // Check if amount exceeds limits
    const maxAmount = 1000000000; // 1 billion
    if (Math.abs(parseFloat(amount)) > maxAmount) {
      return res.status(400).json({
        success: false,
        error: {
          code: "AMOUNT_EXCEEDS_LIMIT",
          message: `Amount exceeds maximum limit of ${maxAmount}`,
        },
      });
    }

    next();
  }
}

module.exports = new BalanceMiddleware();
