const crypto = require("crypto");
const logger = require("../../../config/logger");

class AccountUtil {
  /**
   * Generate a unique account number
   * @param {string} type - Account type (SAVINGS, CURRENT, WALLET, TREASURY)
   * @returns {string} Unique account number
   */
  generateAccountNumber(type) {
    // Prefix based on account type
    const prefixes = {
      SAVINGS: "01",
      CURRENT: "02",
      WALLET: "03",
      TREASURY: "04",
    };

    const prefix = prefixes[type] || "00";

    // Generate timestamp component (6 digits)
    const timestamp = Date.now().toString().slice(-6);

    // Generate random component (8 digits)
    const random = Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0");

    // Generate checksum digit (Luhn algorithm)
    const baseNumber = prefix + timestamp + random;
    const checksum = this.generateCheckDigit(baseNumber);

    const accountNumber = baseNumber + checksum;

    // Format: XX-XXXXXX-XXXXXXXX-X
    return `${prefix}-${timestamp}-${random}-${checksum}`;
  }

  /**
   * Generate Luhn check digit
   * @param {string} number - Base number
   * @returns {string} Check digit
   */
  generateCheckDigit(number) {
    let sum = 0;
    let isEven = false;

    // Process from right to left
    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  }

  /**
   * Validate account number format
   * @param {string} accountNumber - Account number to validate
   * @returns {boolean} Whether the account number is valid
   */
  validateAccountNumber(accountNumber) {
    // Remove any formatting
    const cleanNumber = accountNumber.replace(/[^0-9]/g, "");

    // Check length (should be 17 digits: 2 prefix + 6 timestamp + 8 random + 1 checksum)
    if (cleanNumber.length !== 17) {
      return false;
    }

    // Extract check digit
    const baseNumber = cleanNumber.slice(0, -1);
    const checkDigit = cleanNumber.slice(-1);

    // Validate with Luhn algorithm
    const computedCheckDigit = this.generateCheckDigit(baseNumber);
    return checkDigit === computedCheckDigit;
  }

  /**
   * Mask account number for display
   * @param {string} accountNumber - Full account number
   * @param {number} visibleDigits - Number of visible digits at the end
   * @returns {string} Masked account number
   */
  maskAccountNumber(accountNumber, visibleDigits = 4) {
    if (!accountNumber) return "****";

    const cleanNumber = accountNumber.replace(/[^0-9]/g, "");
    const length = cleanNumber.length;

    if (length <= visibleDigits) {
      return cleanNumber;
    }

    const visible = cleanNumber.slice(-visibleDigits);
    const masked = cleanNumber
      .slice(0, length - visibleDigits)
      .replace(/[0-9]/g, "*");

    // Apply formatting
    return this.formatAccountNumber(masked + visible);
  }

  /**
   * Format account number with separators
   * @param {string} accountNumber - Unformatted account number
   * @returns {string} Formatted account number
   */
  formatAccountNumber(accountNumber) {
    const clean = accountNumber.replace(/[^0-9]/g, "");
    if (clean.length === 0) return "";

    // Format: XX-XXXXXX-XXXXXXXX-X
    if (clean.length >= 17) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 8)}-${clean.slice(
        8,
        16
      )}-${clean.slice(16, 17)}`;
    }

    // Partial formatting
    if (clean.length >= 8) {
      return `${clean.slice(0, 2)}-${clean.slice(2, 8)}-${clean.slice(8)}`;
    }

    if (clean.length >= 2) {
      return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    }

    return clean;
  }

  /**
   * Get account type from account number
   * @param {string} accountNumber - Account number
   * @returns {string|null} Account type or null
   */
  getAccountTypeFromNumber(accountNumber) {
    const clean = accountNumber.replace(/[^0-9]/g, "");
    if (clean.length < 2) return null;

    const prefix = clean.slice(0, 2);
    const types = {
      "01": "SAVINGS",
      "02": "CURRENT",
      "03": "WALLET",
      "04": "TREASURY",
    };

    return types[prefix] || null;
  }

  /**
   * Validate if account type is valid
   * @param {string} type - Account type
   * @returns {boolean} Whether the account type is valid
   */
  isValidAccountType(type) {
    const validTypes = ["SAVINGS", "CURRENT", "WALLET", "TREASURY"];
    return validTypes.includes(type);
  }

  /**
   * Validate if currency is valid
   * @param {string} currency - Currency code
   * @returns {boolean} Whether the currency is valid
   */
  isValidCurrency(currency) {
    const validCurrencies = ["USD", "EUR", "GBP", "NGN", "CAD", "AUD"];
    return validCurrencies.includes(currency);
  }

  /**
   * Generate account summary
   * @param {Object} account - Account object
   * @param {Array} transactions - Account transactions
   * @returns {Object} Account summary
   */
  generateAccountSummary(account, transactions = []) {
    const summary = {
      accountId: account.id,
      accountNumber: this.maskAccountNumber(account.accountNumber),
      currency: account.currency,
      type: account.type,
      status: account.status,
      currentBalance: parseFloat(account.balance),
      availableBalance: parseFloat(account.availableBalance),
      transactionCount: transactions.length,
      totalCredits: 0,
      totalDebits: 0,
      lastTransactionDate: null,
    };

    if (transactions.length > 0) {
      let credits = 0;
      let debits = 0;

      for (const tx of transactions) {
        if (tx.entry_type === "CREDIT") {
          credits += parseFloat(tx.amount);
        } else if (tx.entry_type === "DEBIT") {
          debits += parseFloat(tx.amount);
        }

        if (
          !summary.lastTransactionDate ||
          tx.created_at > summary.lastTransactionDate
        ) {
          summary.lastTransactionDate = tx.created_at;
        }
      }

      summary.totalCredits = credits;
      summary.totalDebits = debits;
    }

    return summary;
  }

  /**
   * Validate account status transition
   * @param {string} currentStatus - Current account status
   * @param {string} newStatus - New account status
   * @returns {Object} Validation result
   */
  validateStatusTransition(currentStatus, newStatus) {
    const validTransitions = {
      ACTIVE: ["FROZEN", "CLOSED"],
      FROZEN: ["ACTIVE", "CLOSED"],
      CLOSED: [],
    };

    const valid = validTransitions[currentStatus]?.includes(newStatus) || false;

    return {
      valid,
      message: valid
        ? "Status transition is valid"
        : `Cannot transition from ${currentStatus} to ${newStatus}`,
      allowedTransitions: validTransitions[currentStatus] || [],
    };
  }
}

module.exports = new AccountUtil();
