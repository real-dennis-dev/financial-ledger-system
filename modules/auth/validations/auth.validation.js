const Joi = require("joi");

/**
 * Registration validation schema
 */
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .min(8)
    .max(100)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "Password is required",
    }),
  firstName: Joi.string().min(1).max(100).required().messages({
    "string.min": "First name must be at least 1 character long",
    "string.max": "First name cannot exceed 100 characters",
    "any.required": "First name is required",
  }),
  lastName: Joi.string().min(1).max(100).required().messages({
    "string.min": "Last name must be at least 1 character long",
    "string.max": "Last name cannot exceed 100 characters",
    "any.required": "Last name is required",
  }),
  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .optional()
    .messages({
      "string.pattern.base":
        "Please provide a valid phone number with country code",
    }),
});

/**
 * Login validation schema
 */
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
});

/**
 * Refresh token validation schema
 */
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required",
  }),
});

/**
 * Password reset validation schema
 */
const resetPasswordSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Reset token is required",
  }),
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "New password is required",
    }),
});

/**
 * Change password validation schema
 */
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "any.required": "Current password is required",
  }),
  newPassword: Joi.string()
    .min(8)
    .max(100)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      "any.required": "New password is required",
    })
    .invalid(Joi.ref("currentPassword"))
    .messages({
      "any.invalid": "New password must be different from current password",
    }),
});

/**
 * MFA validation schema
 */
const mfaSchema = Joi.object({
  code: Joi.string()
    .length(6)
    .pattern(/^[0-9]{6}$/)
    .required()
    .messages({
      "string.length": "MFA code must be 6 digits",
      "string.pattern.base": "MFA code must contain only digits",
      "any.required": "MFA code is required",
    }),
});

/**
 * Forgot password validation schema
 */
const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
});

/**
 * Email verification validation schema
 */
const verifyEmailSchema = Joi.object({
  token: Joi.string().required().messages({
    "any.required": "Verification token is required",
  }),
});

/**
 * Password validation helper
 */
const passwordValidator = {
  schema: Joi.string()
    .min(8)
    .max(100)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    ),
  validate: (password) => {
    const { error } = passwordValidator.schema.validate(password);
    if (error) {
      return {
        valid: false,
        message:
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character",
      };
    }
    return { valid: true };
  },
};

/**
 * Password strength checker
 */
const checkPasswordStrength = (password) => {
  let score = 0;

  // Length check
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[@$!%*?&]/.test(password)) score++;

  // Common patterns check
  const commonPatterns = ["password", "123456", "qwerty", "abc123"];
  if (
    commonPatterns.some((pattern) => password.toLowerCase().includes(pattern))
  ) {
    score = Math.max(0, score - 2);
  }

  // Determine strength
  if (score <= 3) return "weak";
  if (score <= 5) return "medium";
  if (score <= 7) return "strong";
  return "very strong";
};

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  changePasswordSchema,
  mfaSchema,
  forgotPasswordSchema,
  verifyEmailSchema,
  passwordValidator,
  checkPasswordStrength,
};
