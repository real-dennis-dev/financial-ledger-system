const Joi = require("joi");

/**
 * Create account validation schema
 */
const createAccountSchema = Joi.object({
  currency: Joi.string()
    .valid("USD", "EUR", "GBP", "NGN", "CAD", "AUD")
    .required()
    .messages({
      "any.required": "Currency is required",
      "any.only": "Currency must be one of: USD, EUR, GBP, NGN, CAD, AUD",
    }),
  type: Joi.string()
    .valid("SAVINGS", "CURRENT", "WALLET", "TREASURY")
    .required()
    .messages({
      "any.required": "Account type is required",
      "any.only":
        "Account type must be one of: SAVINGS, CURRENT, WALLET, TREASURY",
    }),
  initialDeposit: Joi.number().min(0).precision(4).default(0).messages({
    "number.min": "Initial deposit must be greater than or equal to 0",
    "number.precision": "Amount cannot have more than 4 decimal places",
  }),
});

/**
 * Update account validation schema
 */
const updateAccountSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "FROZEN", "CLOSED").optional().messages({
    "any.only": "Status must be one of: ACTIVE, FROZEN, CLOSED",
  }),
  type: Joi.string()
    .valid("SAVINGS", "CURRENT", "WALLET", "TREASURY")
    .optional()
    .messages({
      "any.only":
        "Account type must be one of: SAVINGS, CURRENT, WALLET, TREASURY",
    }),
});

/**
 * Account ID parameter validation schema
 */
const accountIdParamSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Invalid account ID format",
    "any.required": "Account ID is required",
  }),
});

/**
 * Get statement query validation schema
 */
const getStatementSchema = Joi.object({
  fromDate: Joi.date().iso().optional().messages({
    "date.base": "Invalid date format. Use ISO 8601 format",
  }),
  toDate: Joi.date().iso().min(Joi.ref("fromDate")).optional().messages({
    "date.base": "Invalid date format. Use ISO 8601 format",
    "date.min": "End date must be after start date",
  }),
  page: Joi.number().integer().min(1).default(1).optional().messages({
    "number.base": "Page must be a number",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .optional()
    .messages({
      "number.base": "Limit must be a number",
      "number.min": "Limit must be at least 1",
      "number.max": "Limit cannot exceed 100",
    }),
});

/**
 * Balance update validation schema (for internal use)
 */
const updateBalanceSchema = Joi.object({
  amount: Joi.number().precision(4).required().messages({
    "any.required": "Amount is required",
    "number.precision": "Amount cannot have more than 4 decimal places",
  }),
  type: Joi.string().valid("CREDIT", "DEBIT").required().messages({
    "any.required": "Transaction type is required",
    "any.only": "Type must be CREDIT or DEBIT",
  }),
  reference: Joi.string().max(100).optional().messages({
    "string.max": "Reference cannot exceed 100 characters",
  }),
  description: Joi.string().max(500).optional().messages({
    "string.max": "Description cannot exceed 500 characters",
  }),
});

/**
 * Account filters validation schema
 */
const accountFiltersSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "FROZEN", "CLOSED").optional(),
  currency: Joi.string()
    .valid("USD", "EUR", "GBP", "NGN", "CAD", "AUD")
    .optional(),
  type: Joi.string()
    .valid("SAVINGS", "CURRENT", "WALLET", "TREASURY")
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  createAccountSchema,
  updateAccountSchema,
  accountIdParamSchema,
  getStatementSchema,
  updateBalanceSchema,
  accountFiltersSchema,
};
