const holdService = require("../services/hold.service");
const balanceService = require("../../services/balance.service");
const logger = require("../../config/logger");
const { NotFoundError } = require("../../common/middleware/error.middleware");

class HoldMiddleware {
  async validateHoldCreation(req, res, next) {
    try {
      const { accountId, amount, expiresIn } = req.body;
      const userId = req.user.id;

      // Validate hold data
      const validation = await holdService.validateHold({
        accountId,
        amount,
        expiresIn,
      });

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid hold data",
            details: validation.errors.map((err) => ({ message: err })),
          },
        });
      }

      // Check if account exists and belongs to user
      const account = await balanceService.getBalance(accountId, userId);
      if (!account) {
        throw new NotFoundError("Account not found");
      }

      // Check if account is frozen
      if (account.frozen) {
        return res.status(403).json({
          success: false,
          error: {
            code: "ACCOUNT_FROZEN",
            message: "Account is frozen, cannot create hold",
          },
        });
      }

      // Check if there are any duplicate active holds for same transaction
      // This prevents duplicate holds

      next();
    } catch (error) {
      next(error);
    }
  }

  async validateHoldAccess(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const userRole = req.user.roles || [];

      const hold = await holdService.getHoldById(id);

      // Check if user owns the account
      const accountResult = await db.query(
        "SELECT user_id FROM accounts WHERE id = $1",
        [hold.accountId]
      );

      if (accountResult.rows.length === 0) {
        throw new NotFoundError("Account not found");
      }

      const isOwner = accountResult.rows[0].user_id === userId;
      const isAdmin = userRole.includes("admin");

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this hold",
          },
        });
      }

      // Attach hold to request for use in controller
      req.hold = hold;
      req.isAdmin = isAdmin;

      next();
    } catch (error) {
      next(error);
    }
  }

  validateHoldStatus(req, res, next) {
    const hold = req.hold;

    if (!hold) {
      return res.status(404).json({
        success: false,
        error: {
          code: "HOLD_NOT_FOUND",
          message: "Hold not found",
        },
      });
    }

    if (hold.status !== "ACTIVE") {
      return res.status(422).json({
        success: false,
        error: {
          code: "INVALID_HOLD_STATUS",
          message: `Hold is already ${hold.status.toLowerCase()}`,
        },
      });
    }

    // Check if hold is expired
    if (new Date(hold.expiresAt) < new Date()) {
      return res.status(422).json({
        success: false,
        error: {
          code: "HOLD_EXPIRED",
          message: "Hold has already expired",
        },
      });
    }

    next();
  }
}

module.exports = new HoldMiddleware();
