const logger = require("../../config/logger");
const { v4: uuidv4 } = require("uuid");

class LoggingMiddleware {
  requestLogger(req, res, next) {
    // Generate or use existing correlation ID
    req.correlationId = req.headers["x-correlation-id"] || uuidv4();

    // Set correlation ID in response header
    res.setHeader("X-Correlation-ID", req.correlationId);

    const startTime = Date.now();

    // Log request
    logger.info("Incoming request", {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      body: req.body,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      userId: req.user?.id,
    });

    // Intercept response
    const originalSend = res.send;
    res.send = function (data) {
      const duration = Date.now() - startTime;

      // Log response
      logger.info("Request completed", {
        correlationId: req.correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id,
      });

      // Log slow requests
      if (duration > 5000) {
        logger.warn("Slow request detected", {
          correlationId: req.correlationId,
          method: req.method,
          url: req.url,
          duration: `${duration}ms`,
        });
      }

      return originalSend.call(this, data);
    };

    next();
  }

  auditLogger(action, metadata = {}) {
    return (req, res, next) => {
      const auditData = {
        action,
        userId: req.user?.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        params: req.params,
        ...metadata,
      };

      logger.audit(action, auditData);
      next();
    };
  }

  errorLogger(err, req, res, next) {
    const errorData = {
      correlationId: req.correlationId,
      userId: req.user?.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      error: {
        message: err.message,
        stack: err.stack,
        code: err.code,
        status: err.status || 500,
      },
    };

    logger.error("Error occurred", errorData);

    // Don't leak error details in production
    if (process.env.NODE_ENV === "production") {
      errorData.error = {
        message: "Internal server error",
      };
    }

    next(err);
  }
}

module.exports = new LoggingMiddleware();
