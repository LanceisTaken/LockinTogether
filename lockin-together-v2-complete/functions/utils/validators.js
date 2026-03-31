/**
 * Validation utility functions for request input.
 * Used across all handlers to ensure data integrity
 * before writing to Firestore.
 */

/**
 * Validates that all required fields are present and non-empty in the body.
 * @param {Object} body - Request body
 * @param {string[]} fields - Array of required field names
 * @throws {Error} If any field is missing or empty
 */
function requireFields(body, fields) {
  const missing = fields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw Object.assign(
      new Error(`Missing required fields: ${missing.join(", ")}`),
      { code: 400 }
    );
  }
}

/**
 * Validates that a string is non-empty and within length limits.
 * @param {string} value - The string to validate
 * @param {string} fieldName - Field name for error messages
 * @param {number} maxLength - Maximum allowed length
 * @throws {Error} If validation fails
 */
function validateString(value, fieldName, maxLength = 500) {
  if (typeof value !== "string") {
    throw Object.assign(
      new Error(`${fieldName} must be a string.`),
      { code: 400 }
    );
  }
  if (value.trim().length === 0) {
    throw Object.assign(
      new Error(`${fieldName} cannot be empty.`),
      { code: 400 }
    );
  }
  if (value.length > maxLength) {
    throw Object.assign(
      new Error(`${fieldName} must be ${maxLength} characters or fewer.`),
      { code: 400 }
    );
  }
}

/**
 * Validates that columns is a non-empty array of strings.
 * @param {Array} columns - The columns array to validate
 * @throws {Error} If validation fails
 */
function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw Object.assign(
      new Error("Columns must be a non-empty array of strings."),
      { code: 400 }
    );
  }

  const invalid = columns.filter(
    (col) => typeof col !== "string" || col.trim().length === 0
  );

  if (invalid.length > 0) {
    throw Object.assign(
      new Error("Each column name must be a non-empty string."),
      { code: 400 }
    );
  }

  // Check for duplicates
  const unique = new Set(columns.map((col) => col.trim().toLowerCase()));
  if (unique.size !== columns.length) {
    throw Object.assign(
      new Error("Column names must be unique."),
      { code: 400 }
    );
  }
}

/**
 * Validates a file upload against size and type constraints.
 * @param {number} fileSize - File size in bytes
 * @param {string} mimeType - File MIME type
 * @param {number} maxSizeMB - Maximum file size in MB (default 10)
 * @throws {Error} If validation fails
 */
function validateFile(fileSize, mimeType, maxSizeMB = 10) {
  const maxBytes = maxSizeMB * 1024 * 1024;

  if (fileSize > maxBytes) {
    throw Object.assign(
      new Error(`File size exceeds the ${maxSizeMB}MB limit.`),
      { code: 400 }
    );
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw Object.assign(
      new Error(`File type "${mimeType}" is not allowed.`),
      { code: 400 }
    );
  }
}

module.exports = {
  requireFields,
  validateString,
  validateColumns,
  validateFile,
};
