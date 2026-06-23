const { v4: uuidv4 } = require("uuid");

class HoldUtil {
  calculateExpiryDate(durationHours) {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + durationHours);
    return expiryDate;
  }

  validateHoldAmount(amount, maxAmount = 1000000000) {
    const errors = [];

    if (isNaN(parseFloat(amount)) || !isFinite(amount)) {
      errors.push("Amount must be a valid number");
    }

    if (parseFloat(amount) <= 0) {
      errors.push("Amount must be greater than zero");
    }

    if (parseFloat(amount) > maxAmount) {
      errors.push(`Amount exceeds maximum limit of ${maxAmount}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  generateHoldId(prefix = "HLD") {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
  }

  isHoldExpired(hold) {
    return new Date(hold.expires_at) < new Date();
  }

  calculateTotalHeld(holds) {
    return holds
      .filter((hold) => hold.status === "ACTIVE")
      .reduce((sum, hold) => sum + parseFloat(hold.amount), 0);
  }

  groupHoldsByStatus(holds) {
    const grouped = {
      ACTIVE: [],
      RELEASED: [],
      EXPIRED: [],
    };

    for (const hold of holds) {
      grouped[hold.status] = grouped[hold.status] || [];
      grouped[hold.status].push(hold);
    }

    return grouped;
  }

  getHoldExpiryStatus(hold) {
    const now = new Date();
    const expiryDate = new Date(hold.expires_at);
    const timeUntilExpiry = expiryDate - now;

    if (timeUntilExpiry < 0) {
      return "EXPIRED";
    }

    if (timeUntilExpiry < 3600000) {
      // Less than 1 hour
      return "EXPIRING_SOON";
    }

    if (timeUntilExpiry < 3600000 * 6) {
      // Less than 6 hours
      return "EXPIRING";
    }

    return "ACTIVE";
  }

  formatHoldForResponse(hold) {
    return {
      id: hold.id,
      accountId: hold.account_id,
      amount: parseFloat(hold.amount),
      status: hold.status,
      reason: hold.reason,
      expiresAt: hold.expires_at,
      createdAt: hold.created_at,
      releasedAt: hold.released_at,
      expiryStatus: this.getHoldExpiryStatus(hold),
      isExpired: this.isHoldExpired(hold),
    };
  }

  calculateReleaseAmount(hold, releasePercentage = 100) {
    const amount = parseFloat(hold.amount);
    return Math.round((amount * releasePercentage) / 10000) / 10000;
  }

  validateHoldRelease(hold, amount) {
    const errors = [];

    if (hold.status !== "ACTIVE") {
      errors.push(`Hold is already ${hold.status.toLowerCase()}`);
    }

    if (this.isHoldExpired(hold)) {
      errors.push("Hold has already expired");
    }

    if (parseFloat(amount) > parseFloat(hold.amount)) {
      errors.push("Release amount cannot exceed hold amount");
    }

    if (parseFloat(amount) <= 0) {
      errors.push("Release amount must be greater than zero");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  generateHoldSummary(holds) {
    const totalActive = holds.filter((h) => h.status === "ACTIVE").length;
    const totalReleased = holds.filter((h) => h.status === "RELEASED").length;
    const totalExpired = holds.filter((h) => h.status === "EXPIRED").length;
    const totalAmount = this.calculateTotalHeld(holds);

    return {
      totalHolds: holds.length,
      activeCount: totalActive,
      releasedCount: totalReleased,
      expiredCount: totalExpired,
      totalHeldAmount: totalAmount,
      averageHoldAmount: holds.length > 0 ? totalAmount / holds.length : 0,
      oldestHold:
        holds.length > 0
          ? holds.reduce((a, b) =>
              new Date(a.created_at) < new Date(b.created_at) ? a : b
            )
          : null,
      newestHold:
        holds.length > 0
          ? holds.reduce((a, b) =>
              new Date(a.created_at) > new Date(b.created_at) ? a : b
            )
          : null,
    };
  }
}

module.exports = new HoldUtil();
