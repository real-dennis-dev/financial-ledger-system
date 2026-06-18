class BalanceUtil {
  calculateBalance(entries) {
    let balance = 0;

    for (const entry of entries) {
      if (entry.entryType === "CREDIT") {
        balance += parseFloat(entry.amount);
      } else if (entry.entryType === "DEBIT") {
        balance -= parseFloat(entry.amount);
      }
    }

    return Math.round(balance * 10000) / 10000; // Round to 4 decimal places
  }

  calculateAvailableBalance(ledgerBalance, holds) {
    const heldAmount = holds
      .filter((hold) => hold.status === "ACTIVE")
      .reduce((sum, hold) => sum + parseFloat(hold.amount), 0);

    const available = parseFloat(ledgerBalance) - heldAmount;
    return Math.max(Math.round(available * 10000) / 10000, 0);
  }

  validateBalance(accountId, amount, currentBalance) {
    if (parseFloat(currentBalance) < parseFloat(amount)) {
      return {
        valid: false,
        message: "Insufficient balance",
        required: parseFloat(amount),
        available: parseFloat(currentBalance),
      };
    }

    return {
      valid: true,
      message: "Sufficient balance",
    };
  }

  formatBalance(amount, currency) {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);

    return formatted;
  }

  calculateDailyBalance(entries, date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEntries = entries.filter((entry) => {
      const entryDate = new Date(entry.createdAt);
      return entryDate >= dayStart && entryDate <= dayEnd;
    });

    return this.calculateBalance(dayEntries);
  }

  calculateMovingAverage(entries, days = 30) {
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

    const window = sortedEntries.slice(-days);
    const average =
      window.reduce(
        (sum, entry) =>
          sum +
          (entry.entryType === "CREDIT"
            ? parseFloat(entry.amount)
            : -parseFloat(entry.amount)),
        0
      ) / window.length;

    return Math.round(average * 10000) / 10000;
  }

  calculateBalanceProjection(entries, growthRate = 0.01) {
    const currentBalance = this.calculateBalance(entries);
    const projectedBalance = currentBalance * (1 + growthRate);
    return Math.round(projectedBalance * 10000) / 10000;
  }
}

module.exports = new BalanceUtil();
