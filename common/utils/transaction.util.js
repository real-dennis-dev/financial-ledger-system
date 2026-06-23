const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../config/logger");

class TransactionUtil {
  // Additional utilities for transaction module

  generateTransactionId(prefix = "TXN") {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  calculateFees(amount, type) {
    const feeConfigs = {
      TRANSFER: { percentage: 0.001, fixed: 0.5 },
      PAYMENT: { percentage: 0.02, fixed: 0.3 },
      WITHDRAWAL: { percentage: 0.005, fixed: 1.0 },
      DEPOSIT: { percentage: 0, fixed: 0 },
      REFUND: { percentage: 0, fixed: 0 },
    };

    const config = feeConfigs[type] || feeConfigs.TRANSFER;
    const fee = amount * config.percentage + config.fixed;

    return Math.round(Math.min(fee, 100) * 100) / 100; // Cap at $100
  }

  validateReferences(entries) {
    const references = entries.map((e) => e.reference).filter(Boolean);
    const duplicates = references.filter(
      (ref, index) => references.indexOf(ref) !== index
    );

    return {
      isValid: duplicates.length === 0,
      duplicates,
      message:
        duplicates.length === 0
          ? "All references are unique"
          : `Duplicate references found: ${duplicates.join(", ")}`,
    };
  }

  getTransactionStatus(transaction) {
    const statusMap = {
      PENDING: {
        code: 1,
        label: "Pending",
        description: "Transaction is pending processing",
      },
      PROCESSING: {
        code: 2,
        label: "Processing",
        description: "Transaction is being processed",
      },
      COMPLETED: {
        code: 3,
        label: "Completed",
        description: "Transaction completed successfully",
      },
      FAILED: { code: 4, label: "Failed", description: "Transaction failed" },
      CANCELLED: {
        code: 5,
        label: "Cancelled",
        description: "Transaction was cancelled",
      },
    };

    return (
      statusMap[transaction.status] || {
        code: 0,
        label: "Unknown",
        description: "Unknown status",
      }
    );
  }
  generateTransactionRef(prefix = "TXN") {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(Math.random() * 1000000)
      .toString(36)
      .toUpperCase()
      .padStart(6, "0");
    return `${prefix}-${timestamp}${random}`;
  }

  generateIdempotencyKey(userId, payload) {
    const data = `${userId}:${JSON.stringify(payload)}`;
    return crypto
      .createHash("sha256")
      .update(data)
      .digest("hex")
      .substring(0, 32);
  }

  calculateHash(data) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  validateTransaction(transaction) {
    const errors = [];

    // Validate required fields
    const requiredFields = [
      "amount",
      "currency",
      "type",
      "sourceAccountId",
      "destinationAccountId",
    ];
    for (const field of requiredFields) {
      if (!transaction[field]) {
        errors.push({
          field,
          message: `${field} is required`,
        });
      }
    }

    // Validate amount
    if (transaction.amount && transaction.amount <= 0) {
      errors.push({
        field: "amount",
        message: "Amount must be greater than 0",
      });
    }

    // Validate currency
    const validCurrencies = ["USD", "EUR", "GBP", "NGN", "CAD", "AUD"];
    if (
      transaction.currency &&
      !validCurrencies.includes(transaction.currency)
    ) {
      errors.push({
        field: "currency",
        message: `Currency must be one of: ${validCurrencies.join(", ")}`,
      });
    }

    // Validate transaction type
    const validTypes = [
      "TRANSFER",
      "DEPOSIT",
      "WITHDRAWAL",
      "PAYMENT",
      "REFUND",
    ];
    if (transaction.type && !validTypes.includes(transaction.type)) {
      errors.push({
        field: "type",
        message: `Type must be one of: ${validTypes.join(", ")}`,
      });
    }

    // Validate source and destination are different
    if (
      transaction.sourceAccountId &&
      transaction.destinationAccountId &&
      transaction.sourceAccountId === transaction.destinationAccountId
    ) {
      errors.push({
        field: "destinationAccountId",
        message: "Source and destination accounts must be different",
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  generateTransactionHash(transaction) {
    const data = {
      reference: transaction.reference,
      amount: transaction.amount,
      currency: transaction.currency,
      type: transaction.type,
      sourceAccount: transaction.sourceAccountId,
      destinationAccount: transaction.destinationAccountId,
      timestamp: new Date().toISOString(),
    };
    return this.calculateHash(data);
  }

  async validateTransactionAgainstLedger(transaction, ledgerEntries) {
    // Validate double-entry accounting
    let totalDebit = 0;
    let totalCredit = 0;

    for (const entry of ledgerEntries) {
      if (entry.entryType === "DEBIT") {
        totalDebit += parseFloat(entry.amount);
      } else if (entry.entryType === "CREDIT") {
        totalCredit += parseFloat(entry.amount);
      }
    }

    const balanced = Math.abs(totalDebit - totalCredit) < 0.0001;

    return {
      balanced,
      totalDebit,
      totalCredit,
      difference: totalDebit - totalCredit,
    };
  }

  generateTransactionSummary(transactions) {
    const summary = {
      totalCount: transactions.length,
      totalAmount: 0,
      byType: {},
      byStatus: {},
      byCurrency: {},
    };

    for (const tx of transactions) {
      summary.totalAmount += parseFloat(tx.amount);

      summary.byType[tx.type] = (summary.byType[tx.type] || 0) + 1;
      summary.byStatus[tx.status] = (summary.byStatus[tx.status] || 0) + 1;
      summary.byCurrency[tx.currency] =
        (summary.byCurrency[tx.currency] || 0) + parseFloat(tx.amount);
    }

    return summary;
  }
}

module.exports = new TransactionUtil();
