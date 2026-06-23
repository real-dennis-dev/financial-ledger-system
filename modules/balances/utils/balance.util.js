const dateUtil = require("../../common/utils/date.util");

class BalanceUtil {
  computeAvailableBalance(ledgerBalance, holds) {
    const ledgerBal = parseFloat(ledgerBalance) || 0;

    const totalHeld = holds
      .filter((hold) => hold.status === "ACTIVE")
      .reduce((sum, hold) => sum + parseFloat(hold.amount), 0);

    const available = ledgerBal - totalHeld;
    return Math.max(Math.round(available * 10000) / 10000, 0);
  }

  formatBalanceForResponse(balance) {
    return {
      balance: parseFloat(balance.balance),
      availableBalance: parseFloat(balance.available_balance),
      currency: balance.currency,
      lastUpdated: balance.lastUpdated || new Date().toISOString(),
      formatted: this.formatCurrency(balance.balance, balance.currency),
    };
  }

  formatCurrency(amount, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  }

  calculateDailyBalance(entries, date) {
    const dayStart = dateUtil.toUTC(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = entries.filter((entry) => {
      const entryDate = new Date(entry.created_at);
      return entryDate >= dayStart && entryDate <= dayEnd;
    });

    let balance = 0;
    for (const entry of dayEntries) {
      if (entry.entry_type === "CREDIT") {
        balance += parseFloat(entry.amount);
      } else if (entry.entry_type === "DEBIT") {
        balance -= parseFloat(entry.amount);
      }
    }

    return Math.round(balance * 10000) / 10000;
  }

  calculateAverageDailyBalance(entries, days = 30) {
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    const recentEntries = sortedEntries.slice(-days);
    let totalBalance = 0;
    let daysWithActivity = 0;

    for (let i = 0; i < recentEntries.length; i++) {
      const entry = recentEntries[i];
      const nextEntry = recentEntries[i + 1] || null;

      const startDate = new Date(entry.created_at);
      const endDate = nextEntry ? new Date(nextEntry.created_at) : new Date();

      const diffHours = (endDate - startDate) / (1000 * 60 * 60);
      const diffDays = Math.max(diffHours / 24, 0.001);

      let balance = 0;
      for (let j = 0; j <= i; j++) {
        const e = recentEntries[j];
        if (e.entry_type === "CREDIT") {
          balance += parseFloat(e.amount);
        } else if (e.entry_type === "DEBIT") {
          balance -= parseFloat(e.amount);
        }
      }

      totalBalance += balance * diffDays;
      daysWithActivity += diffDays;
    }

    const average = daysWithActivity > 0 ? totalBalance / daysWithActivity : 0;
    return Math.round(average * 10000) / 10000;
  }

  calculateMovingAverage(balances, windowSize = 7) {
    const result = [];

    for (let i = 0; i < balances.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = balances.slice(start, i + 1);
      const average =
        window.reduce((sum, val) => sum + parseFloat(val.balance), 0) /
        window.length;

      result.push({
        date: balances[i].date,
        balance: balances[i].balance,
        movingAverage: Math.round(average * 10000) / 10000,
      });
    }

    return result;
  }

  validateBalanceAmount(amount, maxAmount = 1000000000) {
    const errors = [];

    if (isNaN(parseFloat(amount)) || !isFinite(amount)) {
      errors.push("Amount must be a valid number");
    }

    if (parseFloat(amount) <= 0) {
      errors.push("Amount must be greater than zero");
    }

    if (Math.abs(parseFloat(amount)) > maxAmount) {
      errors.push(`Amount exceeds maximum limit of ${maxAmount}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  calculateBalanceProjection(currentBalance, projectedTransactions) {
    let projectedBalance = parseFloat(currentBalance);

    for (const transaction of projectedTransactions) {
      if (transaction.type === "CREDIT") {
        projectedBalance += parseFloat(transaction.amount);
      } else if (transaction.type === "DEBIT") {
        projectedBalance -= parseFloat(transaction.amount);
      }
    }

    return Math.round(projectedBalance * 10000) / 10000;
  }
}

module.exports = new BalanceUtil();
