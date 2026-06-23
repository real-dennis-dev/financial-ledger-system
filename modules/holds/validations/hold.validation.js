const Joi = require("joi");

const createHoldSchema = Joi.object({
  accountId: Joi.string().uuid().required().messages({
    "string.uuid": "Account ID must be a valid UUID",
    "any.required": "Account ID is required",
  }),
  amount: Joi.number().precision(4).positive().required().messages({
    "number.base": "Amount must be a number",
    "number.positive": "Amount must be greater than zero",
    "any.required": "Amount is required",
  }),
  reason: Joi.string().max(500).required().messages({
    "string.max": "Reason must not exceed 500 characters",
    "any.required": "Reason is required",
  }),
  expiresIn: Joi.number().integer().min(1).max(720).default(24).messages({
    "number.base": "Expiry must be a number",
    "number.min": "Expiry must be at least 1 hour",
    "number.max": "Expiry must not exceed 720 hours (30 days)",
  }),
  transactionId: Joi.string().uuid().optional().messages({
    "string.uuid": "Transaction ID must be a valid UUID",
  }),
});

const releaseHoldSchema = Joi.object({
  reason: Joi.string().max(500).optional().messages({
    "string.max": "Reason must not exceed 500 characters",
  }),
});

const getHoldsSchema = Joi.object({
  accountId: Joi.string().uuid().optional(),
  status: Joi.string().valid("ACTIVE", "RELEASED", "EXPIRED").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const getAccountHoldsSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  status: Joi.string().valid("ACTIVE", "RELEASED", "EXPIRED").optional(),
});

const holdIdSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

module.exports = {
  createHoldSchema,
  releaseHoldSchema,
  getHoldsSchema,
  getAccountHoldsSchema,
  holdIdSchema,
};
