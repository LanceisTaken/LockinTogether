/**
 * Structured logging utility for LockinTogether Cloud Functions.
 *
 * Wraps firebase-functions/logger with consistent fields so every log entry
 * is queryable in Cloud Logging by:  function, userId, boardId, taskId,
 * durationMs, and severity.
 *
 * Usage:
 *   const { startTimer, logRequest, logSuccess, logError } = require("../utils/monitoring");
 *
 *   const t = startTimer();
 *   logRequest("createTask", uid, { boardId });
 *   ...
 *   logSuccess("createTask", t, { boardId, taskId });
 *
 * Cloud Logging query to see slow operations (> 2s):
 *   resource.type="cloud_run_revision"
 *   jsonPayload.function="createTask"
 *   jsonPayload.durationMs > 2000
 */

const logger = require("firebase-functions/logger");

const SERVICE = "lockintogether";

/**
 * Returns the current timestamp in milliseconds. Pass the result to
 * logSuccess() to record how long the function took.
 */
function startTimer() {
  return Date.now();
}

/**
 * Returns milliseconds elapsed since the value returned by startTimer().
 */
function elapsed(startMs) {
  return Date.now() - startMs;
}

/**
 * Logs the start of a function invocation.
 * Call this immediately after verifyAuth succeeds.
 *
 * @param {string} functionName - e.g. "createTask"
 * @param {string} userId       - decoded token uid
 * @param {object} extraFields  - e.g. { boardId, taskId }
 */
function logRequest(functionName, userId, extraFields = {}) {
  logger.info("request_start", {
    service: SERVICE,
    function: functionName,
    userId: userId || "unauthenticated",
    ...extraFields,
  });
}

/**
 * Logs successful completion with execution duration.
 * durationMs is surfaced in the dashboard's latency panel.
 *
 * @param {string} functionName - e.g. "createTask"
 * @param {number} startMs      - value from startTimer()
 * @param {object} extraFields  - e.g. { boardId, taskId, status }
 */
function logSuccess(functionName, startMs, extraFields = {}) {
  logger.info("request_success", {
    service: SERVICE,
    function: functionName,
    durationMs: elapsed(startMs),
    ...extraFields,
  });
}

/**
 * Logs a function error.
 * These entries appear as ERROR severity in Cloud Logging and increment the
 * error rate shown in the monitoring dashboard.
 *
 * @param {string} functionName - e.g. "createTask"
 * @param {Error}  error        - the caught error object
 * @param {object} extraFields  - e.g. { boardId, userId }
 */
function logError(functionName, error, extraFields = {}) {
  logger.error("request_error", {
    service: SERVICE,
    function: functionName,
    errorCode: error.code || 500,
    errorMessage: error.message,
    ...extraFields,
  });
}

/**
 * Logs an application-level warning (non-fatal, e.g. storage cleanup failed).
 *
 * @param {string} functionName - e.g. "deleteTask"
 * @param {string} message      - short description
 * @param {object} extraFields  - e.g. { boardId, storagePath }
 */
function logWarn(functionName, message, extraFields = {}) {
  logger.warn("request_warning", {
    service: SERVICE,
    function: functionName,
    message,
    ...extraFields,
  });
}

module.exports = { startTimer, elapsed, logRequest, logSuccess, logError, logWarn };
