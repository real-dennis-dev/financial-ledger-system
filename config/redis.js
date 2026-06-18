const redis = require("redis");
const logger = require("./logger");

class RedisClient {
  constructor() {
    this.client = null;
    this.publisher = null;
    this.subscriber = null;
    this.initialize();
  }

  initialize() {
    const config = {
      socket: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        reconnectStrategy: (retries) => {
          logger.warn(`Redis reconnection attempt ${retries}`);
          return Math.min(retries * 50, 3000);
        },
      },
      password: process.env.REDIS_PASSWORD,
      database: parseInt(process.env.REDIS_DB) || 0,
      prefix: process.env.REDIS_KEY_PREFIX || "fls:",
    };

    this.client = redis.createClient(config);
    this.publisher = this.client.duplicate();
    this.subscriber = this.client.duplicate();

    this.setupEventListeners();
    this.connect();
  }

  setupEventListeners() {
    const clients = [
      { name: "main", client: this.client },
      { name: "publisher", client: this.publisher },
      { name: "subscriber", client: this.subscriber },
    ];

    clients.forEach(({ name, client }) => {
      client.on("connect", () => {
        logger.info(`Redis ${name} client connected`);
      });

      client.on("error", (error) => {
        logger.error(`Redis ${name} client error:`, error);
      });

      client.on("end", () => {
        logger.warn(`Redis ${name} client disconnected`);
      });

      client.on("ready", () => {
        logger.info(`Redis ${name} client ready`);
      });
    });
  }

  async connect() {
    try {
      await this.client.connect();
      await this.publisher.connect();
      await this.subscriber.connect();
      logger.info("All Redis clients connected successfully");
    } catch (error) {
      logger.error("Failed to connect Redis:", error);
      throw error;
    }
  }

  // Cache operations
  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error("Redis get error:", error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, { EX: ttl });
      return true;
    } catch (error) {
      logger.error("Redis set error:", error);
      return false;
    }
  }

  async delete(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error("Redis delete error:", error);
      return false;
    }
  }

  async exists(key) {
    try {
      return await this.client.exists(key);
    } catch (error) {
      logger.error("Redis exists error:", error);
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error("Redis expire error:", error);
      return false;
    }
  }

  async incr(key) {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error("Redis incr error:", error);
      return null;
    }
  }

  // Batch operations
  async mget(keys) {
    try {
      const values = await this.client.mGet(keys);
      return values.map((v) => (v ? JSON.parse(v) : null));
    } catch (error) {
      logger.error("Redis mget error:", error);
      return [];
    }
  }

  async mset(keyValuePairs, ttl = 3600) {
    try {
      const pipeline = this.client.multi();

      keyValuePairs.forEach(({ key, value }) => {
        const serialized = JSON.stringify(value);
        pipeline.set(key, serialized, { EX: ttl });
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error("Redis mset error:", error);
      return false;
    }
  }

  // Pub/Sub
  async publish(channel, message) {
    try {
      const serialized = JSON.stringify(message);
      await this.publisher.publish(channel, serialized);
      return true;
    } catch (error) {
      logger.error("Redis publish error:", error);
      return false;
    }
  }

  async subscribe(channel, callback) {
    try {
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch (error) {
          logger.error("Redis subscribe parse error:", error);
        }
      });
      return true;
    } catch (error) {
      logger.error("Redis subscribe error:", error);
      return false;
    }
  }

  async unsubscribe(channel) {
    try {
      await this.subscriber.unsubscribe(channel);
      return true;
    } catch (error) {
      logger.error("Redis unsubscribe error:", error);
      return false;
    }
  }

  // Health check
  async healthCheck() {
    try {
      await this.client.ping();
      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: "unhealthy", error: error.message };
    }
  }

  async close() {
    try {
      await this.client.quit();
      await this.publisher.quit();
      await this.subscriber.quit();
      logger.info("Redis connections closed");
    } catch (error) {
      logger.error("Error closing Redis connections:", error);
    }
  }
}

module.exports = new RedisClient();
