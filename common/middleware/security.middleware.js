const cors = require("cors");
const helmet = require("helmet");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../config/logger");
const redis = require("../../config/redis");

class SecurityMiddleware {
  cors() {
    const corsOptions = {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "X-MFA-Token",
        "X-Correlation-ID",
      ],
      exposedHeaders: ["X-Correlation-ID"],
      credentials: true,
      maxAge: 86400, // 24 hours
    };

    return cors(corsOptions);
  }

  helmet() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: true,
      crossOriginResourcePolicy: true,
      dnsPrefetchControl: true,
      frameguard: true,
      hidePoweredBy: true,
      hsts: true,
      ieNoOpen: true,
      noSniff: true,
      referrerPolicy: true,
      xssFilter: true,
    });
  }

  sanitizeInput() {
    return (req, res, next) => {
      const sanitize = (obj) => {
        if (!obj) return obj;

        for (const key in obj) {
          if (typeof obj[key] === "string") {
            // Remove potential XSS
            obj[key] = obj[key].replace(/<[^>]*>/g, "").trim();
          } else if (typeof obj[key] === "object" && obj[key] !== null) {
            sanitize(obj[key]);
          }
        }
        return obj;
      };

      req.body = sanitize(req.body);
      req.query = sanitize(req.query);
      req.params = sanitize(req.params);

      next();
    };
  }

  idempotency() {
    return async (req, res, next) => {
      // Skip if method is not idempotent
      if (!["POST", "PUT", "PATCH"].includes(req.method)) {
        return next();
      }

      const idempotencyKey = req.headers["idempotency-key"];

      if (!idempotencyKey) {
        return res.status(400).json({
          success: false,
          error: {
            code: "IDEMPOTENCY_KEY_REQUIRED",
            message: "Idempotency-Key header is required for this operation",
          },
        });
      }

      const key = `idempotency:${idempotencyKey}`;

      try {
        // Check if request with this key already exists
        const existing = await redis.get(key);

        if (existing) {
          logger.info("Idempotency key found", {
            key: idempotencyKey,
            user: req.user?.id,
          });

          return res.status(existing.status || 200).json(existing.response);
        }

        // Store original send
        const originalSend = res.send;

        // Override send to cache response
        res.send = function (data) {
          const responseData = JSON.parse(data);

          // Cache successful responses
          if (res.statusCode >= 200 && res.statusCode < 400) {
            const cacheData = {
              status: res.statusCode,
              response: responseData,
            };

            // Store in Redis with TTL
            const ttl = parseInt(process.env.IDEMPOTENCY_TTL) || 86400; // 24 hours
            redis.set(key, cacheData, ttl).catch((err) => {
              logger.error("Failed to cache idempotency response:", err);
            });
          }

          return originalSend.call(this, data);
        };

        // Store request metadata
        req.idempotencyKey = idempotencyKey;
        req.idempotencyCache = {
          key,
          ttl: parseInt(process.env.IDEMPOTENCY_TTL) || 86400,
        };

        next();
      } catch (error) {
        logger.error("Idempotency middleware error:", error);
        next(error);
      }
    };
  }

  // Additional security helpers
  generateSecureToken() {
    return uuidv4() + "-" + Date.now().toString(36);
  }

  maskSensitiveData(data) {
    const sensitiveFields = [
      "password",
      "token",
      "secret",
      "key",
      "credit_card",
      "cvv",
      "pin",
    ];

    if (!data) return data;

    const masked = { ...data };

    for (const field of sensitiveFields) {
      if (masked[field]) {
        masked[field] = "***MASKED***";
      }
    }

    return masked;
  }

  validateIP(ip) {
    // Check if IP is valid
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip) || ip === "::1" || ip === "127.0.0.1";
  }
}

module.exports = new SecurityMiddleware();
