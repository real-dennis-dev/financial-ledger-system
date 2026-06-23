const db = require("../../../config/database");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const encryptionUtil = require("../../../common/utils/encryption.util");
const logger = require("../../../config/logger");
const cacheService = require("../../../common/services/cache.service");
const notificationService = require("../../../common/services/notification.service");
const auditService = require("../../../common/services/audit.service");

class AuthService {
  /**
   * Create a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @param {string} userData.firstName - User first name
   * @param {string} userData.lastName - User last name
   * @param {string} [userData.phone] - User phone number
   * @returns {Promise<Object>} Created user object
   */
  async createUser(userData) {
    const { email, password, firstName, lastName, phone } = userData;

    // Check if user exists
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      const error = new Error("User already exists");
      error.code = "USER_EXISTS";
      error.status = 409;
      throw error;
    }

    // Hash password
    const passwordHash = await encryptionUtil.hashData(password);

    // Create user
    const userId = uuidv4();
    const result = await db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, phone, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, first_name, last_name, phone, status, created_at`,
      [userId, email, passwordHash, firstName, lastName, phone, "ACTIVE"]
    );

    const user = result.rows[0];

    // Send welcome email (async)
    notificationService.sendWelcomeEmail(email, user).catch((err) => {
      logger.error("Failed to send welcome email:", err);
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      status: user.status,
      createdAt: user.created_at,
    };
  }

  /**
   * Validate user credentials
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {Object} [metadata] - Additional metadata for logging
   * @returns {Promise<Object>} Authentication result with tokens and user data
   */
  async validateCredentials(email, password, metadata = {}) {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      const error = new Error("Invalid credentials");
      error.code = "INVALID_CREDENTIALS";
      error.status = 401;
      throw error;
    }

    const user = result.rows[0];

    // Check account status
    if (user.status !== "ACTIVE") {
      const error = new Error("Account is not active");
      error.code = "ACCOUNT_INACTIVE";
      error.status = 403;
      throw error;
    }

    // Verify password
    const validPassword = await encryptionUtil.verifyHash(
      password,
      user.password_hash
    );

    if (!validPassword) {
      const error = new Error("Invalid credentials");
      error.code = "INVALID_CREDENTIALS";
      error.status = 401;
      throw error;
    }

    // Generate tokens
    const sessionId = uuidv4();
    const token = this.generateToken(user.id, user.email, sessionId);
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    // Store session in cache
    await cacheService.setSession(
      sessionId,
      {
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        sessionId,
        roles: ["user"],
        permissions: [],
      },
      86400
    );

    // Update last login
    await db.query(
      "UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        status: user.status,
        mfaEnabled: user.mfa_enabled,
        createdAt: user.created_at,
      },
      token,
      refreshToken,
      sessionId,
    };
  }

  /**
   * Generate JWT token
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @param {string} sessionId - Session ID
   * @param {Array} [roles] - User roles
   * @param {Array} [permissions] - User permissions
   * @returns {string} JWT token
   */
  generateToken(userId, email, sessionId, roles = ["user"], permissions = []) {
    return jwt.sign(
      {
        userId,
        email,
        sessionId,
        roles,
        permissions,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRY || "7d",
        issuer: "financial-ledger-system",
        audience: "financial-ledger-api",
      }
    );
  }

  /**
   * Generate refresh token
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {string} Refresh token
   */
  generateRefreshToken(userId, sessionId) {
    return jwt.sign(
      {
        userId,
        sessionId,
        type: "refresh",
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRY || "30d",
        issuer: "financial-ledger-system",
        audience: "financial-ledger-api",
      }
    );
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Promise<Object>} Decoded token payload
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: "financial-ledger-system",
        audience: "financial-ledger-api",
      });

      // Check if token is blacklisted
      const isBlacklisted = await cacheService.get(`blacklist:${token}`);
      if (isBlacklisted) {
        const error = new Error("Token has been revoked");
        error.code = "TOKEN_REVOKED";
        error.status = 401;
        throw error;
      }

      // Validate session exists
      const session = await cacheService.getSession(decoded.sessionId);
      if (!session) {
        const error = new Error("Invalid session");
        error.code = "INVALID_SESSION";
        error.status = 401;
        throw error;
      }

      return decoded;
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        const err = new Error("Invalid token");
        err.code = "INVALID_TOKEN";
        err.status = 401;
        throw err;
      }
      if (error.name === "TokenExpiredError") {
        const err = new Error("Token has expired");
        err.code = "TOKEN_EXPIRED";
        err.status = 401;
        throw err;
      }
      throw error;
    }
  }

  /**
   * Refresh JWT token
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, {
        issuer: "financial-ledger-system",
        audience: "financial-ledger-api",
      });

      // Check if session exists
      const session = await cacheService.getSession(decoded.sessionId);
      if (!session) {
        const error = new Error("Invalid session");
        error.code = "INVALID_SESSION";
        error.status = 401;
        throw error;
      }

      // Generate new tokens
      const newToken = this.generateToken(
        decoded.userId,
        session.email,
        decoded.sessionId,
        session.roles || ["user"],
        session.permissions || []
      );

      // Generate new refresh token
      const newRefreshToken = this.generateRefreshToken(
        decoded.userId,
        decoded.sessionId
      );

      return {
        token: newToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      logger.error("Refresh token error:", error);
      const err = new Error("Invalid refresh token");
      err.code = "INVALID_REFRESH_TOKEN";
      err.status = 401;
      throw err;
    }
  }

  /**
   * Setup MFA for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} MFA setup data
   */
  async setupMFA(userId) {
    // Check if MFA already enabled
    const result = await db.query(
      "SELECT mfa_enabled FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    if (result.rows[0].mfa_enabled) {
      const error = new Error("MFA already enabled");
      error.code = "MFA_ALREADY_ENABLED";
      error.status = 400;
      throw error;
    }

    // Generate MFA secret
    const secret = encryptionUtil.generateSecureToken(16);
    const encodedSecret = Buffer.from(secret).toString("base64");

    // Store secret temporarily (will be enabled after verification)
    await db.query("UPDATE users SET mfa_secret = $1 WHERE id = $2", [
      secret,
      userId,
    ]);

    // Generate QR code data (using a simplified format)
    const issuer = "FinancialLedger";
    const accountName = userId;
    const qrCodeData = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}`;

    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 5; i++) {
      backupCodes.push(encryptionUtil.generateSecureToken(8));
    }

    return {
      secret: encodedSecret,
      qrCode: qrCodeData,
      backupCodes,
    };
  }

  /**
   * Verify MFA code
   * @param {string} userId - User ID
   * @param {string} code - MFA code to verify
   * @returns {Promise<boolean>} Verification result
   */
  async verifyMFA(userId, code) {
    const result = await db.query(
      "SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const user = result.rows[0];

    // Check if MFA is already enabled
    if (user.mfa_enabled) {
      // Validate against stored secret
      const isValid = code === "123456"; // Placeholder - use proper TOTP validation
      return isValid;
    }

    // First time setup - enable MFA if code is valid
    const secret = user.mfa_secret;
    if (!secret) {
      const error = new Error("MFA not set up");
      error.code = "MFA_NOT_SETUP";
      error.status = 400;
      throw error;
    }

    // Validate code (simplified - use proper TOTP validation)
    const isValid = code === "123456"; // Placeholder

    if (isValid) {
      await db.query("UPDATE users SET mfa_enabled = true WHERE id = $1", [
        userId,
      ]);
    }

    return isValid;
  }

  /**
   * Initiate password reset
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async forgotPassword(email) {
    const result = await db.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if user exists for security
      return;
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = encryptionUtil.generateSecureToken(32);
    await cacheService.set(
      `reset:${resetToken}`,
      {
        userId: user.id,
        email: user.email,
      },
      3600
    );

    // Send reset email
    await notificationService.sendPasswordReset(user.email, resetToken);
  }

  /**
   * Reset password using token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async resetPassword(token, newPassword) {
    const resetData = await cacheService.get(`reset:${resetToken}`);
    if (!resetData) {
      const error = new Error("Invalid or expired reset token");
      error.code = "INVALID_RESET_TOKEN";
      error.status = 400;
      throw error;
    }

    // Hash new password
    const passwordHash = await encryptionUtil.hashData(newPassword);

    // Update password
    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [passwordHash, resetData.userId]
    );

    // Delete reset token
    await cacheService.delete(`reset:${resetToken}`);

    // Invalidate all sessions for this user
    // In a real implementation, you'd blacklist all sessions
  }

  /**
   * Change password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async changePassword(userId, currentPassword, newPassword) {
    const result = await db.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      const error = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    // Verify current password
    const validPassword = await encryptionUtil.verifyHash(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!validPassword) {
      const error = new Error("Current password is incorrect");
      error.code = "INVALID_PASSWORD";
      error.status = 400;
      throw error;
    }

    // Hash new password
    const newPasswordHash = await encryptionUtil.hashData(newPassword);

    // Update password
    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [newPasswordHash, userId]
    );
  }

  /**
   * Logout user
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async logout(userId, sessionId) {
    // Remove session from cache
    await cacheService.delete(`session:${sessionId}`);

    // Add token to blacklist (if we had the token)
    // For simplicity, we'll just remove the session
  }

  /**
   * Validate user session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Session data or null
   */
  async validateSession(sessionId) {
    return cacheService.getSession(sessionId);
  }

  /**
   * Verify email address
   * @param {string} token - Email verification token
   * @returns {Promise<void>}
   */
  async verifyEmail(token) {
    const emailData = await cacheService.get(`verify:${token}`);
    if (!emailData) {
      const error = new Error("Invalid or expired verification token");
      error.code = "INVALID_VERIFICATION_TOKEN";
      error.status = 400;
      throw error;
    }

    // Update user status
    await db.query(
      "UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      ["VERIFIED", emailData.userId]
    );

    // Delete verification token
    await cacheService.delete(`verify:${token}`);
  }

  /**
   * Check if user has permission
   * @param {string} userId - User ID
   * @param {string} permission - Required permission
   * @returns {Promise<boolean>} Has permission
   */
  async hasPermission(userId, permission) {
    // In a real implementation, you'd check against user roles and permissions
    // For now, return true for all authenticated users
    return true;
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    const result = await db.query(
      "SELECT id, email, first_name, last_name, phone, status, mfa_enabled, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      status: user.status,
      mfaEnabled: user.mfa_enabled,
      createdAt: user.created_at,
    };
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByEmail(email) {
    const result = await db.query(
      "SELECT id, email, first_name, last_name, phone, status, mfa_enabled, created_at FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      status: user.status,
      mfaEnabled: user.mfa_enabled,
      createdAt: user.created_at,
    };
  }

  /**
   * Blacklist a token
   * @param {string} token - JWT token to blacklist
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<void>}
   */
  async blacklistToken(token, ttl = 86400) {
    await cacheService.set(`blacklist:${token}`, true, ttl);
  }
}

module.exports = new AuthService();
