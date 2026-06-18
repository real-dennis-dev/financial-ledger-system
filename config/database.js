const { Pool } = require("pg");
const logger = require("./logger");

class Database {
  constructor() {
    this.pool = null;
    this.initialize();
  }

  initialize() {
    const config = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      connectionTimeoutMillis:
        parseInt(process.env.DB_CONNECTION_TIMEOUT) || 2000,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      application_name: "financial-ledger-system",
    };

    this.pool = new Pool(config);

    // Event listeners
    this.pool.on("connect", () => {
      logger.debug("Database connection established");
    });

    this.pool.on("error", (err) => {
      logger.error("Database connection error:", err);
    });

    this.pool.on("acquire", () => {
      logger.debug("Database connection acquired");
    });

    this.pool.on("remove", () => {
      logger.debug("Database connection removed");
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug("Query executed", {
        text: text.substring(0, 100),
        duration,
        rows: result.rows?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error("Query error:", {
        text: text.substring(0, 100),
        error: error.message,
      });
      throw error;
    }
  }

  async getClient() {
    return await this.pool.connect();
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async healthCheck() {
    try {
      await this.pool.query("SELECT 1");
      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      return { status: "unhealthy", error: error.message };
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();
