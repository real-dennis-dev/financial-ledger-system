const Joi = require("joi");

const generateBalanceReportSchema = Joi.object({
  accountId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  format: Joi.string().valid("json", "pdf", "csv").default("json"),
});

const generateTransactionReportSchema = Joi.object({
  accountId: Joi.string().uuid().optional(),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  type: Joi.string()
    .valid("TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT", "REFUND")
    .optional(),
  status: Joi.string()
    .valid("PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED")
    .optional(),
  format: Joi.string().valid("json", "pdf", "csv").default("json"),
});

const generateAuditReportSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  action: Joi.string().optional(),
  entityType: Joi.string().optional(),
  userId: Joi.string().uuid().optional(),
  format: Joi.string().valid("json", "pdf", "csv").default("json"),
});

const getReportsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string().valid("BALANCE", "TRANSACTION", "AUDIT").optional(),
  sort: Joi.string().valid("createdAt", "type").default("createdAt"),
  order: Joi.string().valid("asc", "desc").default("desc"),
});

module.exports = {
  generateBalanceReportSchema,
  generateTransactionReportSchema,
  generateAuditReportSchema,
  getReportsSchema,
};
