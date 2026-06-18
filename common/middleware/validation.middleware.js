const Joi = require("joi");
const logger = require("../../config/logger");

class ValidationMiddleware {
  validateBody(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        logger.warn("Validation failed", {
          path: req.path,
          errors,
          body: req.body,
        });

        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: errors,
          },
        });
      }

      req.body = value;
      next();
    };
  }

  validateQuery(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: errors,
          },
        });
      }

      req.query = value;
      next();
    };
  }

  validateParams(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid URL parameters",
            details: errors,
          },
        });
      }

      req.params = value;
      next();
    };
  }

  validateHeaders(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.headers, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid headers",
            details: errors,
          },
        });
      }

      req.headers = value;
      next();
    };
  }

  // Common validation schemas
  schemas = {
    id: Joi.string().uuid().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
    amount: Joi.number().positive().precision(4),
    currency: Joi.string().valid("USD", "EUR", "GBP", "NGN", "CAD", "AUD"),
    date: Joi.date().iso(),
    pagination: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sort: Joi.string(),
      order: Joi.string().valid("asc", "desc").default("desc"),
    }),
    dateRange: Joi.object({
      from: Joi.date().iso(),
      to: Joi.date().iso().min(Joi.ref("from")),
    }),
  };
}

module.exports = new ValidationMiddleware();
