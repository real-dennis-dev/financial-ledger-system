const express = require("express");
const router = express.Router();
const accountController = require("./controllers/account.controller");
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
  validateAccountAccess,
  validateAccountStatus,
} = require("./middleware/account.middleware");
const {
  createAccountSchema,
  updateAccountSchema,
  getStatementSchema,
  accountIdParamSchema,
} = require("./validations/account.validation");

/**
 * @swagger
 * tags:
 *   name: Accounts
 *   description: Account management endpoints
 */

/**
 * @swagger
 * /accounts:
 *   post:
 *     tags: [Accounts]
 *     summary: Create a new account
 *     description: Creates a new financial account for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currency
 *               - type
 *             properties:
 *               currency:
 *                 type: string
 *                 enum: [USD, EUR, GBP, NGN]
 *                 example: USD
 *               type:
 *                 type: string
 *                 enum: [SAVINGS, CURRENT, WALLET]
 *                 example: SAVINGS
 *               initialDeposit:
 *                 type: number
 *                 minimum: 0
 *                 example: 100.00
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Account'
 *                 message:
 *                   type: string
 *                   example: Account created successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/",
  authenticate,
  validateBody(createAccountSchema),
  accountController.createAccount
);

/**
 * @swagger
 * /accounts:
 *   get:
 *     tags: [Accounts]
 *     summary: Get user accounts
 *     description: Retrieves all accounts belonging to the authenticated user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, FROZEN, CLOSED]
 *         description: Filter by account status
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           enum: [USD, EUR, GBP, NGN]
 *         description: Filter by currency
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: List of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accounts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Account'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get("/", authenticate, accountController.getAccounts);

/**
 * @swagger
 * /accounts/{id}:
 *   get:
 *     tags: [Accounts]
 *     summary: Get account by ID
 *     description: Retrieves detailed account information by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Account details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Account'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  accountController.getAccount
);

/**
 * @swagger
 * /accounts/{id}:
 *   put:
 *     tags: [Accounts]
 *     summary: Update account
 *     description: Updates account details (e.g., status)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, FROZEN, CLOSED]
 *               type:
 *                 type: string
 *                 enum: [SAVINGS, CURRENT, WALLET]
 *     responses:
 *       200:
 *         description: Account updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Account'
 *                 message:
 *                   type: string
 *                   example: Account updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.put(
  "/:id",
  authenticate,
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  validateBody(updateAccountSchema),
  accountController.updateAccount
);

/**
 * @swagger
 * /accounts/{id}:
 *   delete:
 *     tags: [Accounts]
 *     summary: Close account
 *     description: Closes an account (requires zero balance)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Account closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Account closed successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.delete(
  "/:id",
  authenticate,
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  accountController.closeAccount
);

/**
 * @swagger
 * /accounts/{id}/balance:
 *   get:
 *     tags: [Accounts]
 *     summary: Get account balance
 *     description: Gets current balance and available balance for an account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Balance information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     accountId:
 *                       type: string
 *                     accountNumber:
 *                       type: string
 *                     balance:
 *                       type: number
 *                     availableBalance:
 *                       type: number
 *                     currency:
 *                       type: string
 *                     heldAmount:
 *                       type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id/balance",
  authenticate,
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  accountController.getAccountBalance
);

/**
 * @swagger
 * /accounts/{id}/statement:
 *   get:
 *     tags: [Accounts]
 *     summary: Get account statement
 *     description: Gets transaction history for an account within a date range
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for statement
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for statement
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *     responses:
 *       200:
 *         description: Account statement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     account:
 *                       $ref: '#/components/schemas/Account'
 *                     transactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Transaction'
 *                     summary:
 *                       type: object
 *                       properties:
 *                         openingBalance:
 *                           type: number
 *                         closingBalance:
 *                           type: number
 *                         totalCredits:
 *                           type: number
 *                         totalDebits:
 *                           type: number
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id/statement",
  authenticate,
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  validateQuery(getStatementSchema),
  accountController.getAccountStatement
);

/**
 * @swagger
 * /accounts/{id}/freeze:
 *   post:
 *     tags: [Accounts]
 *     summary: Freeze account
 *     description: Freezes an account preventing transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Account frozen successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Account'
 *                 message:
 *                   type: string
 *                   example: Account frozen successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/freeze",
  authenticate,
  authorize(["admin"]),
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  accountController.freezeAccount
);

/**
 * @swagger
 * /accounts/{id}/unfreeze:
 *   post:
 *     tags: [Accounts]
 *     summary: Unfreeze account
 *     description: Unfreezes a frozen account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Account ID
 *     responses:
 *       200:
 *         description: Account unfrozen successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Account'
 *                 message:
 *                   type: string
 *                   example: Account unfrozen successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post(
  "/:id/unfreeze",
  authenticate,
  authorize(["admin"]),
  validateParams(accountIdParamSchema),
  validateAccountAccess,
  accountController.unfreezeAccount
);

module.exports = router;
