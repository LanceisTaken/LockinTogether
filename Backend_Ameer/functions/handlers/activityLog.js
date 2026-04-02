const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");

const REGION = "asia-southeast1";

// ============================================================
// Phase 5: Activity Logging — DFD Process 5.0
// ============================================================

async function createLog(boardId, userId, action, details, taskId = null) {
  const logData = { boardId, userId, action, details, taskId, timestamp: FieldValue.serverTimestamp() };
  const logRef = await db.collection("activityLog").add(logData);
  return logRef.id;
}

const getActivityLog = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed. Use GET." });

      const decodedToken = await verifyAuth(req);
      const { boardId, action, limit, startAfter } = req.query;

      if (!boardId) return res.status(400).json({ error: "boardId query parameter is required." });

      const { checkMembership } = require("./boards");
      await checkMembership(decodedToken.uid, boardId);

      const pageSize = Math.min(parseInt(limit) || 20, 50);

      let query = db.collection("activityLog")
        .where("boardId", "==", boardId)
        .orderBy("timestamp", "desc")
        .limit(pageSize + 1);

      if (action) {
        query = db.collection("activityLog")
          .where("boardId", "==", boardId).where("action", "==", action)
          .orderBy("timestamp", "desc").limit(pageSize + 1);
      }

      if (startAfter) {
        const cursorDoc = await db.collection("activityLog").doc(startAfter).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      const snapshot = await query.get();
      const docs = snapshot.docs;
      const hasMore = docs.length > pageSize;
      const resultDocs = hasMore ? docs.slice(0, pageSize) : docs;

      const userCache = {};
      const logs = [];

      for (const doc of resultDocs) {
        const logData = doc.data();
        if (!userCache[logData.userId]) {
          const userDoc = await db.collection("users").doc(logData.userId).get();
          userCache[logData.userId] = userDoc.exists ? userDoc.data().displayName : "Unknown User";
        }
        logs.push({ logId: doc.id, ...logData, userName: userCache[logData.userId] });
      }

      const lastLogId = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].id : null;
      return res.status(200).json({ logs, hasMore, lastLogId });
    } catch (error) {
      logger.error("getActivityLog error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = { createLog, getActivityLog };
