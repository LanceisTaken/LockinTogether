const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { db, admin, FieldValue } = require("../config/firebase");

const REGION = "asia-southeast1";

// ============================================================
// Firestore Triggers (Event-Driven Architecture)
// Task 2.4: Observer + Event-Driven patterns
// ============================================================

const onTaskWrite = onDocumentWritten(
  { document: "tasks/{taskId}", region: REGION },
  async (event) => {
    const { taskId } = event.params;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    try {
      // Task Created
      if (!before && after) {
        const recentLog = await db.collection("activityLog")
          .where("taskId", "==", taskId).where("action", "==", "task_created")
          .orderBy("timestamp", "desc").limit(1).get();

        if (recentLog.empty) {
          await db.collection("activityLog").add({
            boardId: after.boardId, userId: after.createdBy, taskId,
            action: "task_created",
            details: `Task "${after.title}" was created in "${after.status}".`,
            timestamp: FieldValue.serverTimestamp(),
          });
        }
        return null;
      }

      // Task Deleted
      if (before && !after) {
        const recentLog = await db.collection("activityLog")
          .where("taskId", "==", taskId).where("action", "==", "task_deleted")
          .orderBy("timestamp", "desc").limit(1).get();

        if (recentLog.empty) {
          await db.collection("activityLog").add({
            boardId: before.boardId, userId: before.createdBy, taskId,
            action: "task_deleted",
            details: `Task "${before.title}" was deleted.`,
            timestamp: FieldValue.serverTimestamp(),
          });
        }
        return null;
      }

      // Task Updated
      if (before && after) {
        if (before.status !== after.status) {
          const recentLog = await db.collection("activityLog")
            .where("taskId", "==", taskId).where("action", "==", "task_moved")
            .orderBy("timestamp", "desc").limit(1).get();

          if (recentLog.empty) {
            await db.collection("activityLog").add({
              boardId: after.boardId, userId: after.createdBy, taskId,
              action: "task_moved",
              details: `Task "${after.title}" moved from "${before.status}" to "${after.status}".`,
              timestamp: FieldValue.serverTimestamp(),
            });
          }

          logger.info("Task Status Changed", {
            boardId: after.boardId, taskId, newStatus: after.status,
          });
        }

        if (before.assignedTo !== after.assignedTo) {
          const action = after.assignedTo ? "task_assigned" : "task_unassigned";
          const recentLog = await db.collection("activityLog")
            .where("taskId", "==", taskId).where("action", "==", action)
            .orderBy("timestamp", "desc").limit(1).get();

          if (recentLog.empty) {
            await db.collection("activityLog").add({
              boardId: after.boardId, userId: after.createdBy, taskId, action,
              details: after.assignedTo
                ? `Task "${after.title}" was assigned.`
                : `Task "${after.title}" was unassigned.`,
              timestamp: FieldValue.serverTimestamp(),
            });
          }
        }
      }

      return null;
    } catch (error) {
      logger.error("onTaskWrite trigger error", { taskId, error: error.message });
      return null;
    }
  }
);

module.exports = { onTaskWrite };
