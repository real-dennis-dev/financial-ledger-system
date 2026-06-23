const Joi = require("joi");

const getBalanceSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
});

const getBalanceHistorySchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().min(Joi.ref("fromDate")).optional(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const updateBalanceSchema = Joi.object({
  amount: Joi.number().precision(4).required().messages({
    "number.base": "Amount must be a number",
    "any.required": "Amount is required",
  }),
  reason: Joi.string().max(500).required().messages({
    "string.max": "Reason must not exceed 500 characters",
    "any.required": "Reason is required",
  }),
  reference: Joi.string().max(100).optional(),
});

const validateBalanceSchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  amount: Joi.number().precision(4).positive().required(),
});

module.exports = {
  getBalanceSchema,
  getBalanceHistorySchema,
  updateBalanceSchema,
  validateBalanceSchema,
};
