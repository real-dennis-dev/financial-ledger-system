const redis = require("../../config/redis");
const logger = require("../../config/logger");

class CacheService {
  async get(key) {
    try {
      const value = await redis.get(key);
      if (value) {
        logger.debug("Cache hit", { key });
      } else {
        logger.debug("Cache miss", { key });
      }
      return value;
    } catch (error) {
      logger.error("Cache get error:", error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      await redis.set(key, value, ttl);
      logger.debug("Cache set", { key, ttl });
      return true;
    } catch (error) {
      logger.error("Cache set error:", error);
      return false;
    }
  }

  async delete(key) {
    try {
      await redis.delete(key);
      logger.debug("Cache delete", { key });
      return true;
    } catch (error) {
      logger.error("Cache delete error:", error);
      return false;
    }
  }

  async invalidatePattern(pattern) {
    try {
      // Redis doesn't support pattern deletion natively
      // This is a simplified version
      const keys = await redis.client.keys(pattern);
      if (keys.length > 0) {
        await redis.client.del(keys);
        logger.debug("Cache invalidated pattern", {
          pattern,
          count: keys.length,
        });
      }
      return keys.length;
    } catch (error) {
      logger.error("Cache invalidate pattern error:", error);
      return 0;
    }
  }

  // Convenience methods
  async getAccount(accountId) {
    return this.get(`account:${accountId}`);
  }

  async setAccount(accountId, data, ttl = 3600) {
    return this.set(`account:${accountId}`, data, ttl);
  }

  async getBalance(accountId) {
    return this.get(`balance:${accountId}`);
  }

  async setBalance(accountId, data, ttl = 300) {
    return this.set(`balance:${accountId}`, data, ttl);
  }

  async getTransaction(transactionId) {
    return this.get(`transaction:${transactionId}`);
  }

  async setTransaction(transactionId, data, ttl = 3600) {
    return this.set(`transaction:${transactionId}`, data, ttl);
  }

  async getSession(sessionId) {
    return this.get(`session:${sessionId}`);
  }

  async setSession(sessionId, data, ttl = 86400) {
    return this.set(`session:${sessionId}`, data, ttl);
  }

  async invalidateAccountCache(accountId) {
    await this.delete(`account:${accountId}`);
    await this.delete(`balance:${accountId}`);
  }

  async invalidateTransactionCache(transactionId) {
    await this.delete(`transaction:${transactionId}`);
  }
}

module.exports = new CacheService();
