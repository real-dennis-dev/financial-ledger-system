const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Create logs directory if it doesn't exist
const logDir = process.env.LOG_FILE_PATH || "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log formats
const formats = {
  console: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length
        ? `\n${JSON.stringify(meta, null, 2)}`
        : "";
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  file: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  audit: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json()
  ),
};

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    // Console transport
    new winston.transports.Console({
      format: formats.console,
      handleExceptions: true,
    }),
    // File transports
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: formats.file,
      maxsize: parseInt(process.env.LOG_MAX_SIZE) || 104857600, // 100MB
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 7,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      format: formats.file,
      maxsize: parseInt(process.env.LOG_MAX_SIZE) || 104857600,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 7,
    }),
  ],
  exitOnError: false,
});

// Create separate audit logger
const auditLogger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "audit.log"),
      format: formats.audit,
      maxsize: parseInt(process.env.LOG_MAX_SIZE) || 104857600,
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 30,
    }),
  ],
});

// Mask sensitive data
const maskSensitiveData = (data) => {
  if (!data) return data;

  const sensitiveFields = [
    "password",
    "password_hash",
    "token",
    "secret",
    "key",
    "credit_card",
    "cvv",
    "pin",
    "mfa_secret",
  ];

  const masked = { ...data };

  const maskObject = (obj) => {
    for (const key in obj) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        obj[key] = "***MASKED***";
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        maskObject(obj[key]);
      }
    }
  };

  maskObject(masked);
  return masked;
};

// Enhanced logging methods
class Logger {
  constructor() {
    this.logger = logger;
    this.auditLogger = auditLogger;
  }

  info(message, meta = {}) {
    const sanitizedMeta = maskSensitiveData(meta);
    this.logger.info(message, sanitizedMeta);
  }

  error(message, meta = {}) {
    const sanitizedMeta = maskSensitiveData(meta);
    this.logger.error(message, sanitizedMeta);
  }

  warn(message, meta = {}) {
    const sanitizedMeta = maskSensitiveData(meta);
    this.logger.warn(message, sanitizedMeta);
  }

  debug(message, meta = {}) {
    const sanitizedMeta = maskSensitiveData(meta);
    this.logger.debug(message, sanitizedMeta);
  }

  audit(action, data = {}) {
    const auditEntry = {
      action,
      timestamp: new Date().toISOString(),
      data: maskSensitiveData(data),
    };
    this.auditLogger.info(JSON.stringify(auditEntry));
  }

  requestLog(req, res, duration) {
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get("user-agent"),
      userId: req.user?.id || "anonymous",
      correlationId: req.correlationId,
    };
    this.info("HTTP Request", logData);
  }

  errorLog(err, req = null) {
    const errorData = {
      message: err.message,
      stack: err.stack,
      code: err.code,
      status: err.status || 500,
      ...(req && {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userId: req.user?.id,
        correlationId: req.correlationId,
      }),
    };
    this.error("Error occurred", errorData);
  }

  performanceLog(operation, duration, metadata = {}) {
    this.info("Performance metric", {
      operation,
      duration: `${duration}ms`,
      ...metadata,
      timestamp: new Date().toISOString(),
    });
  }

  securityLog(event, data = {}) {
    this.info("Security event", {
      event,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = new Logger();
