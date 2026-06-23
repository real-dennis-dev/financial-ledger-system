const express = require("express");
const router = express.Router();
const holdController = require("./controllers/hold.controller");
const {
  authenticate,
  authorize,
} = require("../../common/middleware/auth.middleware");
const {
  validateParams,
  validateBody,
  validateQuery,
} = require("../../common/middleware/validation.middleware");
const {
  validateHoldCreation,
  validateHoldAccess,
} = require("./middleware/hold.middleware");
const {
  createHoldSchema,
  releaseHoldSchema,
  getHoldsSchema,
} = require("./validations/hold.validation");

/**
 * @swagger
 * tags:
 *   name: Holds
 *   description: Hold and reservation management
 */

/**
 * @swagger
 * /holds:
 *   post:
 *     tags: [Holds]
 *     summary: Create a new hold
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
 *               - reason
 *             properties:
 *               accountId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               expiresIn:
 *                 type: integer
 *                 description: Expiry in hours
 *                 default: 24
 *     responses:
 *       201:
 *         description: Hold created successfully
 *       422:
 *         description: Insufficient balance
 */
router.post(
  "/",
  authenticate,
  validateBody(createHoldSchema),
  validateHoldCreation,
  holdController.createHold
);

/**
 * @swagger
 * /holds:
 *   get:
 *     tags: [Holds]
 *     summary: List holds
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, RELEASED, EXPIRED]
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
 *         description: Holds retrieved successfully
 */
router.get(
  "/",
  authenticate,
  validateQuery(getHoldsSchema),
  holdController.getHolds
);

/**
 * @swagger
 * /holds/{id}:
 *   get:
 *     tags: [Holds]
 *     summary: Get hold details
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
 *         description: Hold details retrieved successfully
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  "/:id",
  authenticate,
  validateParams(createHoldSchema),
  validateHoldAccess,
  holdController.getHold
);

/**
 * @swagger
 * /holds/{id}/release:
 *   post:
 *     tags: [Holds]
 *     summary: Release a hold
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
 *         description: Hold released successfully
 */
router.post(
  "/:id/release",
  authenticate,
  validateParams(createHoldSchema),
  validateBody(releaseHoldSchema),
  validateHoldAccess,
  holdController.releaseHold
);

/**
 * @swagger
 * /holds/{id}/expire:
 *   post:
 *     tags: [Holds]
 *     summary: Expire a hold (Admin only)
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
 *         description: Hold expired successfully
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.post(
  "/:id/expire",
  authenticate,
  authorize(["admin"]),
  validateParams(createHoldSchema),
  validateHoldAccess,
  holdController.expireHold
);

/**
 * @swagger
 * /holds/account/{accountId}:
 *   get:
 *     tags: [Holds]
 *     summary: Get all holds for an account
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, RELEASED, EXPIRED]
 *     responses:
 *       200:
 *         description: Account holds retrieved successfully
 */
router.get(
  "/account/:accountId",
  authenticate,
  validateParams(createHoldSchema),
  holdController.getAccountHolds
);

module.exports = router;
