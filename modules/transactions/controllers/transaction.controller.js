const transactionService = require("../services/transaction.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class TransactionController {
  async initiateTransaction(req, res, next) {
    try {
      const transactionData = {
        ...req.body,
        initiatedBy: req.user.id,
        sourceAccountId: req.body.sourceAccountId,
        destinationAccountId: req.body.destinationAccountId,
      };

      const transaction = await transactionService.initiate(transactionData);

      await auditService.logTransaction(
        req.user.id,
        transaction.id,
        "TRANSACTION_INITIATED",
        {
          amount: transaction.amount,
          currency: transaction.currency,
          type: transaction.type,
          reference: transaction.reference,
        }
      );

      res.status(201).json({
        success: true,
        data: transaction,
        message: "Transaction initiated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransaction(req, res, next) {
    try {
      const transaction = await transactionService.getById(req.params.id);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Transaction not found",
          },
        });
      }

      // Check if user has access to this transaction
      if (
        transaction.userId !== req.user.id &&
        !req.user.roles.includes("admin")
      ) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You do not have access to this transaction",
          },
        });
      }

      res.json({
        success: true,
        data: transaction,
        message: "Transaction retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactions(req, res, next) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      const result = await transactionService.getTransactions(
        { ...filters, userId: req.user.id },
        { page, limit }
      );

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: "Transactions retrieved successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionStatus(req, res, next) {
    try {
      const status = await transactionService.getStatus(req.params.id);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Transaction not found",
          },
        });
      }

      res.json({
        success: true,
        data: status,
        message: "Transaction status retrieved",
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelTransaction(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const transaction = await transactionService.cancel(
        id,
        reason,
        req.user.id
      );

      await auditService.logTransaction(
        req.user.id,
        transaction.id,
        "TRANSACTION_CANCELLED",
        {
          reason,
          previousStatus: transaction.status,
        }
      );

      res.json({
        success: true,
        data: transaction,
        message: "Transaction cancelled successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async completeTransaction(req, res, next) {
    try {
      const { id } = req.params;

      const transaction = await transactionService.complete(id, req.user.id);

      await auditService.logTransaction(
        req.user.id,
        transaction.id,
        "TRANSACTION_COMPLETED",
        {
          completedAt: transaction.completed_at,
        }
      );

      res.json({
        success: true,
        data: transaction,
        message: "Transaction completed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getTransactionHistory(req, res, next) {
    try {
      const { page = 1, limit = 20, ...filters } = req.query;

      const result = await transactionService.getHistory(req.user.id, filters, {
        page,
        limit,
      });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
        message: "Transaction history retrieved",
      });
    } catch (error) {
      next(error);
    }
  }

  async getPendingTransactions(req, res, next) {
    try {
      const transactions = await transactionService.getPending(req.user.id);

      res.json({
        success: true,
        data: transactions,
        message: "Pending transactions retrieved",
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TransactionController();
