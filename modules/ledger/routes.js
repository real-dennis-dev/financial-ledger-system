const express = require("express");
const router = express.Router();
const ledgerController = require("./controllers/ledger.controller");
const {
  validateBody,
  validateQuery,
  validateParams,
} = require("../../common/middleware/validation.middleware");
const {
  authenticate,
  authorize,
} = require("../../common/middleware/auth.middleware");
const {
  validateEntry,
  validateBalance,
} = require("./middleware/ledger.middleware");
const {
  createEntrySchema,
  getEntriesSchema,
  reconcileSchema,
} = require("./validations/ledger.validation");

/**
 * @swagger
 * /ledger:
 *   post:
 *     tags: [Ledger]
 *     summary: Create a ledger entry
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountId
 *               - amount
 *               - entryType
 *             properties:
 *               accountId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               entryType:
 *                 type: string
 *                 enum: [DEBIT, CREDIT]
 *               reference:
 *                 type: string
 *               description:
 *                 type: string
 *               transactionId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Ledger entry created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/",
  authenticate,
  authorize(["admin", "finance"]),
  validateBody(createEntrySchema),
  validateEntry,
  validateBalance,
  ledgerController.createLedgerEntry
);

/**
 * @swagger
 * /ledger:
 *   get:
 *     tags: [Ledger]
 *     summary: Get ledger entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: entryType
 *         schema:
 *           type: string
 *           enum: [DEBIT, CREDIT]
 *     responses:
 *       200:
 *         description: List of ledger entries
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get(
  "/",
  authenticate,
  validateQuery(getEntriesSchema),
  ledgerController.getLedgerEntries
);

/**
 * @swagger
 * /ledger/{id}:
 *   get:
 *     tags: [Ledger]
 *     summary: Get ledger entry by ID
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
 *         description: Ledger entry details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams({ id: require("joi").string().uuid().required() }),
  ledgerController.getLedgerEntry
);

/**
 * @swagger
 * /ledger/account/{accountId}:
 *   get:
 *     tags: [Ledger]
 *     summary: Get entries for an account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Account ledger entries
 */
router.get(
  "/account/:accountId",
  authenticate,
  validateParams({ accountId: require("joi").string().uuid().required() }),
  ledgerController.getAccountEntries
);

/**
 * @swagger
 * /ledger/balance/{accountId}:
 *   get:
 *     tags: [Ledger]
 *     summary: Get ledger balance for an account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Get balance as of specific date
 *     responses:
 *       200:
 *         description: Account balance
 */
router.get(
  "/balance/:accountId",
  authenticate,
  validateParams({ accountId: require("joi").string().uuid().required() }),
  ledgerController.getLedgerBalance
);

/**
 * @swagger
 * /ledger/reconcile:
 *   post:
 *     tags: [Ledger]
 *     summary: Reconcile ledger entries
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               accountId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Reconciliation completed
 */
router.post(
  "/reconcile",
  authenticate,
  authorize(["admin", "finance"]),
  validateBody(reconcileSchema),
  ledgerController.reconcileLedger
);

/**
 * @swagger
 * /ledger/audit/{transactionId}:
 *   get:
 *     tags: [Ledger]
 *     summary: Audit ledger entries for a transaction
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Audit trail for transaction
 */
router.get(
  "/audit/:transactionId",
  authenticate,
  authorize(["admin", "auditor"]),
  validateParams({ transactionId: require("joi").string().uuid().required() }),
  ledgerController.auditLedger
);

module.exports = router;
