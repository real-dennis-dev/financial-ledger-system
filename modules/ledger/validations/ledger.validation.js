const Joi = require("joi");

const createEntrySchema = Joi.object({
  accountId: Joi.string().uuid().required(),
  amount: Joi.number().positive().precision(4).required(),
  entryType: Joi.string().valid("DEBIT", "CREDIT").required(),
  reference: Joi.string().max(100).optional(),
  description: Joi.string().max(1000).optional(),
  transactionId: Joi.string().uuid().optional(),
});

const getEntriesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  accountId: Joi.string().uuid().optional(),
  entryType: Joi.string().valid("DEBIT", "CREDIT").optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  transactionId: Joi.string().uuid().optional(),
});

const reconcileSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  accountId: Joi.string().uuid().optional(),
});

module.exports = {
  createEntrySchema,
  getEntriesSchema,
  reconcileSchema,
};
