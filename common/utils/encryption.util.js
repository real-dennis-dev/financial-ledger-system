const crypto = require("crypto");
const bcrypt = require("bcrypt");
const logger = require("../../config/logger");

class EncryptionUtil {
  constructor() {
    this.algorithm = "aes-256-cbc";
    this.encryptionKey =
      process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
    this.key = Buffer.from(this.encryptionKey, "hex");
  }

  encryptData(data, key = null) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        key ? Buffer.from(key, "hex") : this.key,
        iv
      );

      let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
      encrypted += cipher.final("hex");

      return {
        iv: iv.toString("hex"),
        encryptedData: encrypted,
      };
    } catch (error) {
      logger.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  decryptData(encryptedData, iv, key = null) {
    try {
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key ? Buffer.from(key, "hex") : this.key,
        Buffer.from(iv, "hex")
      );

      let decrypted = decipher.update(encryptedData, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error("Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }

  async hashData(data) {
    try {
      const salt = await bcrypt.genSalt(
        parseInt(process.env.BCRYPT_ROUNDS) || 12
      );
      return await bcrypt.hash(data, salt);
    } catch (error) {
      logger.error("Hashing error:", error);
      throw new Error("Failed to hash data");
    }
  }

  async verifyHash(data, hash) {
    try {
      return await bcrypt.compare(data, hash);
    } catch (error) {
      logger.error("Hash verification error:", error);
      return false;
    }
  }

  generateSecureToken(length = 32) {
    return crypto
      .randomBytes(length)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  generateOTP(length = 6) {
    const digits = "0123456789";
    let otp = "";
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  generateAPIKey() {
    const prefix = "FLS";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(16).toString("hex").toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  hashWithSecret(data, secret) {
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  validateEncryptedData(data) {
    return data && data.iv && data.encryptedData;
  }

  rotateEncryptionKey() {
    const newKey = crypto.randomBytes(32).toString("hex");
    // In production, this would involve re-encrypting all data with the new key
    // This is a simplified version
    logger.warn("Encryption key rotated", {
      oldKey: this.encryptionKey.substring(0, 8) + "...",
      newKey: newKey.substring(0, 8) + "...",
    });

    this.encryptionKey = newKey;
    this.key = Buffer.from(newKey, "hex");
    return newKey;
  }
}

module.exports = new EncryptionUtil();
