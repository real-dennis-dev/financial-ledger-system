const ledgerService = require("../services/ledger.service");
const accountService = require("../../accounts/services/account.service");
const { createError } = require("../../../common/middleware/error.middleware");

class LedgerMiddleware {
  async validateEntry(req, res, next) {
    try {
      const { accountId, amount, entryType, transactionId } = req.body;

      // Validate account exists
      const account = await accountService.getAccountById(accountId);
      if (!account) {
        throw createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
      }

      // Validate account status
      if (account.status === "FROZEN" || account.frozen) {
        throw createError(403, "ACCOUNT_FROZEN", "Account is frozen");
      }

      // Validate amount
      if (amount <= 0) {
        throw createError(
          422,
          "INVALID_AMOUNT",
          "Amount must be greater than 0"
        );
      }

      // Validate entry type
      if (!["DEBIT", "CREDIT"].includes(entryType)) {
        throw createError(
          422,
          "INVALID_ENTRY_TYPE",
          "Entry type must be DEBIT or CREDIT"
        );
      }

      // If transactionId provided, validate it exists
      if (transactionId) {
        const transaction = await db.query(
          "SELECT * FROM transactions WHERE id = $1",
          [transactionId]
        );
        if (transaction.rows.length === 0) {
          throw createError(
            404,
            "TRANSACTION_NOT_FOUND",
            "Transaction not found"
          );
        }
      }

      // Store validated data
      req.validatedEntry = {
        accountId,
        amount,
        entryType,
        reference: req.body.reference || null,
        description: req.body.description || null,
        transactionId: transactionId || null,
      };

      next();
    } catch (error) {
      next(error);
    }
  }

  async validateBalance(req, res, next) {
    try {
      const { accountId, amount, entryType } = req.validatedEntry;

      // For DEBIT entries, check sufficient balance
      if (entryType === "DEBIT") {
        const account = await accountService.getAccountById(accountId);

        if (!account) {
          throw createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
        }

        // Check if sufficient balance
        if (parseFloat(account.balance) < parseFloat(amount)) {
          throw createError(422, "INSUFFICIENT_BALANCE", {
            message: "Insufficient balance",
            balance: account.balance,
            required: amount,
          });
        }

        // Store account info for later use
        req.accountInfo = account;
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LedgerMiddleware();
