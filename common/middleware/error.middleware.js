const logger = require("../../config/logger");

class ErrorMiddleware {
  errorHandler(err, req, res, next) {
    // Log error
    logger.errorLog(err, req);

    // Determine status code
    const statusCode = err.status || err.statusCode || 500;

    // Prepare error response
    const errorResponse = {
      success: false,
      error: {
        code: err.code || "INTERNAL_ERROR",
        message: err.message || "An unexpected error occurred",
      },
    };

    // Add validation details if present
    if (err.details) {
      errorResponse.error.details = err.details;
    }

    // Add stack trace in development
    if (process.env.NODE_ENV === "development") {
      errorResponse.error.stack = err.stack;
    }

    // Handle specific error types
    if (err.name === "SequelizeValidationError") {
      errorResponse.error.code = "VALIDATION_ERROR";
      errorResponse.error.details = err.errors.map((e) => ({
        field: e.path,
        message: e.message,
      }));
    }

    if (err.name === "SequelizeUniqueConstraintError") {
      errorResponse.error.code = "DUPLICATE_ERROR";
      errorResponse.error.message = "Resource already exists";
    }

    if (err.name === "SequelizeForeignKeyConstraintError") {
      errorResponse.error.code = "REFERENCE_ERROR";
      errorResponse.error.message = "Referenced resource does not exist";
    }

    // Send response
    res.status(statusCode).json(errorResponse);
  }

  notFoundHandler(req, res) {
    logger.warn("Route not found", {
      method: req.method,
      url: req.url,
      ip: req.ip,
    });

    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${req.method} ${req.url} not found`,
      },
    });
  }

  validationErrorHandler(err, req, res, next) {
    if (err.name === "ValidationError") {
      const errors = err.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: errors,
        },
      });
    }

    next(err);
  }

  // Custom error classes
  createError(statusCode, code, message, details = null) {
    const error = new Error(message);
    error.status = statusCode;
    error.code = code;
    error.details = details;
    return error;
  }

  // Common error creators
  BadRequest(message = "Bad request", details = null) {
    return this.createError(400, "BAD_REQUEST", message, details);
  }

  Unauthorized(message = "Unauthorized") {
    return this.createError(401, "UNAUTHORIZED", message);
  }

  Forbidden(message = "Forbidden") {
    return this.createError(403, "FORBIDDEN", message);
  }

  NotFound(message = "Resource not found") {
    return this.createError(404, "NOT_FOUND", message);
  }

  Conflict(message = "Resource conflict", details = null) {
    return this.createError(409, "CONFLICT", message, details);
  }

  UnprocessableEntity(message = "Unprocessable entity", details = null) {
    return this.createError(422, "UNPROCESSABLE_ENTITY", message, details);
  }

  InternalError(message = "Internal server error") {
    return this.createError(500, "INTERNAL_ERROR", message);
  }

  // Business logic errors
  InsufficientBalance() {
    return this.createError(
      422,
      "INSUFFICIENT_BALANCE",
      "Insufficient balance for this transaction"
    );
  }

  AccountFrozen() {
    return this.createError(403, "ACCOUNT_FROZEN", "Account is frozen");
  }

  AccountNotFound() {
    return this.createError(404, "ACCOUNT_NOT_FOUND", "Account not found");
  }

  TransactionFailed(reason) {
    return this.createError(
      422,
      "TRANSACTION_FAILED",
      `Transaction failed: ${reason}`
    );
  }

  HoldNotFound() {
    return this.createError(404, "HOLD_NOT_FOUND", "Hold not found");
  }
}

module.exports = new ErrorMiddleware();
