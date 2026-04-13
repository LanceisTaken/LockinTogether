const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { createLog } = require("./activityLog");
const { checkMembership } = require("./boards");
const { requireFields, validateString } = require("../utils/validators");
const { startTimer, logRequest, logSuccess, logError, logWarn } = require("../utils/monitoring");

const REGION = "asia-southeast1";

const TASK_OPTIONS = { region: REGION, maxInstances: 5, concurrency: 40 };
const MOVE_OPTIONS  = { region: REGION, maxInstances: 5, concurrency: 40 };

// ============================================================
// Phase 3: Task Management (Core Feature)
// UC-03, UC-04, UC-05, UC-06, UC-10
// ============================================================

const createTask = onRequest(TASK_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    const t = startTimer();
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, title, description, status, deadline, assignedTo, coEditors, color } = req.body;
      logRequest("createTask", decodedToken.uid, { boardId });

      requireFields(req.body, ["boardId", "title"]);
      validateString(title, "title", 200);
      if (description !== undefined) validateString(description, "description", 2000);

      await checkMembership(decodedToken.uid, boardId);

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (!boardDoc.exists) return res.status(404).json({ error: "Board not found." });

      const boardColumns = boardDoc.data().columns;
      const taskStatus = status || boardColumns[0]; // Default to first column (e.g. "To-Do")
      if (!boardColumns.includes(taskStatus)) {
        return res.status(400).json({
          error: `Invalid column "${taskStatus}". Available columns: ${boardColumns.join(", ")}`,
        });
      }

      if (assignedTo) {
        const assigneeDoc = await db.collection("boardMembers").doc(`${assignedTo}_${boardId}`).get();
        if (!assigneeDoc.exists) {
          return res.status(400).json({ error: "Assigned user is not a member of this board." });
        }
      }

      // Validate coEditors are board members
      const validCoEditors = [];
      if (coEditors && Array.isArray(coEditors)) {
        for (const editorId of coEditors) {
          const editorDoc = await db.collection("boardMembers").doc(`${editorId}_${boardId}`).get();
          if (editorDoc.exists) validCoEditors.push(editorId);
        }
      }

      const existingTasks = await db.collection("tasks")
        .where("boardId", "==", boardId).where("status", "==", taskStatus)
        .orderBy("columnIndex", "desc").limit(1).get();

      const nextIndex = existingTasks.empty ? 0 : existingTasks.docs[0].data().columnIndex + 1;

      const taskData = {
        boardId, createdBy: decodedToken.uid, assignedTo: assignedTo || null,
        coEditors: validCoEditors,
        title: title.trim(), description: description ? description.trim() : "",
        status: taskStatus, columnIndex: nextIndex,
        deadline: deadline ? new Date(deadline) : null,
        color: color || "cyan",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };

      const taskRef = await db.collection("tasks").add(taskData);

      await createLog(boardId, decodedToken.uid, "task_created",
        `Task "${title.trim()}" was created in "${status}".`, taskRef.id);

      logSuccess("createTask", t, { boardId, taskId: taskRef.id, userId: decodedToken.uid, status });

      return res.status(201).json({ message: "Task created successfully.", task: { taskId: taskRef.id, ...taskData } });
    } catch (error) {
      logError("createTask", error, { boardId: req.body?.boardId });
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

const updateTask = onRequest(TASK_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    const t = startTimer();
    try {
      if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed. Use PATCH." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId, title, description, deadline, assignedTo, coEditors, color } = req.body;
      logRequest("updateTask", decodedToken.uid, { boardId, taskId });

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

      if (coEditors !== undefined) {
        if (!Array.isArray(coEditors)) return res.status(400).json({ error: "coEditors must be an array." });
        const validCoEditors = [];
        for (const editorId of coEditors) {
          const editorDoc = await db.collection("boardMembers").doc(`${editorId}_${boardId}`).get();
          if (editorDoc.exists) validCoEditors.push(editorId);
        }
        updates.coEditors = validCoEditors;
      }

      if (color !== undefined) {
        const validColors = ["cyan", "amber", "emerald", "fuchsia", "blue", "rose"];
        if (validColors.includes(color)) updates.color = color;
      }

      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update." });

      updates.updatedAt = FieldValue.serverTimestamp();
      await db.collection("tasks").doc(taskId).update(updates);
      await createLog(boardId, decodedToken.uid, "task_edited", `Task "${taskDoc.data().title}" was updated.`, taskId);

      logSuccess("updateTask", t, { boardId, taskId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task updated successfully." });
    } catch (error) {
      logError("updateTask", error, { boardId: req.body?.boardId, taskId: req.body?.taskId });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const moveTask = onRequest(MOVE_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    const t = startTimer();
    try {
      if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed. Use PATCH." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId, newStatus, newColumnIndex } = req.body;
      logRequest("moveTask", decodedToken.uid, { boardId, taskId, newStatus });

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

      logSuccess("moveTask", t, { boardId, taskId, newStatus, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task moved successfully." });
    } catch (error) {
      logError("moveTask", error, { boardId: req.body?.boardId, taskId: req.body?.taskId });
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
        logWarn("deleteTask", "Storage cleanup failed", { boardId, taskId, error: storageError.message });
      }

      await createLog(boardId, decodedToken.uid, "task_deleted",
        `Task "${taskData.title}" was deleted from "${taskData.status}".`, taskId);

      logger.info("Task deleted", { boardId, taskId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Task deleted successfully." });
    } catch (error) {
      logError("deleteTask", error, { boardId: req.body?.boardId, taskId: req.body?.taskId });
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

const getUserStats = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed. Use GET." });

      const decodedToken = await verifyAuth(req);
      const uid = decodedToken.uid;

      // Find all boards the user is a member of
      const membershipSnapshot = await db.collection("boardMembers")
        .where("userId", "==", uid).get();

      if (membershipSnapshot.empty) {
        return res.status(200).json({
          totalCompleted: 0, completedOnTime: 0, completedLate: 0,
          inProgress: 0, completionRate: 0, recentCompleted: [], boardBreakdown: [],
        });
      }

      const boardIds = membershipSnapshot.docs.map((doc) => doc.data().boardId);

      // Fetch all board documents to know their columns
      const boardDocs = {};
      for (const boardId of boardIds) {
        const boardDoc = await db.collection("boards").doc(boardId).get();
        if (boardDoc.exists) {
          boardDocs[boardId] = boardDoc.data();
        }
      }

      // Query tasks where user is assignedTo or createdBy across all boards
      const [assignedSnapshot, createdSnapshot] = await Promise.all([
        db.collection("tasks").where("assignedTo", "==", uid).get(),
        db.collection("tasks").where("createdBy", "==", uid).get(),
      ]);

      // Merge and deduplicate tasks
      const taskMap = new Map();
      const addTasks = (snapshot) => {
        snapshot.docs.forEach((doc) => {
          if (!taskMap.has(doc.id) && boardDocs[doc.data().boardId]) {
            taskMap.set(doc.id, { taskId: doc.id, ...doc.data() });
          }
        });
      };
      addTasks(assignedSnapshot);
      addTasks(createdSnapshot);

      const allTasks = Array.from(taskMap.values());

      let totalCompleted = 0;
      let completedOnTime = 0;
      let completedLate = 0;
      let inProgress = 0;
      const completedTasks = [];
      const boardStatsMap = {};

      for (const task of allTasks) {
        const board = boardDocs[task.boardId];
        const columns = board.columns;
        const doneStatus = columns[columns.length - 1];
        const isCompleted = task.status === doneStatus;

        // Initialize board breakdown entry
        if (!boardStatsMap[task.boardId]) {
          boardStatsMap[task.boardId] = {
            boardId: task.boardId,
            boardTitle: board.title || board.name || task.boardId,
            total: 0, completed: 0, inProgress: 0,
          };
        }
        boardStatsMap[task.boardId].total += 1;

        if (isCompleted) {
          totalCompleted += 1;
          boardStatsMap[task.boardId].completed += 1;

          const hasDeadline = task.deadline != null;
          let onTime = true;

          if (hasDeadline && task.updatedAt) {
            const updatedAtMs = task.updatedAt.toMillis();
            const deadlineMs = task.deadline.toMillis();
            onTime = updatedAtMs <= deadlineMs;
          }

          if (onTime) {
            completedOnTime += 1;
          } else {
            completedLate += 1;
          }

          completedTasks.push({
            taskId: task.taskId,
            title: task.title,
            boardId: task.boardId,
            boardTitle: board.title || board.name || task.boardId,
            deadline: task.deadline ? task.deadline.toDate().toISOString() : null,
            updatedAt: task.updatedAt ? task.updatedAt.toDate().toISOString() : null,
            completedOnTime: onTime,
          });
        } else {
          inProgress += 1;
          boardStatsMap[task.boardId].inProgress += 1;
        }
      }

      // Completion rate: percentage of completed tasks with deadlines that were on time
      const completedWithDeadline = completedTasks.filter((t) => t.deadline != null).length;
      const onTimeWithDeadline = completedTasks.filter((t) => t.deadline != null && t.completedOnTime).length;
      const completionRate = completedWithDeadline > 0
        ? Math.round((onTimeWithDeadline / completedWithDeadline) * 100)
        : 100;

      // Recent completed: last 10 sorted by updatedAt descending
      const recentCompleted = completedTasks
        .sort((a, b) => {
          const aMs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bMs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bMs - aMs;
        })
        .slice(0, 10);

      const boardBreakdown = Object.values(boardStatsMap);

      logger.info("getUserStats", { userId: uid, totalCompleted, inProgress });

      return res.status(200).json({
        totalCompleted, completedOnTime, completedLate,
        inProgress, completionRate, recentCompleted, boardBreakdown,
      });
    } catch (error) {
      logger.error("getUserStats error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = { createTask, getTasksByBoard, updateTask, moveTask, deleteTask, assignTask, getUserStats };
