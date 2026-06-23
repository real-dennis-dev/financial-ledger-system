const transactionService = require("../services/transaction.service");
const accountService = require("../../accounts/services/account.service");
const ledgerService = require("../../ledger/services/ledger.service");
const { createError } = require("../../../common/middleware/error.middleware");
const idempotencyService = require("../../../common/services/idempotency.service");

class TransactionMiddleware {
  async validateTransaction(req, res, next) {
    try {
      const { type, sourceAccountId, destinationAccountId } = req.body;

      // Validate transaction type
      const validTypes = [
        "TRANSFER",
        "DEPOSIT",
        "WITHDRAWAL",
        "PAYMENT",
        "REFUND",
      ];
      if (!validTypes.includes(type)) {
        throw createError(
          422,
          "INVALID_TYPE",
          `Type must be one of: ${validTypes.join(", ")}`
        );
      }

      // For transfers, validate both accounts
      if (type === "TRANSFER") {
        // Validate source account
        const sourceAccount = await accountService.getAccountById(
          sourceAccountId
        );
        if (!sourceAccount) {
          throw createError(
            404,
            "SOURCE_ACCOUNT_NOT_FOUND",
            "Source account not found"
          );
        }

        if (sourceAccount.status === "FROZEN" || sourceAccount.frozen) {
          throw createError(
            403,
            "SOURCE_ACCOUNT_FROZEN",
            "Source account is frozen"
          );
        }

        // Validate destination account
        const destAccount = await accountService.getAccountById(
          destinationAccountId
        );
        if (!destAccount) {
          throw createError(
            404,
            "DESTINATION_ACCOUNT_NOT_FOUND",
            "Destination account not found"
          );
        }

        if (sourceAccount.id === destinationAccountId) {
          throw createError(
            422,
            "SAME_ACCOUNT",
            "Source and destination accounts must be different"
          );
        }

        // Store accounts for later use
        req.sourceAccount = sourceAccount;
        req.destinationAccount = destAccount;
      } else if (type === "DEPOSIT") {
        // Validate destination account for deposit
        const account = await accountService.getAccountById(
          destinationAccountId
        );
        if (!account) {
          throw createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
        }

        if (account.status === "FROZEN" || account.frozen) {
          throw createError(403, "ACCOUNT_FROZEN", "Account is frozen");
        }

        req.destinationAccount = account;
      } else if (type === "WITHDRAWAL") {
        // Validate source account for withdrawal
        const account = await accountService.getAccountById(sourceAccountId);
        if (!account) {
          throw createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
        }

        if (account.status === "FROZEN" || account.frozen) {
          throw createError(403, "ACCOUNT_FROZEN", "Account is frozen");
        }

        req.sourceAccount = account;
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  async checkBalance(req, res, next) {
    try {
      const { type, amount, sourceAccountId } = req.body;

      // Check balance for debit transactions
      if (type === "TRANSFER" || type === "WITHDRAWAL" || type === "PAYMENT") {
        const account = await accountService.getAccountById(sourceAccountId);

        if (!account) {
          throw createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
        }

        if (parseFloat(account.balance) < parseFloat(amount)) {
          throw createError(422, "INSUFFICIENT_BALANCE", {
            message: "Insufficient balance",
            balance: account.balance,
            required: amount,
          });
        }

        // Check available balance (considering holds)
        const holds = await db.query(
          "SELECT SUM(amount) as total FROM holds WHERE account_id = $1 AND status = $2",
          [sourceAccountId, "ACTIVE"]
        );

        const heldAmount = parseFloat(holds.rows[0].total) || 0;
        const availableBalance =
          parseFloat(account.available_balance) - heldAmount;

        if (availableBalance < parseFloat(amount)) {
          throw createError(422, "INSUFFICIENT_AVAILABLE_BALANCE", {
            message: "Insufficient available balance",
            availableBalance,
            required: amount,
            heldAmount,
          });
        }

        // Store balance info for later use
        req.balanceInfo = {
          ledgerBalance: account.balance,
          availableBalance,
          heldAmount,
          required: amount,
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  }

  async idempotencyCheck(req, res, next) {
    try {
      const idempotencyKey = req.headers["idempotency-key"];

      if (!idempotencyKey) {
        return next();
      }

      const result = await idempotencyService.checkIdempotency(idempotencyKey);

      if (result.exists) {
        // Return cached response
        return res.status(200).json({
          success: true,
          data: result.data,
          message: "Transaction already processed (idempotent)",
        });
      }

      req.idempotencyKey = idempotencyKey;
      next();
    } catch (error) {
      // If idempotency check fails, still allow the request
      // but log the error
      logger.error("Idempotency check failed:", error);
      next();
    }
  }

  async validateStatusTransition(req, res, next) {
    try {
      const { id } = req.params;
      const action = req.path.includes("cancel") ? "cancel" : "complete";

      const transaction = await transactionService.getById(id);

      if (!transaction) {
        throw createError(404, "NOT_FOUND", "Transaction not found");
      }

      // Validate status transition
      const validTransitions = {
        cancel: ["PENDING", "PROCESSING"],
        complete: ["PROCESSING", "PENDING"],
      };

      if (!validTransitions[action].includes(transaction.status)) {
        throw createError(
          422,
          "INVALID_STATUS_TRANSITION",
          `Cannot ${action} transaction with status: ${transaction.status}`
        );
      }

      req.transaction = transaction;
      next();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TransactionMiddleware();
