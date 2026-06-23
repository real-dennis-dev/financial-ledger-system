const db = require("../../../config/database");
const {
  BadRequest,
  NotFound,
} = require("../../../common/middleware/error.middleware");

class ReportMiddleware {
  validateReportRequest(req, res, next) {
    const { startDate, endDate } = req.body;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new BadRequest("Invalid date format");
      }

      if (start > end) {
        throw new BadRequest("Start date must be before end date");
      }

      const diffDays = (end - start) / (1000 * 60 * 60 * 24);
      if (diffDays > 365) {
        throw new BadRequest("Date range cannot exceed 365 days");
      }
    }

    next();
  }

  async authorizeReportAccess(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await db.query("SELECT * FROM reports WHERE id = $1", [
        id,
      ]);

      if (result.rows.length === 0) {
        throw new NotFound("Report not found");
      }

      const report = result.rows[0];

      // Check if user owns the report or is admin
      if (report.generated_by !== userId) {
        const userResult = await db.query(
          "SELECT role FROM users WHERE id = $1",
          [userId]
        );
        const userRole = userResult.rows[0]?.role || "user";

        if (userRole !== "admin") {
          throw new BadRequest("You do not have access to this report");
        }
      }

      req.report = report;
      next();
    } catch (error) {
      next(error);
    }
  }

  validateReportFormat(req, res, next) {
    const { format } = req.query || req.body;

    if (format && !["json", "pdf", "csv"].includes(format)) {
      throw new BadRequest("Invalid format. Must be json, pdf, or csv");
    }

    next();
  }
}

module.exports = new ReportMiddleware();
