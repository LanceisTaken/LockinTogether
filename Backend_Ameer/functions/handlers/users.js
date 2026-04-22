const { onRequest } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { validateString } = require("../utils/validators");

const REGION = "asia-southeast1";

//User Profile Management

const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const userProfile = {
    userId: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "New User",
    photoURL: user.photoURL || null,
    role: "user",
    createdAt: FieldValue.serverTimestamp(),
  };

  await db.collection("users").doc(user.uid).set(userProfile);

  logger.info("User profile created", {
    userId: user.uid,
    email: user.email,
  });
  return null;
});


const getUserProfile = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed. Use GET." });
      }

      const decodedToken = await verifyAuth(req);
      const targetUid = req.query.uid || decodedToken.uid;
      const userDoc = await db.collection("users").doc(targetUid).get();

      if (!userDoc.exists) {
        return res.status(404).json({ error: "User profile not found." });
      }

      const userData = userDoc.data();

      if (targetUid !== decodedToken.uid) {
        return res.status(200).json({
          userId: userData.userId,
          displayName: userData.displayName,
          photoURL: userData.photoURL || null,
        });
      }

      return res.status(200).json(userData);
    } catch (error) {
      logger.error("getUserProfile error", { error: error.message, userId: req.query?.uid });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});


const updateUserProfile = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") {
        return res.status(405).json({ error: "Method not allowed. Use PATCH." });
      }

      const decodedToken = await verifyAuth(req);
      const { displayName, photoURL } = req.body;
      const updates = {};

      if (displayName !== undefined) {
        validateString(displayName, "displayName", 100);
        updates.displayName = displayName.trim();
      }

      if (photoURL !== undefined) {
        if (typeof photoURL !== "string") {
          return res.status(400).json({ error: "photoURL must be a string." });
        }
        updates.photoURL = photoURL;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          error: "No valid fields to update. Provide displayName or photoURL.",
        });
      }

      updates.updatedAt = FieldValue.serverTimestamp();

      const userRef = db.collection("users").doc(decodedToken.uid);
      await userRef.update(updates);

      const authUpdates = {};
      if (updates.displayName) authUpdates.displayName = updates.displayName;
      if (updates.photoURL) authUpdates.photoURL = updates.photoURL;
      if (Object.keys(authUpdates).length > 0) {
        await admin.auth().updateUser(decodedToken.uid, authUpdates);
      }

      const updatedDoc = await userRef.get();

      logger.info("User profile updated", { userId: decodedToken.uid });

      return res.status(200).json({
        message: "Profile updated successfully.",
        user: updatedDoc.data(),
      });
    } catch (error) {
      logger.error("updateUserProfile error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});


const searchUserByEmail = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed. Use GET." });
      }

      await verifyAuth(req);
      const { email } = req.query;

      if (!email || typeof email !== "string") {
        return res.status(400).json({
          error: "Email query parameter is required.",
        });
      }

      const usersSnapshot = await db.collection("users")
        .where("email", "==", email.trim().toLowerCase())
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        return res.status(404).json({
          error: "No user found with that email address.",
        });
      }

      const userData = usersSnapshot.docs[0].data();

      return res.status(200).json({
        userId: userData.userId,
        displayName: userData.displayName,
        email: userData.email,
        photoURL: userData.photoURL || null,
      });
    } catch (error) {
      logger.error("searchUserByEmail error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = {
  onUserCreate,
  getUserProfile,
  updateUserProfile,
  searchUserByEmail,
};
