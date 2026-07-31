const Redis = require("ioredis");
const NodeCache = require("node-cache");
const logger = require("./logger");

class CacheService {
  constructor() {
    this.redis = null;
    this.redisAvailable = false;

    // Memory fallback cache
    this.memoryCache = new NodeCache({
      stdTTL: 3600, // default 1 hour
      checkperiod: 120,
      useClones: false,
    });

    this.initializeRedis();
  }

  initializeRedis() {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB) || 0,

        keyPrefix: process.env.REDIS_KEY_PREFIX || "app:",

        // Never block forever
        connectTimeout: 5000,

        // Allows offline queue but does not crash app
        enableOfflineQueue: false,

        retryStrategy(times) {
          const delay = Math.min(times * 100, 3000);

          logger.warn(`Redis reconnect attempt ${times} in ${delay}ms`);

          return delay;
        },

        reconnectOnError(err) {
          logger.warn(`Redis reconnecting because: ${err.message}`);

          return true;
        },
      });

      this.redis.on("connect", () => {
        logger.info("Redis connected");
      });

      this.redis.on("ready", () => {
        this.redisAvailable = true;

        logger.info("Redis ready - using Redis cache");
      });

      this.redis.on("error", (err) => {
        this.redisAvailable = false;

        logger.warn(
          `Redis unavailable, switching to memory cache: ${err.message}`
        );
      });

      this.redis.on("close", () => {
        this.redisAvailable = false;

        logger.warn("Redis connection closed. Memory cache active.");
      });
    } catch (error) {
      logger.error(`Redis initialization failed: ${error.message}`);

      this.redisAvailable = false;
    }
  }

  /*
      GET CACHE
  */

  async get(key) {
    // Try Redis first
    if (this.redisAvailable) {
      try {
        const value = await this.redis.get(key);

        if (value) {
          return JSON.parse(value);
        }
      } catch (error) {
        logger.warn(`Redis GET failed: ${error.message}`);

        this.redisAvailable = false;
      }
    }

    // Fallback
    const memoryValue = this.memoryCache.get(key);

    return memoryValue || null;
  }

  /*
      SET CACHE
  */

  async set(key, value, ttl = 3600) {
    // Save to Redis

    if (this.redisAvailable) {
      try {
        await this.redis.set(key, JSON.stringify(value), "EX", ttl);

        return true;
      } catch (error) {
        logger.warn(`Redis SET failed: ${error.message}`);

        this.redisAvailable = false;
      }
    }

    // fallback memory cache

    this.memoryCache.set(key, value, ttl);

    return true;
  }

  /*
      DELETE
  */

  async del(key) {
    if (this.redisAvailable) {
      try {
        await this.redis.del(key);
      } catch (error) {
        logger.warn(`Redis DELETE failed: ${error.message}`);
      }
    }

    this.memoryCache.del(key);

    return true;
  }

  /*
      EXISTS
  */

  async exists(key) {
    if (this.redisAvailable) {
      try {
        return await this.redis.exists(key);
      } catch (error) {
        logger.warn(`Redis EXISTS failed: ${error.message}`);
      }
    }

    return this.memoryCache.has(key);
  }

  /*
      INCREMENT
      useful for rate limiting
  */

  async incr(key, ttl = 60) {
    if (this.redisAvailable) {
      try {
        const value = await this.redis.incr(key);

        if (value === 1) {
          await this.redis.expire(key, ttl);
        }

        return value;
      } catch (error) {
        logger.warn(`Redis INCR failed: ${error.message}`);
      }
    }

    let current = this.memoryCache.get(key) || 0;

    current++;

    this.memoryCache.set(key, current, ttl);

    return current;
  }

  /*
      CLEAR CACHE
  */

  async clear() {
    if (this.redisAvailable) {
      try {
        await this.redis.flushdb();
      } catch (error) {
        logger.warn(`Redis clear failed: ${error.message}`);
      }
    }

    this.memoryCache.flushAll();
  }

  /*
      HEALTH CHECK
  */

  async health() {
    if (this.redisAvailable) {
      try {
        await this.redis.ping();

        return {
          redis: "healthy",
          fallback: false,
        };
      } catch (error) {
        return {
          redis: "unhealthy",
          fallback: true,
        };
      }
    }

    return {
      redis: "offline",
      fallback: true,
    };
  }

  /*
      SHUTDOWN
  */

  async close() {
    if (this.redis) {
      try {
        await this.redis.quit();

        logger.info("Redis closed");
      } catch (error) {
        logger.error(`Redis close error: ${error.message}`);
      }
    }
  }
}

module.exports = new CacheService();
