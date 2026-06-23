const holdService = require("../services/hold.service");
const auditService = require("../../common/services/audit.service");
const logger = require("../../config/logger");
const cacheService = require("../../common/services/cache.service");

class HoldController {
  async createHold(req, res, next) {
    try {
      const { accountId, amount, reason, expiresIn } = req.body;
      const userId = req.user.id;

      const hold = await holdService.createHold({
        accountId,
        amount,
        reason,
        expiresIn: expiresIn || 24,
        userId,
      });

      await auditService.logAudit("HOLD_CREATED", {
        userId,
        entityType: "HOLD",
        entityId: hold.id,
        changes: {
          accountId,
          amount,
          reason,
          expiresAt: hold.expiresAt,
        },
      });

      // Invalidate balance cache
      await cacheService.invalidateAccountCache(accountId);

      res.status(201).json({
        success: true,
        data: hold,
        message: "Hold created successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getHold(req, res, next) {
    try {
      const { id } = req.params;
      const hold = await holdService.getHoldById(id);

      res.json({
        success: true,
        data: hold,
      });
    } catch (error) {
      next(error);
    }
  }

  async getHolds(req, res, next) {
    try {
      const { accountId, status, page = 1, limit = 20 } = req.query;
      const userId = req.user.id;

      const result = await holdService.getHolds({
        userId,
        accountId,
        status,
        page: parseInt(page),
        limit: parseInt(limit),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async releaseHold(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      const hold = await holdService.releaseHold(id, userId, reason);

      await auditService.logAudit("HOLD_RELEASED", {
        userId,
        entityType: "HOLD",
        entityId: id,
        changes: {
          accountId: hold.accountId,
          amount: hold.amount,
          reason,
        },
      });

      // Invalidate balance cache
      await cacheService.invalidateAccountCache(hold.accountId);

      res.json({
        success: true,
        data: hold,
        message: "Hold released successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async expireHold(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const hold = await holdService.expireHold(id, userId);

      await auditService.logAudit("HOLD_EXPIRED", {
        userId,
        entityType: "HOLD",
        entityId: id,
        changes: {
          accountId: hold.accountId,
          amount: hold.amount,
        },
      });

      // Invalidate balance cache
      await cacheService.invalidateAccountCache(hold.accountId);

      res.json({
        success: true,
        data: hold,
        message: "Hold expired successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getAccountHolds(req, res, next) {
    try {
      const { accountId } = req.params;
      const { status } = req.query;
      const userId = req.user.id;

      const holds = await holdService.getAccountHolds(
        accountId,
        userId,
        status
      );

      res.json({
        success: true,
        data: {
          accountId,
          holds,
          total: holds.length,
          totalAmount: holds.reduce((sum, h) => sum + parseFloat(h.amount), 0),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new HoldController();
