const reconciliationService = require("../services/reconciliation.service");
const {
  NotFound,
  BadRequest,
} = require("../../../common/middleware/error.middleware");

class ReconciliationMiddleware {
  async validateReconciliation(req, res, next) {
    try {
      const { id } = req.params;

      if (!id) {
        return next();
      }

      const reconciliation = await reconciliationService.getReconciliationById(
        id
      );

      if (!reconciliation) {
        throw new NotFound("Reconciliation not found");
      }

      req.reconciliation = reconciliation;
      next();
    } catch (error) {
      next(error);
    }
  }

  checkReconciliationStatus(allowedStatuses = []) {
    return (req, res, next) => {
      const reconciliation = req.reconciliation;

      if (!reconciliation) {
        throw new NotFound("Reconciliation not found");
      }

      if (
        allowedStatuses.length > 0 &&
        !allowedStatuses.includes(reconciliation.status)
      ) {
        throw new BadRequest(
          `Reconciliation must be in status: ${allowedStatuses.join(", ")}`
        );
      }

      next();
    };
  }

  validateReconciliationData(req, res, next) {
    const { type, startDate, endDate } = req.body;

    if (!type || !startDate || !endDate) {
      throw new BadRequest("Type, startDate, and endDate are required");
    }

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

    next();
  }
}

module.exports = new ReconciliationMiddleware();
