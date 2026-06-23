const express = require("express");
const router = express.Router();
const reportController = require("./controllers/report.controller");
const {
  validateBody,
  validateParams,
  validateQuery,
} = require("../../common/middleware/validation.middleware");
const {
  authenticate,
  authorize,
} = require("../../common/middleware/auth.middleware");
const {
  generateBalanceReportSchema,
  generateTransactionReportSchema,
  generateAuditReportSchema,
  getReportsSchema,
} = require("./validations/report.validation");
const {
  validateReportRequest,
  authorizeReportAccess,
} = require("./middleware/report.middleware");

/**
 * @swagger
 * /reports/balance:
 *   post:
 *     tags: [Reports]
 *     summary: Generate balance report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *                 format: uuid
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               format:
 *                 type: string
 *                 enum: [json, pdf, csv]
 *     responses:
 *       200:
 *         description: Report generated
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post(
  "/balance",
  authenticate,
  authorize(["admin", "finance", "auditor"]),
  validateBody(generateBalanceReportSchema),
  validateReportRequest,
  reportController.generateBalanceReport
);

/**
 * @swagger
 * /reports/transactions:
 *   post:
 *     tags: [Reports]
 *     summary: Generate transaction report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountId:
 *                 type: string
 *                 format: uuid
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               type:
 *                 type: string
 *                 enum: [TRANSFER, DEPOSIT, WITHDRAWAL, PAYMENT, REFUND]
 *               status:
 *                 type: string
 *                 enum: [PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED]
 *               format:
 *                 type: string
 *                 enum: [json, pdf, csv]
 *     responses:
 *       200:
 *         description: Report generated
 */
router.post(
  "/transactions",
  authenticate,
  authorize(["admin", "finance", "auditor"]),
  validateBody(generateTransactionReportSchema),
  validateReportRequest,
  reportController.generateTransactionReport
);

/**
 * @swagger
 * /reports/audit:
 *   post:
 *     tags: [Reports]
 *     summary: Generate audit report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               action:
 *                 type: string
 *               entityType:
 *                 type: string
 *               userId:
 *                 type: string
 *                 format: uuid
 *               format:
 *                 type: string
 *                 enum: [json, pdf, csv]
 *     responses:
 *       200:
 *         description: Report generated
 */
router.post(
  "/audit",
  authenticate,
  authorize(["admin", "auditor"]),
  validateBody(generateAuditReportSchema),
  validateReportRequest,
  reportController.generateAuditReport
);

/**
 * @swagger
 * /reports:
 *   get:
 *     tags: [Reports]
 *     summary: List reports
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [BALANCE, TRANSACTION, AUDIT]
 *         description: Filter by report type
 *     responses:
 *       200:
 *         description: List of reports
 */
router.get(
  "/",
  authenticate,
  validateQuery(getReportsSchema),
  reportController.getReports
);

/**
 * @swagger
 * /reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Get report by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Report details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  authorizeReportAccess,
  reportController.getReport
);

/**
 * @swagger
 * /reports/{id}/download:
 *   get:
 *     tags: [Reports]
 *     summary: Download report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, csv]
 *           default: pdf
 *     responses:
 *       200:
 *         description: Report file
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id/download",
  authenticate,
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  authorizeReportAccess,
  reportController.downloadReport
);

module.exports = router;
