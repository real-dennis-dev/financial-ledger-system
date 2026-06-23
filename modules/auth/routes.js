const express = require("express");
const router = express.Router();
const authController = require("./controllers/auth.controller");
const {
  validateBody,
} = require("../../common/middleware/validation.middleware");
const {
  authenticate,
  rateLimit,
} = require("../../common/middleware/auth.middleware");
const {
  registerSchema,
  loginSchema,
  resetPasswordSchema,
  changePasswordSchema,
  mfaSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyEmailSchema,
} = require("./validations/auth.validation");

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates a new user account with the provided details
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: StrongP@ssw0rd
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               phone:
 *                 type: string
 *                 example: +1234567890
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   example: User registered successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post(
  "/register",
  rateLimit({ windowMs: 60 * 1000, max: 5 }),
  validateBody(registerSchema),
  authController.register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     description: Authenticates user and returns JWT tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: StrongP@ssw0rd
 *     responses:
 *       200:
 *         description: Login successful
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
 *                     token:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     sessionId:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                 message:
 *                   type: string
 *                   example: Login successful
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/login",
  rateLimit({ windowMs: 60 * 1000, max: 10 }),
  validateBody(loginSchema),
  authController.login
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     description: Invalidates user session and token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
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
 *                   example: Logged out successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/logout", authenticate, authController.logout);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh JWT token
 *     description: Generates a new access token using refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
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
 *                     token:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                 message:
 *                   type: string
 *                   example: Token refreshed
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/refresh",
  validateBody(refreshTokenSchema),
  authController.refreshToken
);

/**
 * @swagger
 * /auth/setup-mfa:
 *   post:
 *     tags: [Auth]
 *     summary: Setup MFA
 *     description: Initializes MFA setup for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup initiated
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
 *                     secret:
 *                       type: string
 *                     qrCode:
 *                       type: string
 *                 message:
 *                   type: string
 *                   example: MFA setup initiated
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post("/setup-mfa", authenticate, authController.setupMFA);

/**
 * @swagger
 * /auth/verify-mfa:
 *   post:
 *     tags: [Auth]
 *     summary: Verify MFA code
 *     description: Verifies the MFA code provided by the user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: MFA verification successful
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
 *                     verified:
 *                       type: boolean
 *                 message:
 *                   type: string
 *                   example: MFA verification successful
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/verify-mfa",
  authenticate,
  validateBody(mfaSchema),
  authController.verifyMFA
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Initiate password reset
 *     description: Sends a password reset link to the user's email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: Password reset email sent
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
 *                   example: Password reset email sent
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post(
  "/forgot-password",
  rateLimit({ windowMs: 60 * 1000, max: 3 }),
  validateBody(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password
 *     description: Resets user password using the reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: abc123def456...
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewStrongP@ssw0rd
 *     responses:
 *       200:
 *         description: Password reset successful
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
 *                   example: Password reset successful
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/reset-password",
  rateLimit({ windowMs: 60 * 1000, max: 3 }),
  validateBody(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change password
 *     description: Changes user password (requires authentication)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldP@ssw0rd
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: NewStrongP@ssw0rd
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *                   example: Password changed successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  "/change-password",
  authenticate,
  validateBody(changePasswordSchema),
  authController.changePassword
);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email
 *     description: Verifies user's email address using verification token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: abc123def456...
 *     responses:
 *       200:
 *         description: Email verified successfully
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
 *                   example: Email verified successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
router.post(
  "/verify-email",
  validateBody(verifyEmailSchema),
  authController.verifyEmail
);

module.exports = router;
