const express = require("express");
const router = express.Router();
const balanceController = require("./controllers/balance.controller");
const {
  authenticate,
  authorize,
} = require("../../common/middleware/auth.middleware");
const {
  validateParams,
  validateQuery,
  validateBody,
} = require("../../common/middleware/validation.middleware");
const {
  checkSufficientBalance,
  validateBalanceOperation,
} = require("./middleware/balance.middleware");
const {
  getBalanceSchema,
  updateBalanceSchema,
} = require("./validations/balance.validation");

/**
 * @swagger
 * tags:
 *   name: Balances
 *   description: Balance management endpoints
 */

/**
 * @swagger
 * /balances/{accountId}:
 *   get:
 *     tags: [Balances]
 *     summary: Get account balance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountId:
 *                       type: string
 *                     balance:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:accountId",
  authenticate,
  validateParams(getBalanceSchema),
  balanceController.getBalance
);

/**
 * @swagger
 * /balances/{accountId}/available:
 *   get:
 *     tags: [Balances]
 *     summary: Get available balance (excluding holds)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Available balance retrieved successfully
 */
router.get(
  "/:accountId/available",
  authenticate,
  validateParams(getBalanceSchema),
  balanceController.getAvailableBalance
);

/**
 * @swagger
 * /balances/{accountId}/history:
 *   get:
 *     tags: [Balances]
 *     summary: Get balance history
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
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Balance history retrieved successfully
 */
router.get(
  "/:accountId/history",
  authenticate,
  validateParams(getBalanceSchema),
  balanceController.getBalanceHistory
);

/**
 * @swagger
 * /balances/{accountId}/held:
 *   get:
 *     tags: [Balances]
 *     summary: Get held balance
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Held balance retrieved successfully
 */
router.get(
  "/:accountId/held",
  authenticate,
  validateParams(getBalanceSchema),
  balanceController.getHeldBalance
);

/**
 * @swagger
 * /balances/{accountId}/update:
 *   post:
 *     tags: [Balances]
 *     summary: Update balance (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
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
 *               - amount
 *               - reason
 *             properties:
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               reference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Balance updated successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/:accountId/update",
  authenticate,
  authorize(["admin", "finance"]),
  validateParams(getBalanceSchema),
  validateBody(updateBalanceSchema),
  validateBalanceOperation,
  balanceController.updateBalance
);

module.exports = router;
