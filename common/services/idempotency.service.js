const redis = require("../../config/redis");
const logger = require("../../config/logger");
const { v4: uuidv4 } = require("uuid");

class IdempotencyService {
  async checkIdempotency(key) {
    try {
      const result = await redis.get(key);

      if (result) {
        logger.debug("Idempotency key found", { key });
        return {
          exists: true,
          data: result,
        };
      }

      logger.debug("Idempotency key not found", { key });
      return {
        exists: false,
        data: null,
      };
    } catch (error) {
      logger.error("Idempotency check error:", error);
      // If Redis fails, allow the request to proceed
      return {
        exists: false,
        data: null,
        error: error.message,
      };
    }
  }

  async storeIdempotency(key, result, ttl = 86400) {
    try {
      await redis.set(key, result, ttl);
      logger.debug("Idempotency result stored", { key, ttl });
      return true;
    } catch (error) {
      logger.error("Idempotency store error:", error);
      return false;
    }
  }

  async cleanupExpired() {
    // Redis handles TTL automatically
    // This method is for manual cleanup if needed
    logger.info("Idempotency cleanup completed (Redis handles TTL)");
    return { status: "completed" };
  }

  // Extended methods
  generateIdempotencyKey(prefix = "IDEM", context) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    const data = `${prefix}:${context || ""}:${timestamp}:${random}`;

    // Use SHA256 to create a consistent key
    const crypto = require("crypto");
    return crypto
      .createHash("sha256")
      .update(data)
      .digest("hex")
      .substring(0, 32);
  }

  async getOrCreateIdempotency(key, operation, ttl = 86400) {
    // Check if key exists
    const existing = await this.checkIdempotency(key);

    if (existing.exists) {
      return {
        isNew: false,
        result: existing.data,
      };
    }

    // Execute operation
    try {
      const result = await operation();

      // Store result
      await this.storeIdempotency(key, result, ttl);

      return {
        isNew: true,
        result,
      };
    } catch (error) {
      // Store error for retry logic
      const errorData = {
        error: true,
        message: error.message,
        timestamp: new Date().toISOString(),
      };

      await this.storeIdempotency(key, errorData, 3600);
      throw error;
    }
  }

  async extendIdempotencyTTL(key, ttl = 86400) {
    try {
      const exists = await redis.exists(key);
      if (exists) {
        await redis.expire(key, ttl);
        logger.debug("Idempotency TTL extended", { key, ttl });
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Idempotency TTL extension error:", error);
      return false;
    }
  }

  async revokeIdempotency(key) {
    try {
      await redis.delete(key);
      logger.debug("Idempotency key revoked", { key });
      return true;
    } catch (error) {
      logger.error("Idempotency revocation error:", error);
      return false;
    }
  }

  async getIdempotencyMetrics() {
    try {
      // Get all idempotency keys
      const keys = await redis.client.keys("idempotency:*");

      return {
        totalKeys: keys.length,
        keys: keys.slice(0, 100), // Return first 100 for performance
      };
    } catch (error) {
      logger.error("Idempotency metrics error:", error);
      return {
        totalKeys: 0,
        keys: [],
      };
    }
  }
}

module.exports = new IdempotencyService();
