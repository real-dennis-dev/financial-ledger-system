const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Financial Ledger System API",
      version: "1.0.0",
      description:
        "Banking and fintech ledger system with double-entry accounting",
      contact: {
        name: "API Support",
        email: "support@financial-ledger.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Development server",
      },
      {
        url: "https://api.financial-ledger.com/api/v1",
        description: "Production server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
        idempotencyKey: {
          type: "apiKey",
          in: "header",
          name: "Idempotency-Key",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object" },
              },
            },
          },
        },
        Success: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            message: { type: "string" },
          },
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            phone: { type: "string" },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED"],
            },
            mfaEnabled: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Account: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            accountNumber: { type: "string" },
            userId: { type: "string", format: "uuid" },
            currency: { type: "string", enum: ["USD", "EUR", "GBP", "NGN"] },
            type: {
              type: "string",
              enum: ["SAVINGS", "CURRENT", "WALLET", "TREASURY"],
            },
            status: { type: "string", enum: ["ACTIVE", "FROZEN", "CLOSED"] },
            balance: { type: "number" },
            availableBalance: { type: "number" },
            frozen: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Transaction: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            reference: { type: "string" },
            status: {
              type: "string",
              enum: [
                "PENDING",
                "PROCESSING",
                "COMPLETED",
                "FAILED",
                "CANCELLED",
              ],
            },
            type: {
              type: "string",
              enum: ["TRANSFER", "DEPOSIT", "WITHDRAWAL", "PAYMENT", "REFUND"],
            },
            amount: { type: "number" },
            currency: { type: "string" },
            description: { type: "string" },
            metadata: { type: "object" },
            createdAt: { type: "string", format: "date-time" },
            completedAt: { type: "string", format: "date-time" },
          },
        },
        LedgerEntry: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            accountId: { type: "string", format: "uuid" },
            transactionId: { type: "string", format: "uuid" },
            amount: { type: "number" },
            entryType: { type: "string", enum: ["DEBIT", "CREDIT"] },
            reference: { type: "string" },
            description: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Hold: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            accountId: { type: "string", format: "uuid" },
            transactionId: { type: "string", format: "uuid" },
            amount: { type: "number" },
            status: { type: "string", enum: ["ACTIVE", "RELEASED", "EXPIRED"] },
            reason: { type: "string" },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            releasedAt: { type: "string", format: "date-time" },
          },
        },
      },
      parameters: {
        pageParam: {
          name: "page",
          in: "query",
          description: "Page number",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        limitParam: {
          name: "limit",
          in: "query",
          description: "Items per page",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
        },
        fromDateParam: {
          name: "fromDate",
          in: "query",
          description: "Start date (ISO 8601)",
          schema: { type: "string", format: "date-time" },
        },
        toDateParam: {
          name: "toDate",
          in: "query",
          description: "End date (ISO 8601)",
          schema: { type: "string", format: "date-time" },
        },
      },
      responses: {
        BadRequest: {
          description: "Bad Request",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Invalid input data",
                  details: {
                    field: "amount",
                    message: "Amount must be greater than 0",
                  },
                },
              },
            },
          },
        },
        Unauthorized: {
          description: "Unauthorized",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "UNAUTHORIZED",
                  message: "Authentication required",
                },
              },
            },
          },
        },
        Forbidden: {
          description: "Forbidden",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "FORBIDDEN",
                  message: "Insufficient permissions",
                },
              },
            },
          },
        },
        NotFound: {
          description: "Not Found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "NOT_FOUND",
                  message: "Resource not found",
                },
              },
            },
          },
        },
        Conflict: {
          description: "Conflict",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "CONFLICT",
                  message: "Resource already exists",
                },
              },
            },
          },
        },
        InternalServerError: {
          description: "Internal Server Error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                success: false,
                error: {
                  code: "INTERNAL_ERROR",
                  message: "An unexpected error occurred",
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Authentication endpoints" },
      { name: "Accounts", description: "Account management endpoints" },
      { name: "Transactions", description: "Transaction processing endpoints" },
      { name: "Ledger", description: "Ledger and accounting endpoints" },
      { name: "Balances", description: "Balance management endpoints" },
      { name: "Holds", description: "Hold and reservation endpoints" },
      { name: "Reconciliation", description: "Reconciliation endpoints" },
      { name: "Reports", description: "Reporting endpoints" },
    ],
    security: [{ bearerAuth: [] }],
  },
  apis: [
    "./src/modules/**/*.js",
    "./src/modules/**/routes/*.js",
    "./src/modules/**/controllers/*.js",
  ],
};

const swaggerSpec = swaggerJSDoc(options);

// Swagger UI configuration
const swaggerUiOptions = {
  explorer: true,
  customCss: ".swagger-ui .topbar { display: none }",
  customSiteTitle: "Financial Ledger System API Documentation",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    tryItOutEnabled: true,
    operationsSorter: "method",
    tagsSorter: "alpha",
  },
};

module.exports = {
  swaggerSpec,
  swaggerUi,
  swaggerUiOptions,
};
