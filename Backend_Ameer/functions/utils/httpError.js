/**
 * Firebase / Firestore errors use string codes (e.g. "failed-precondition") or
 * gRPC-style numbers — not HTTP status codes. Express must receive 400–599 only.
 */
function httpStatusFromError(error) {
  const c = error && error.code;
  if (typeof c === "number" && c >= 400 && c < 600) return c;
  return 500;
}

function sendError(res, error) {
  const msg = (error && error.message) ? String(error.message) : String(error);
  return res.status(httpStatusFromError(error)).json({ error: msg });
}

module.exports = { httpStatusFromError, sendError };
