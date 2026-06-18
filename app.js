require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./config/database");
const redis = require("./config/redis");
const bull = require("./config/bull");
const logger = require("./config/logger");
const {
  swaggerSpec,
  swaggerUi,
  swaggerUiOptions,
} = require("./config/swagger");

// Middleware
const authMiddleware = require("./common/middleware/auth.middleware");
const validationMiddleware = require("./common/middleware/validation.middleware");
const loggingMiddleware = require("./common/middleware/logging.middleware");
const securityMiddleware = require("./common/middleware/security.middleware");
const errorMiddleware = require("./common/middleware/error.middleware");

// Routes (to be implemented)
const authRoutes = require("./modules/auth/routes");
const accountRoutes = require("./modules/accounts/routes");
const transactionRoutes = require("./modules/transactions/routes");
const ledgerRoutes = require("./modules/ledger/routes");
const balanceRoutes = require("./modules/balances/routes");
const holdRoutes = require("./modules/holds/routes");
const reconciliationRoutes = require("./modules/reconciliation/routes");
const reportRoutes = require("./modules/reporting/routes");

const app = express();

// Security middleware
app.use(securityMiddleware.helmet());
app.use(securityMiddleware.cors());
app.use(securityMiddleware.sanitizeInput());

// Logging middleware
app.use(loggingMiddleware.requestLogger);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Idempotency middleware (applied to specific routes)
app.use("/api/v1/transactions", securityMiddleware.idempotency());

// Static files for Swagger
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions)
);

// Health check endpoint
app.get("/health", async (req, res) => {
  const dbHealth = await db.healthCheck();
  const redisHealth = await redis.healthCheck();

  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealth,
      redis: redisHealth,
      bull: {
        status: "ok",
        queues: Object.keys(bull.queues),
      },
    },
  };

  const isHealthy =
    dbHealth.status === "healthy" && redisHealth.status === "healthy";
  res.status(isHealthy ? 200 : 503).json(health);
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/accounts", authMiddleware.authenticate, accountRoutes);
app.use("/api/v1/transactions", authMiddleware.authenticate, transactionRoutes);
app.use("/api/v1/ledger", authMiddleware.authenticate, ledgerRoutes);
app.use("/api/v1/balances", authMiddleware.authenticate, balanceRoutes);
app.use("/api/v1/holds", authMiddleware.authenticate, holdRoutes);
app.use(
  "/api/v1/reconciliation",
  authMiddleware.authenticate,
  reconciliationRoutes
);
app.use("/api/v1/reports", authMiddleware.authenticate, reportRoutes);

// Error handling
app.use(errorMiddleware.notFoundHandler);
app.use(errorMiddleware.validationErrorHandler);
app.use(errorMiddleware.errorHandler);

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info("Received shutdown signal, closing connections...");

  try {
    await db.close();
    await redis.close();
    await bull.close();

    logger.info("All connections closed");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(
    `Swagger documentation available at http://localhost:${PORT}/api-docs`
  );
});

module.exports = app;
