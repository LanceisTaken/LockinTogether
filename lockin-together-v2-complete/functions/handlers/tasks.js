const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { createLog } = require("./activityLog");
const { checkMembership } = require("./boards");
const { requireFields, validateString } = require("../utils/validators");

const REGION = "asia-southeast1";

// ============================================================
// Phase 3: Task Management (Core Feature)
// UC-03, UC-04, UC-05, UC-06, UC-10
// ============================================================

const createTask = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, title, description, status, deadline, assignedTo } = req.body;

      requireFields(req.body, ["boardId", "title", "status"]);
      validateString(title, "title", 200);
      if (description !== undefined) validateString(description, "description", 2000);

      await checkMembership(decodedToken.uid, boardId);

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (!boardDoc.exists) return res.status(404).json({ error: "Board not found." });

      const boardColumns = boardDoc.data().columns;
      if (!boardColumns.includes(status)) {
        return res.status(400).json({
          error: `Invalid column "${status}". Available columns: ${boardColumns.join(", ")}`,
        });
      }

      if (assignedTo) {
        const assigneeDoc = await db.collection("boardMembers").doc(`${assignedTo}_${boardId}`).get();
        if (!assigneeDoc.exists) {
          return res.status(400).json({ error: "Assigned user is not a member of this board." });
        }
      }

      const existingTasks = await db.collection("tasks")
        .where("boardId", "==", boardId).where("status", "==", status)
        .orderBy("columnIndex", "desc").limit(1).get();

      const nextIndex = existingTasks.empty ? 0 : existingTasks.docs[0].data().columnIndex + 1;

      const taskData = {
        boardId, createdBy: decodedToken.uid, assignedTo: assignedTo || null,
        title: title.trim(), description: description ? description.trim() : "",
        status, columnIndex: nextIndex,
        deadline: deadline ? new Date(deadline) : null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };

      const taskRef = await db.collection("tasks").add(taskData);

      await createLog(boardId, decodedToken.uid, "task_created",
        `Task "${title.trim()}" was created in "${status}".`, taskRef.id);

      logger.info("Task created", { boardId, taskId: taskRef.id, userId: decodedToken.uid, status });

      return res.status(201).json({ message: "Task created successfully.", task: { taskId: taskRef.id, ...taskData } });
    } catch (error) {
      logger.error("createTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const getTasksByBoard = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed. Use GET." });

      const decodedToken = await verifyAuth(req);
      const { boardId } = req.query;

      if (!boardId) return res.status(400).json({ error: "boardId query parameter is required." });

      await checkMembership(decodedToken.uid, boardId);

      const tasksSnapshot = await db.collection("tasks")
        .where("boardId", "==", boardId).orderBy("status").orderBy("columnIndex").get();

      const tasks = tasksSnapshot.docs.map((doc) => ({ taskId: doc.id, ...doc.data() }));
      return res.status(200).json({ tasks });
    } catch (error) {
      logger.error("getTasksByBoard error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const updateTask = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed. Use PATCH." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId, title, description, deadline, assignedTo } = req.body;

      requireFields(req.body, ["taskId", "boardId"]);
      await checkMembership(decodedToken.uid, boardId);

      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) return res.status(404).json({ error: "Task not found." });
      if (taskDoc.data().boardId !== boardId) return res.status(403).json({ error: "Task does not belong to this board." });

      const updates = {};
      if (title !== undefined) { validateString(title, "title", 200); updates.title = title.trim(); }
      if (description !== undefined) {
        updates.description = (description === null || description === "") ? "" : (() => { validateString(description, "description", 2000); return description.trim(); })();
      }
      if (deadline !== undefined) updates.deadline = deadline ? new Date(deadline) : null;
      if (assignedTo !== undefined) {
        if (assignedTo === null) { updates.assignedTo = null; }
        else {
          const assigneeDoc = await db.collection("boardMembers").doc(`${assignedTo}_${boardId}`).get();
          if (!assigneeDoc.exists) return res.status(400).json({ error: "Assigned user is not a member of this board." });
          updates.assignedTo = assignedTo;
        }
      }

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update." });

      updates.updatedAt = FieldValue.serverTimestamp();
      await db.collection("tasks").doc(taskId).update(updates);
      await createLog(boardId, decodedToken.uid, "task_edited", `Task "${taskDoc.data().title}" was updated.`, taskId);

      logger.info("Task updated", { boardId, taskId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task updated successfully." });
    } catch (error) {
      logger.error("updateTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const moveTask = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed. Use PATCH." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId, newStatus, newColumnIndex } = req.body;

      requireFields(req.body, ["taskId", "boardId", "newStatus"]);
      await checkMembership(decodedToken.uid, boardId);

      const targetIndex = typeof newColumnIndex === "number" ? newColumnIndex : 0;
      if (targetIndex < 0 || !Number.isInteger(targetIndex)) {
        return res.status(400).json({ error: "newColumnIndex must be a non-negative integer." });
      }

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (!boardDoc.exists) return res.status(404).json({ error: "Board not found." });
      if (!boardDoc.data().columns.includes(newStatus)) {
        return res.status(400).json({ error: `Invalid column "${newStatus}". Available: ${boardDoc.data().columns.join(", ")}` });
      }

      await db.runTransaction(async (transaction) => {
        const taskRef = db.collection("tasks").doc(taskId);
        const taskDoc = await transaction.get(taskRef);

        if (!taskDoc.exists) throw Object.assign(new Error("Task not found."), { code: 404 });
        if (taskDoc.data().boardId !== boardId) throw Object.assign(new Error("Task does not belong to this board."), { code: 403 });

        const oldStatus = taskDoc.data().status;
        const oldIndex = taskDoc.data().columnIndex;

        if (oldStatus === newStatus) {
          if (oldIndex === targetIndex) return;

          const columnTasksSnapshot = await transaction.get(
            db.collection("tasks").where("boardId", "==", boardId).where("status", "==", oldStatus).orderBy("columnIndex"));

          const columnTasks = columnTasksSnapshot.docs.map((doc) => ({ ref: doc.ref, id: doc.id, ...doc.data() }));
          const filtered = columnTasks.filter((t) => t.id !== taskId);
          const clampedIndex = Math.min(targetIndex, filtered.length);
          filtered.splice(clampedIndex, 0, { ref: taskRef, id: taskId, ...taskDoc.data() });

          filtered.forEach((task, index) => {
            transaction.update(task.ref, {
              columnIndex: index,
              ...(task.id === taskId ? { updatedAt: FieldValue.serverTimestamp() } : {}),
            });
          });
          return;
        }

        const sourceSnapshot = await transaction.get(
          db.collection("tasks").where("boardId", "==", boardId).where("status", "==", oldStatus).orderBy("columnIndex"));
        const destSnapshot = await transaction.get(
          db.collection("tasks").where("boardId", "==", boardId).where("status", "==", newStatus).orderBy("columnIndex"));

        const sourceTasks = sourceSnapshot.docs.filter((doc) => doc.id !== taskId).map((doc) => ({ ref: doc.ref, ...doc.data() }));
        sourceTasks.forEach((task, index) => transaction.update(task.ref, { columnIndex: index }));

        const destTasks = destSnapshot.docs.map((doc) => ({ ref: doc.ref, id: doc.id, ...doc.data() }));
        const clampedDestIndex = Math.min(targetIndex, destTasks.length);
        destTasks.splice(clampedDestIndex, 0, { ref: taskRef, id: taskId });

        destTasks.forEach((task, index) => {
          if (task.id === taskId) {
            transaction.update(taskRef, { status: newStatus, columnIndex: index, updatedAt: FieldValue.serverTimestamp() });
          } else {
            transaction.update(task.ref, { columnIndex: index });
          }
        });
      });

      const taskDoc = await db.collection("tasks").doc(taskId).get();
      const taskTitle = taskDoc.exists ? taskDoc.data().title : "Unknown";
      await createLog(boardId, decodedToken.uid, "task_moved",
        `Task "${taskTitle}" moved to "${newStatus}" at position ${targetIndex}.`, taskId);

      logger.info("Task Status Changed", { boardId, taskId, newStatus, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task moved successfully." });
    } catch (error) {
      logger.error("moveTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const deleteTask = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed. Use DELETE." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId } = req.body;

      requireFields(req.body, ["taskId", "boardId"]);
      await checkMembership(decodedToken.uid, boardId);

      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) return res.status(404).json({ error: "Task not found." });
      if (taskDoc.data().boardId !== boardId) return res.status(403).json({ error: "Task does not belong to this board." });

      const taskData = taskDoc.data();
      const batch = db.batch();

      const attachmentsSnapshot = await db.collection("attachments").where("taskId", "==", taskId).get();
      attachmentsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(db.collection("tasks").doc(taskId));
      await batch.commit();

      const remainingTasks = await db.collection("tasks")
        .where("boardId", "==", boardId).where("status", "==", taskData.status).orderBy("columnIndex").get();
      const reindexBatch = db.batch();
      remainingTasks.docs.forEach((doc, index) => {
        if (doc.data().columnIndex !== index) reindexBatch.update(doc.ref, { columnIndex: index });
      });
      await reindexBatch.commit();

      try {
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `boards/${boardId}/tasks/${taskId}/` });
      } catch (storageError) {
        logger.warn("Storage cleanup warning", { boardId, taskId, error: storageError.message });
      }

      await createLog(boardId, decodedToken.uid, "task_deleted",
        `Task "${taskData.title}" was deleted from "${taskData.status}".`, taskId);

      logger.info("Task deleted", { boardId, taskId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task deleted successfully." });
    } catch (error) {
      logger.error("deleteTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const assignTask = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed. Use PATCH." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId, assignedTo } = req.body;

      requireFields(req.body, ["taskId", "boardId"]);
      await checkMembership(decodedToken.uid, boardId);

      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) return res.status(404).json({ error: "Task not found." });
      if (taskDoc.data().boardId !== boardId) return res.status(403).json({ error: "Task does not belong to this board." });

      if (assignedTo !== null && assignedTo !== undefined) {
        const assigneeDoc = await db.collection("boardMembers").doc(`${assignedTo}_${boardId}`).get();
        if (!assigneeDoc.exists) return res.status(400).json({ error: "Assigned user is not a member of this board." });
      }

      await db.collection("tasks").doc(taskId).update({
        assignedTo: assignedTo || null, updatedAt: FieldValue.serverTimestamp(),
      });

      const action = assignedTo ? "task_assigned" : "task_unassigned";
      const details = assignedTo
        ? `Task "${taskDoc.data().title}" was assigned to a member.`
        : `Task "${taskDoc.data().title}" was unassigned.`;

      await createLog(boardId, decodedToken.uid, action, details, taskId);

      logger.info("Task assignment updated", { boardId, taskId, assignedTo, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task assignment updated." });
    } catch (error) {
      logger.error("assignTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = { createTask, getTasksByBoard, updateTask, moveTask, deleteTask, assignTask };
