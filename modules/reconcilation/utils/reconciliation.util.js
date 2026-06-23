class ReconciliationUtil {
  compareBalances(balance1, balance2) {
    const diff = parseFloat(balance1) - parseFloat(balance2);

    return {
      balance1: parseFloat(balance1),
      balance2: parseFloat(balance2),
      difference: Math.round(diff * 10000) / 10000,
      isBalanced: Math.abs(diff) < 0.0001,
    };
  }

  calculateDiscrepancy(internalBalance, externalBalance) {
    if (externalBalance === null || externalBalance === undefined) {
      return null;
    }

    const diff = parseFloat(internalBalance) - parseFloat(externalBalance);
    return Math.round(diff * 10000) / 10000;
  }

  validateReconciliationResult(result) {
    const errors = [];

    if (!result) {
      errors.push("Result is required");
      return { valid: false, errors };
    }

    if (
      result.internalBalance === undefined ||
      result.internalBalance === null
    ) {
      errors.push("Internal balance is required");
    }

    if (
      result.externalBalance === undefined ||
      result.externalBalance === null
    ) {
      errors.push("External balance is required");
    }

    if (result.discrepancy === undefined || result.discrepancy === null) {
      errors.push("Discrepancy is required");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  formatReconciliationReport(data) {
    const { reconciliation, transactions, ledgerEntries } = data;

    return {
      summary: {
        id: reconciliation.id,
        type: reconciliation.type,
        status: reconciliation.status,
        startDate: reconciliation.start_date,
        endDate: reconciliation.end_date,
        internalBalance: reconciliation.internal_balance,
        externalBalance: reconciliation.external_balance,
        discrepancy: reconciliation.discrepancy,
        verifiedAt: reconciliation.verified_at,
        resolution: reconciliation.resolution,
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        description: tx.description,
        createdAt: tx.created_at,
        accountId: tx.account_id,
        debit: tx.debit_amount,
        credit: tx.credit_amount,
      })),
      ledgerEntries: ledgerEntries.map((entry) => ({
        id: entry.id,
        accountId: entry.account_id,
        amount: entry.amount,
        entryType: entry.entry_type,
        reference: entry.reference,
        description: entry.description,
        createdAt: entry.created_at,
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  calculateReconciliationStats(reconciliations) {
    const stats = {
      total: reconciliations.length,
      byStatus: {},
      byType: {},
      totalDiscrepancy: 0,
      resolved: 0,
      pending: 0,
    };

    for (const rec of reconciliations) {
      stats.byStatus[rec.status] = (stats.byStatus[rec.status] || 0) + 1;
      stats.byType[rec.type] = (stats.byType[rec.type] || 0) + 1;

      if (rec.status === "COMPLETED") {
        stats.resolved++;
        stats.totalDiscrepancy += Math.abs(rec.discrepancy || 0);
      } else if (rec.status === "PENDING" || rec.status === "IN_PROGRESS") {
        stats.pending++;
      }
    }

    return stats;
  }

  validateReconciliationPeriod(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { valid: false, error: "Invalid date format" };
    }

    if (start > end) {
      return { valid: false, error: "Start date must be before end date" };
    }

    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays > 365) {
      return { valid: false, error: "Date range cannot exceed 365 days" };
    }

    return { valid: true };
  }
}

module.exports = new ReconciliationUtil();
