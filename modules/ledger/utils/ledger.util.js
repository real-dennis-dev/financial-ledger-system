const crypto = require("crypto");

class LedgerUtil {
  calculateTotal(entries) {
    let totalCredits = 0;
    let totalDebits = 0;

    for (const entry of entries) {
      if (entry.entry_type === "CREDIT") {
        totalCredits += parseFloat(entry.amount);
      } else if (entry.entry_type === "DEBIT") {
        totalDebits += parseFloat(entry.amount);
      }
    }

    return {
      totalCredits: Math.round(totalCredits * 10000) / 10000,
      totalDebits: Math.round(totalDebits * 10000) / 10000,
      difference: Math.round((totalCredits - totalDebits) * 10000) / 10000,
    };
  }

  validateDoubleEntry(entries) {
    const totals = this.calculateTotal(entries);
    const balanced = Math.abs(totals.difference) < 0.0001;

    return {
      isValid: balanced,
      message: balanced
        ? "Double entry accounting is balanced"
        : `Double entry accounting is not balanced. Difference: ${totals.difference}`,
      totals,
    };
  }

  generateEntryHash(entry) {
    const data = `${entry.id}:${entry.account_id}:${entry.amount}:${entry.entry_type}:${entry.created_at}`;
    return crypto
      .createHash("sha256")
      .update(data + (process.env.LEDGER_SALT || "ledger-salt"))
      .digest("hex");
  }

  validateEntryStructure(entry) {
    const errors = [];

    if (!entry.account_id) {
      errors.push("Account ID is required");
    }

    if (!entry.amount || entry.amount <= 0) {
      errors.push("Amount must be greater than 0");
    }

    if (!entry.entry_type) {
      errors.push("Entry type is required");
    }

    if (!["DEBIT", "CREDIT"].includes(entry.entry_type)) {
      errors.push("Entry type must be DEBIT or CREDIT");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  calculateRunningBalance(entries) {
    let balance = 0;
    const runningBalances = [];

    // Sort by date
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    for (const entry of sortedEntries) {
      if (entry.entry_type === "CREDIT") {
        balance += parseFloat(entry.amount);
      } else if (entry.entry_type === "DEBIT") {
        balance -= parseFloat(entry.amount);
      }

      runningBalances.push({
        ...entry,
        runningBalance: Math.round(balance * 10000) / 10000,
      });
    }

    return runningBalances;
  }

  groupEntriesByAccount(entries) {
    const grouped = {};

    for (const entry of entries) {
      if (!grouped[entry.account_id]) {
        grouped[entry.account_id] = [];
      }
      grouped[entry.account_id].push(entry);
    }

    return grouped;
  }

  calculateAccountTotals(entries) {
    const grouped = this.groupEntriesByAccount(entries);
    const totals = {};

    for (const [accountId, accountEntries] of Object.entries(grouped)) {
      totals[accountId] = this.calculateTotal(accountEntries);
    }

    return totals;
  }
}

module.exports = new LedgerUtil();
