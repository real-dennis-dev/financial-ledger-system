const express = require("express");
const router = express.Router();
const reconciliationController = require("./controllers/reconciliation.controller");
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
  startReconciliationSchema,
  resolveDiscrepancySchema,
  getReconciliationsSchema,
} = require("./validations/reconciliation.validation");
const {
  validateReconciliation,
  checkReconciliationStatus,
} = require("./middleware/reconciliation.middleware");

/**
 * @swagger
 * /reconciliation:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Start reconciliation process
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - startDate
 *               - endDate
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [DAILY, HOURLY, MANUAL]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               externalData:
 *                 type: object
 *     responses:
 *       201:
 *         description: Reconciliation started
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/",
  authenticate,
  authorize(["admin", "reconciliation_officer"]),
  validateBody(startReconciliationSchema),
  reconciliationController.startReconciliation
);

/**
 * @swagger
 * /reconciliation:
 *   get:
 *     tags: [Reconciliation]
 *     summary: List reconciliations
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, IN_PROGRESS, COMPLETED, FAILED]
 *         description: Filter by status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [DAILY, HOURLY, MANUAL]
 *         description: Filter by type
 *     responses:
 *       200:
 *         description: List of reconciliations
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  "/",
  authenticate,
  validateQuery(getReconciliationsSchema),
  reconciliationController.getReconciliations
);

/**
 * @swagger
 * /reconciliation/{id}:
 *   get:
 *     tags: [Reconciliation]
 *     summary: Get reconciliation details
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
 *         description: Reconciliation details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  reconciliationController.getReconciliation
);

/**
 * @swagger
 * /reconciliation/{id}/verify:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Verify reconciliation
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
 *         description: Reconciliation verified
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/verify",
  authenticate,
  authorize(["admin", "reconciliation_officer"]),
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  validateReconciliation,
  checkReconciliationStatus(["PENDING", "IN_PROGRESS"]),
  reconciliationController.verifyReconciliation
);

/**
 * @swagger
 * /reconciliation/{id}/resolve:
 *   post:
 *     tags: [Reconciliation]
 *     summary: Resolve discrepancy
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resolution
 *               - adjustmentAmount
 *             properties:
 *               resolution:
 *                 type: string
 *               adjustmentAmount:
 *                 type: number
 *               adjustmentAccountId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Discrepancy resolved
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/resolve",
  authenticate,
  authorize(["admin", "reconciliation_officer"]),
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  validateBody(resolveDiscrepancySchema),
  validateReconciliation,
  checkReconciliationStatus(["PENDING", "IN_PROGRESS"]),
  reconciliationController.resolveDiscrepancy
);

/**
 * @swagger
 * /reconciliation/{id}/report:
 *   get:
 *     tags: [Reconciliation]
 *     summary: Get reconciliation report
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
 *           enum: [json, pdf, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: Reconciliation report
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id/report",
  authenticate,
  validateParams(
    require("joi").object({ id: require("joi").string().uuid().required() })
  ),
  reconciliationController.getReconciliationReport
);

module.exports = router;
