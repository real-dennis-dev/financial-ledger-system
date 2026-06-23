const Joi = require("joi");

const initiateSchema = Joi.object({
  type: Joi.string()
    .valid("TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT", "REFUND")
    .required(),
  amount: Joi.number().positive().precision(4).required(),
  currency: Joi.string()
    .valid("USD", "EUR", "GBP", "NGN", "CAD", "AUD")
    .required(),
  sourceAccountId: Joi.string().uuid().optional(),
  destinationAccountId: Joi.string().uuid().optional(),
  description: Joi.string().max(1000).optional(),
  metadata: Joi.object().optional(),
}).custom((value, helpers) => {
  // Validate based on transaction type
  if (value.type === "TRANSFER" || value.type === "PAYMENT") {
    if (!value.sourceAccountId) {
      return helpers.error("any.required", {
        message: "sourceAccountId is required",
      });
    }
    if (!value.destinationAccountId) {
      return helpers.error("any.required", {
        message: "destinationAccountId is required",
      });
    }
    if (value.sourceAccountId === value.destinationAccountId) {
      return helpers.error("any.custom", {
        message: "Source and destination accounts must be different",
      });
    }
  }

  if (value.type === "DEPOSIT") {
    if (!value.destinationAccountId) {
      return helpers.error("any.required", {
        message: "destinationAccountId is required",
      });
    }
  }

  if (value.type === "WITHDRAWAL") {
    if (!value.sourceAccountId) {
      return helpers.error("any.required", {
        message: "sourceAccountId is required",
      });
    }
  }

  return value;
}, "Transaction validation");

const cancelSchema = Joi.object({
  reason: Joi.string().max(500).optional(),
});

const getTransactionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid(
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    "CANCELLED"
  ),
  type: Joi.string().valid(
    "TRANSFER",
    "DEPOSIT",
    "WITHDRAWAL",
    "PAYMENT",
    "REFUND"
  ),
  fromDate: Joi.date().iso(),
  toDate: Joi.date().iso().min(Joi.ref("fromDate")),
});

module.exports = {
  initiateSchema,
  cancelSchema,
  getTransactionsSchema,
};
