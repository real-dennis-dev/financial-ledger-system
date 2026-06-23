const Joi = require("joi");

const startReconciliationSchema = Joi.object({
  type: Joi.string().valid("DAILY", "HOURLY", "MANUAL").required(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  externalData: Joi.object({
    externalBalance: Joi.number().precision(4),
    source: Joi.string(),
  }).optional(),
  notes: Joi.string().max(1000).optional(),
});

const resolveDiscrepancySchema = Joi.object({
  resolution: Joi.string().max(1000).required(),
  adjustmentAmount: Joi.number().precision(4).required(),
  adjustmentAccountId: Joi.string().uuid().optional(),
  notes: Joi.string().max(500).optional(),
});

const getReconciliationsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid("PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"),
  type: Joi.string().valid("DAILY", "HOURLY", "MANUAL"),
  sort: Joi.string().valid("createdAt", "status", "type").default("createdAt"),
  order: Joi.string().valid("asc", "desc").default("desc"),
});

module.exports = {
  startReconciliationSchema,
  resolveDiscrepancySchema,
  getReconciliationsSchema,
};
