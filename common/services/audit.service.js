const db = require("../../config/database");
const logger = require("../../config/logger");
const redis = require("../../config/redis");
const queueService = require("./queue.service");
const { v4: uuidv4 } = require("uuid");

class AuditService {
  async logAudit(event, metadata = {}) {
    const auditData = {
      id: uuidv4(),
      user_id: metadata.userId || null,
      action: event,
      entity_type: metadata.entityType || "SYSTEM",
      entity_id: metadata.entityId || null,
      changes: metadata.changes || {},
      ip_address: metadata.ip || null,
      user_agent: metadata.userAgent || null,
      created_at: new Date().toISOString(),
    };

    try {
      // Log to database
      await db.query(
        `INSERT INTO audit_logs (
          id, user_id, action, entity_type, entity_id, 
          changes, ip_address, user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          auditData.id,
          auditData.user_id,
          auditData.action,
          auditData.entity_type,
          auditData.entity_id,
          auditData.changes,
          auditData.ip_address,
          auditData.user_agent,
          auditData.created_at,
        ]
      );

      // Log to Winston
      logger.audit(event, metadata);

      // Queue for async processing
      await queueService.addToQueue("audit", auditData, {
        priority: 5,
        attempts: 3,
      });

      return auditData;
    } catch (error) {
      logger.error("Audit log error:", error);
      // Don't throw - audit failures shouldn't break the main flow
      return null;
    }
  }

  async getAuditTrail(filters = {}) {
    const conditions = [];
    const params = [];
    let paramCount = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramCount}`);
      params.push(filters.userId);
      paramCount++;
    }

    if (filters.action) {
      conditions.push(`action = $${paramCount}`);
      params.push(filters.action);
      paramCount++;
    }

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramCount}`);
      params.push(filters.entityType);
      paramCount++;
    }

    if (filters.entityId) {
      conditions.push(`entity_id = $${paramCount}`);
      params.push(filters.entityId);
      paramCount++;
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      params.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      params.push(filters.endDate);
      paramCount++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    const query = `
      SELECT *
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount}
      OFFSET $${paramCount + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_logs
      ${whereClause}
    `;

    try {
      const [results, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, params.slice(0, -2)),
      ]);

      return {
        data: results.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset,
      };
    } catch (error) {
      logger.error("Get audit trail error:", error);
      throw error;
    }
  }

  async verifyAudit(auditId) {
    try {
      const result = await db.query("SELECT * FROM audit_logs WHERE id = $1", [
        auditId,
      ]);

      if (result.rows.length === 0) {
        throw new Error("Audit record not found");
      }

      const audit = result.rows[0];

      // Verify integrity - check if hash matches
      // This is a simplified version
      const hash = this.generateAuditHash(audit);
      const storedHash = audit.hash || null;

      return {
        verified: storedHash ? hash === storedHash : true,
        audit,
        hash,
      };
    } catch (error) {
      logger.error("Audit verification error:", error);
      throw error;
    }
  }

  generateAuditHash(audit) {
    const crypto = require("crypto");
    const data = `${audit.id}:${audit.action}:${audit.entity_type}:${audit.entity_id}:${audit.created_at}`;
    return crypto
      .createHash("sha256")
      .update(data + process.env.AUDIT_SALT || "audit-salt")
      .digest("hex");
  }

  async getUserActivity(userId, limit = 50) {
    const result = await db.query(
      `SELECT *
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  async getEntityAudit(entityType, entityId, limit = 50) {
    const result = await db.query(
      `SELECT *
       FROM audit_logs
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [entityType, entityId, limit]
    );

    return result.rows;
  }

  async getRecentActions(limit = 100) {
    const result = await db.query(
      `SELECT *
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async getActionStats(startDate, endDate) {
    const result = await db.query(
      `SELECT 
         action,
         COUNT(*) as count,
         DATE(created_at) as date
       FROM audit_logs
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY action, DATE(created_at)
       ORDER BY date DESC, count DESC`,
      [startDate, endDate]
    );

    return result.rows;
  }

  async cleanupOldAudit(days = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await db.query(
      "DELETE FROM audit_logs WHERE created_at < $1 RETURNING id",
      [cutoffDate]
    );

    logger.info("Audit cleanup completed", {
      deletedCount: result.rowCount,
      days,
    });

    return {
      deletedCount: result.rowCount,
      cutoffDate: cutoffDate.toISOString(),
    };
  }

  // Convenience methods for specific audit events
  async logTransaction(userId, transactionId, action, metadata = {}) {
    return this.logAudit(action, {
      userId,
      entityType: "TRANSACTION",
      entityId: transactionId,
      changes: metadata,
      ...metadata,
    });
  }

  async logAccount(userId, accountId, action, metadata = {}) {
    return this.logAudit(action, {
      userId,
      entityType: "ACCOUNT",
      entityId: accountId,
      changes: metadata,
      ...metadata,
    });
  }

  async logUserAction(userId, action, metadata = {}) {
    return this.logAudit(action, {
      userId,
      entityType: "USER",
      entityId: userId,
      changes: metadata,
      ...metadata,
    });
  }

  async logSecurityEvent(userId, action, metadata = {}) {
    return this.logAudit(`SECURITY_${action}`, {
      userId,
      entityType: "SECURITY",
      changes: metadata,
      ...metadata,
    });
  }
}

module.exports = new AuditService();
