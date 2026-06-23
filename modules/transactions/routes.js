const express = require("express");
const router = express.Router();
const transactionController = require("./controllers/transaction.controller");
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
  validateTransaction,
  checkBalance,
  idempotencyCheck,
  validateStatusTransition,
} = require("./middleware/transaction.middleware");
const {
  initiateSchema,
  cancelSchema,
  getTransactionsSchema,
} = require("./validations/transaction.validation");

/**
 * @swagger
 * /transactions:
 *   post:
 *     tags: [Transactions]
 *     summary: Initiate a new transaction
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
 *               - amount
 *               - currency
 *               - sourceAccountId
 *               - destinationAccountId
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [TRANSFER, DEPOSIT, WITHDRAWAL, PAYMENT, REFUND]
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               currency:
 *                 type: string
 *                 enum: [USD, EUR, GBP, NGN, CAD, AUD]
 *               sourceAccountId:
 *                 type: string
 *                 format: uuid
 *               destinationAccountId:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Transaction initiated
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/",
  authenticate,
  idempotencyCheck,
  validateBody(initiateSchema),
  validateTransaction,
  checkBalance,
  transactionController.initiateTransaction
);

/**
 * @swagger
 * /transactions:
 *   get:
 *     tags: [Transactions]
 *     summary: List transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [TRANSFER, DEPOSIT, WITHDRAWAL, PAYMENT, REFUND]
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
 *     responses:
 *       200:
 *         description: List of transactions
 */
router.get(
  "/",
  authenticate,
  validateQuery(getTransactionsSchema),
  transactionController.getTransactions
);

/**
 * @swagger
 * /transactions/{id}:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction by ID
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
 *         description: Transaction details
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams({ id: require("joi").string().uuid().required() }),
  transactionController.getTransaction
);

/**
 * @swagger
 * /transactions/{id}/status:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction status
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
 *         description: Transaction status
 */
router.get(
  "/:id/status",
  authenticate,
  validateParams({ id: require("joi").string().uuid().required() }),
  transactionController.getTransactionStatus
);

/**
 * @swagger
 * /transactions/{id}/cancel:
 *   post:
 *     tags: [Transactions]
 *     summary: Cancel a transaction
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transaction cancelled
 */
router.post(
  "/:id/cancel",
  authenticate,
  validateParams({ id: require("joi").string().uuid().required() }),
  validateBody(cancelSchema),
  validateStatusTransition,
  transactionController.cancelTransaction
);

/**
 * @swagger
 * /transactions/{id}/complete:
 *   post:
 *     tags: [Transactions]
 *     summary: Complete a transaction
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
 *         description: Transaction completed
 */
router.post(
  "/:id/complete",
  authenticate,
  authorize(["admin", "finance"]),
  validateParams({ id: require("joi").string().uuid().required() }),
  validateStatusTransition,
  transactionController.completeTransaction
);

/**
 * @swagger
 * /transactions/history:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction history for current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: User transaction history
 */
router.get(
  "/history",
  authenticate,
  validateQuery(getTransactionsSchema),
  transactionController.getTransactionHistory
);

/**
 * @swagger
 * /transactions/pending:
 *   get:
 *     tags: [Transactions]
 *     summary: Get pending transactions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending transactions
 */
router.get(
  "/pending",
  authenticate,
  transactionController.getPendingTransactions
);

module.exports = router;
