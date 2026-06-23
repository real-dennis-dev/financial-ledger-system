const authService = require("../services/auth.service");
const logger = require("../../../config/logger");
const auditService = require("../../../common/services/audit.service");

class AuthController {
  /**
   * Register a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async register(req, res, next) {
    try {
      const user = await authService.createUser(req.body);

      await auditService.logAudit("USER_REGISTERED", {
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.status(201).json({
        success: true,
        data: user,
        message: "User registered successfully",
      });
    } catch (error) {
      logger.error("Registration error:", error);
      next(error);
    }
  }

  /**
   * Login user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await authService.validateCredentials(email, password, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      await auditService.logAudit("USER_LOGGED_IN", {
        userId: result.user.id,
        email: result.user.email,
        sessionId: result.sessionId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: result,
        message: "Login successful",
      });
    } catch (error) {
      // Log failed login attempt
      await auditService.logAudit("LOGIN_FAILED", {
        email: req.body.email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        error: error.message,
      });

      logger.error("Login error:", error);
      next(error);
    }
  }

  /**
   * Logout user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async logout(req, res, next) {
    try {
      await authService.logout(req.user.id, req.user.sessionId);

      await auditService.logAudit("USER_LOGGED_OUT", {
        userId: req.user.id,
        sessionId: req.user.sessionId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      logger.error("Logout error:", error);
      next(error);
    }
  }

  /**
   * Refresh JWT token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshToken(refreshToken);

      await auditService.logAudit("TOKEN_REFRESHED", {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: result,
        message: "Token refreshed",
      });
    } catch (error) {
      logger.error("Refresh token error:", error);
      next(error);
    }
  }

  /**
   * Setup MFA
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async setupMFA(req, res, next) {
    try {
      const mfaData = await authService.setupMFA(req.user.id);

      await auditService.logAudit("MFA_SETUP", {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: mfaData,
        message: "MFA setup initiated",
      });
    } catch (error) {
      logger.error("MFA setup error:", error);
      next(error);
    }
  }

  /**
   * Verify MFA code
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async verifyMFA(req, res, next) {
    try {
      const { code } = req.body;
      const verified = await authService.verifyMFA(req.user.id, code);

      await auditService.logAudit("MFA_VERIFIED", {
        userId: req.user.id,
        verified,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        data: { verified },
        message: verified ? "MFA verification successful" : "Invalid MFA code",
      });
    } catch (error) {
      logger.error("MFA verification error:", error);
      next(error);
    }
  }

  /**
   * Initiate password reset
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);

      await auditService.logAudit("PASSWORD_RESET_REQUESTED", {
        email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Password reset email sent",
      });
    } catch (error) {
      logger.error("Forgot password error:", error);
      next(error);
    }
  }

  /**
   * Reset password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;
      await authService.resetPassword(token, newPassword);

      await auditService.logAudit("PASSWORD_RESET", {
        token: token.substring(0, 10) + "...",
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Password reset successful",
      });
    } catch (error) {
      logger.error("Reset password error:", error);
      next(error);
    }
  }

  /**
   * Change password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(
        req.user.id,
        currentPassword,
        newPassword
      );

      await auditService.logAudit("PASSWORD_CHANGED", {
        userId: req.user.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      logger.error("Change password error:", error);
      next(error);
    }
  }

  /**
   * Verify email
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware
   */
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.body;
      await authService.verifyEmail(token);

      await auditService.logAudit("EMAIL_VERIFIED", {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.json({
        success: true,
        message: "Email verified successfully",
      });
    } catch (error) {
      logger.error("Verify email error:", error);
      next(error);
    }
  }
}

module.exports = new AuthController();
