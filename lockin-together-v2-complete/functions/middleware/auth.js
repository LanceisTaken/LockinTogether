const { auth } = require("../config/firebase");

/**
 * Middleware to verify Firebase Authentication ID tokens.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it with Firebase Auth, and attaches the decoded
 * user info to the request object.
 *
 * @param {Object} req - Express-style request object
 * @returns {Object} Decoded token with uid, email, etc.
 * @throws {Error} If token is missing or invalid
 */
async function verifyAuth(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw Object.assign(
      new Error("Missing or malformed Authorization header. Expected: Bearer <token>"),
      { code: 401 }
    );
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw Object.assign(
      new Error("Invalid or expired authentication token."),
      { code: 401 }
    );
  }
}

module.exports = { verifyAuth };
