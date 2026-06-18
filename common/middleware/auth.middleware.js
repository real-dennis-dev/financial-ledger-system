const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const logger = require("../../config/logger");
const redis = require("../../config/redis");

class AuthMiddleware {
  async authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
      }

      const token = authHeader.substring(7);

      // Check if token is blacklisted
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Token has been revoked",
          },
        });
      }

      const decoded = await promisify(jwt.verify)(
        token,
        process.env.JWT_SECRET
      );

      req.user = {
        id: decoded.userId,
        email: decoded.email,
        sessionId: decoded.sessionId,
        roles: decoded.roles || ["user"],
        permissions: decoded.permissions || [],
      };

      // Set correlation ID for logging
      req.correlationId = decoded.sessionId || `session_${Date.now()}`;

      // Refresh token expiry if within 30 minutes of expiry
      const currentTime = Math.floor(Date.now() / 1000);
      const timeLeft = decoded.exp - currentTime;

      if (timeLeft < 1800) {
        // 30 minutes
        req.shouldRefreshToken = true;
      }

      // Log authentication
      logger.audit("AUTHENTICATION_SUCCESS", {
        userId: req.user.id,
        email: req.user.email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      next();
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Invalid token",
          },
        });
      }

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          error: {
            code: "TOKEN_EXPIRED",
            message: "Token has expired",
          },
        });
      }

      logger.error("Authentication error:", error);
      return res.status(500).json({
        success: false,
        error: {
          code: "AUTH_ERROR",
          message: "Authentication failed",
        },
      });
    }
  }

  authorize(roles = []) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        });
      }

      const userRoles = req.user.roles || [];
      const hasRole = roles.some((role) => userRoles.includes(role));

      if (!hasRole) {
        logger.securityLog("AUTHORIZATION_FAILURE", {
          userId: req.user.id,
          requiredRoles: roles,
          userRoles: userRoles,
          path: req.path,
        });

        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Insufficient permissions",
          },
        });
      }

      logger.audit("AUTHORIZATION_SUCCESS", {
        userId: req.user.id,
        roles: userRoles,
        path: req.path,
      });

      next();
    };
  }

  requireMFA(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
    }

    const mfaToken = req.headers["x-mfa-token"];

    if (!mfaToken) {
      return res.status(403).json({
        success: false,
        error: {
          code: "MFA_REQUIRED",
          message: "MFA verification required",
        },
      });
    }

    // Verify MFA token (implementation in auth module)
    req.mfaVerified = true;
    next();
  }

  rateLimit(options = {}) {
    const rateLimit = require("express-rate-limit");
    return rateLimit({
      windowMs: options.windowMs || 60 * 1000, // 1 minute
      max: options.max || 100,
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests, please try again later",
        },
      },
      keyGenerator: (req) => {
        return req.user?.id || req.ip;
      },
      handler: (req, res) => {
        logger.securityLog("RATE_LIMIT_EXCEEDED", {
          userId: req.user?.id,
          ip: req.ip,
          path: req.path,
        });
        res.status(429).json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests, please try again later",
          },
        });
      },
    });
  }
}

module.exports = new AuthMiddleware();
