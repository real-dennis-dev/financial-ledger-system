const balanceService = require("../services/balance.service");
const auditService = require("../../common/services/audit.service");
const cacheService = require("../../common/services/cache.service");
const logger = require("../../config/logger");

class BalanceController {
  async getBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;

      const balance = await balanceService.getBalance(accountId, userId);

      // Cache the balance for quick access
      await cacheService.setBalance(accountId, balance, 300);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAvailableBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;

      const availableBalance = await balanceService.getAvailableBalance(
        accountId,
        userId
      );

      res.json({
        success: true,
        data: availableBalance,
      });
    } catch (error) {
      next(error);
    }
  }

  async getBalanceHistory(req, res, next) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;
      const { fromDate, toDate, limit = 50, offset = 0 } = req.query;

      const history = await balanceService.getBalanceHistory(
        accountId,
        userId,
        { fromDate, toDate },
        { limit: parseInt(limit), offset: parseInt(offset) }
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const { amount, reason, reference } = req.body;
      const userId = req.user.id;

      const result = await balanceService.updateBalance(
        accountId,
        amount,
        reason,
        userId,
        reference
      );

      await auditService.logAudit("BALANCE_UPDATED", {
        userId,
        entityType: "BALANCE",
        entityId: accountId,
        changes: {
          amount,
          reason,
          reference,
          newBalance: result.balance,
        },
      });

      // Invalidate cache
      await cacheService.invalidateAccountCache(accountId);

      res.json({
        success: true,
        data: result,
        message: "Balance updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getHeldBalance(req, res, next) {
    try {
      const { accountId } = req.params;
      const userId = req.user.id;

      const heldBalance = await balanceService.getHeldAmounts(
        accountId,
        userId
      );

      res.json({
        success: true,
        data: {
          accountId,
          heldAmount: heldBalance.totalHeld,
          holds: heldBalance.holds,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BalanceController();
