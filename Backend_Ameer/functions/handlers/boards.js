const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { createLog } = require("./activityLog");
const { requireFields, validateString, validateColumns } = require("../utils/validators");

const REGION = "asia-southeast1";

// ============================================================
// Phase 2: Board Management
// Maps to UC-02 (Create Board) and UC-09 (Manage User Access).
// ============================================================

async function checkMembership(userId, boardId, allowedRoles = null) {
  const memberDocId = `${userId}_${boardId}`;
  const memberDoc = await db.collection("boardMembers").doc(memberDocId).get();

  if (!memberDoc.exists) {
    throw Object.assign(
      new Error("You are not a member of this board."),
      { code: 403 }
    );
  }

  const memberData = memberDoc.data();

  if (allowedRoles && !allowedRoles.includes(memberData.role)) {
    throw Object.assign(
      new Error(`This action requires one of these roles: ${allowedRoles.join(", ")}`),
      { code: 403 }
    );
  }

  return memberData;
}

const createBoard = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { title, description, columns } = req.body;

      requireFields(req.body, ["title"]);
      validateString(title, "title", 200);

      const boardColumns = columns || ["To-Do", "In-Progress", "Done"];
      validateColumns(boardColumns);

      if (description !== undefined) {
        validateString(description, "description", 1000);
      }

      const boardData = {
        ownerId: decodedToken.uid,
        title: title.trim(),
        description: description ? description.trim() : "",
        columns: boardColumns.map((col) => col.trim()),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const boardRef = await db.collection("boards").add(boardData);

      const memberDocId = `${decodedToken.uid}_${boardRef.id}`;
      await db.collection("boardMembers").doc(memberDocId).set({
        memberId: memberDocId,
        boardId: boardRef.id,
        userId: decodedToken.uid,
        role: "owner",
        joinedAt: FieldValue.serverTimestamp(),
      });

      await createLog(boardRef.id, decodedToken.uid, "board_created",
        `Board "${title.trim()}" was created.`);

      logger.info("Board created", { boardId: boardRef.id, userId: decodedToken.uid });

      return res.status(201).json({
        message: "Board created successfully.",
        board: { boardId: boardRef.id, ...boardData },
      });
    } catch (error) {
      logger.error("createBoard error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const getBoards = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed. Use GET." });
      }

      const decodedToken = await verifyAuth(req);

      const membershipsSnapshot = await db.collection("boardMembers")
        .where("userId", "==", decodedToken.uid).get();

      if (membershipsSnapshot.empty) {
        return res.status(200).json({ boards: [] });
      }

      const boards = [];
      for (const memberDoc of membershipsSnapshot.docs) {
        const membership = memberDoc.data();
        const boardDoc = await db.collection("boards").doc(membership.boardId).get();
        if (boardDoc.exists) {
          const countSnap = await db.collection("boardMembers")
            .where("boardId", "==", membership.boardId).count().get();
          boards.push({
            boardId: boardDoc.id,
            ...boardDoc.data(),
            userRole: membership.role,
            memberCount: countSnap.data().count,
          });
        }
      }

      return res.status(200).json({ boards });
    } catch (error) {
      logger.error("getBoards error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const getBoardById = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed. Use GET." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId } = req.query;

      if (!boardId) {
        return res.status(400).json({ error: "boardId query parameter is required." });
      }

      await checkMembership(decodedToken.uid, boardId);

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (!boardDoc.exists) {
        return res.status(404).json({ error: "Board not found." });
      }

      const membersSnapshot = await db.collection("boardMembers")
        .where("boardId", "==", boardId).get();

      const members = [];
      for (const memberDoc of membersSnapshot.docs) {
        const memberData = memberDoc.data();
        const userDoc = await db.collection("users").doc(memberData.userId).get();
        members.push({
          memberId: memberData.memberId, userId: memberData.userId,
          role: memberData.role, joinedAt: memberData.joinedAt,
          displayName: userDoc.exists ? userDoc.data().displayName : "Unknown",
          email: userDoc.exists ? userDoc.data().email : "",
          photoURL: userDoc.exists ? userDoc.data().photoURL : null,
        });
      }

      return res.status(200).json({ board: { boardId: boardDoc.id, ...boardDoc.data() }, members });
    } catch (error) {
      logger.error("getBoardById error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const updateBoard = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") {
        return res.status(405).json({ error: "Method not allowed. Use PATCH." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, title, description, columns } = req.body;

      requireFields(req.body, ["boardId"]);
      await checkMembership(decodedToken.uid, boardId, ["owner", "admin"]);

      const updates = {};
      if (title !== undefined) { validateString(title, "title", 200); updates.title = title.trim(); }
      if (description !== undefined) { validateString(description, "description", 1000); updates.description = description.trim(); }

      if (columns !== undefined) {
        validateColumns(columns);
        const boardDoc = await db.collection("boards").doc(boardId).get();
        const existingColumns = boardDoc.data().columns;
        const removedColumns = existingColumns.filter(
          (col) => !columns.map((c) => c.trim().toLowerCase()).includes(col.trim().toLowerCase()));

        if (removedColumns.length > 0) {
          const tasksInRemoved = await db.collection("tasks")
            .where("boardId", "==", boardId).where("status", "in", removedColumns).limit(1).get();
          if (!tasksInRemoved.empty) {
            return res.status(400).json({
              error: `Cannot remove columns that contain tasks: ${removedColumns.join(", ")}`,
            });
          }
        }
        updates.columns = columns.map((col) => col.trim());
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update." });
      }

      updates.updatedAt = FieldValue.serverTimestamp();
      await db.collection("boards").doc(boardId).update(updates);
      await createLog(boardId, decodedToken.uid, "board_updated", "Board settings were updated.");

      logger.info("Board updated", { boardId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Board updated successfully." });
    } catch (error) {
      logger.error("updateBoard error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const deleteBoard = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "DELETE") {
        return res.status(405).json({ error: "Method not allowed. Use DELETE." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId } = req.body;

      requireFields(req.body, ["boardId"]);
      await checkMembership(decodedToken.uid, boardId, ["owner"]);

      const batch = db.batch();
      const collections = ["boardMembers", "tasks", "attachments", "activityLog"];

      for (const col of collections) {
        const snapshot = await db.collection(col).where("boardId", "==", boardId).get();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      }
      batch.delete(db.collection("boards").doc(boardId));
      await batch.commit();

      try {
        const bucket = admin.storage().bucket();
        await bucket.deleteFiles({ prefix: `boards/${boardId}/` });
      } catch (storageError) {
        logger.warn("Storage cleanup warning", { boardId, error: storageError.message });
      }

      logger.info("Board deleted", { boardId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Board and all data deleted." });
    } catch (error) {
      logger.error("deleteBoard error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const addBoardMember = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, email, role } = req.body;

      requireFields(req.body, ["boardId", "email"]);
      await checkMembership(decodedToken.uid, boardId, ["owner", "admin"]);

      const memberRole = role || "member";
      if (!["member", "admin"].includes(memberRole)) {
        return res.status(400).json({ error: "Role must be 'member' or 'admin'." });
      }

      const usersSnapshot = await db.collection("users")
        .where("email", "==", email.trim().toLowerCase()).limit(1).get();

      if (usersSnapshot.empty) {
        return res.status(404).json({ error: "No registered user found with that email." });
      }

      const targetUser = usersSnapshot.docs[0].data();
      const targetUserId = targetUser.userId;
      const memberDocId = `${targetUserId}_${boardId}`;
      const existingMember = await db.collection("boardMembers").doc(memberDocId).get();

      if (existingMember.exists) {
        return res.status(409).json({ error: "This user is already a member of the board." });
      }

      await db.collection("boardMembers").doc(memberDocId).set({
        memberId: memberDocId, boardId, userId: targetUserId,
        role: memberRole, joinedAt: FieldValue.serverTimestamp(),
      });

      await createLog(boardId, decodedToken.uid, "member_added",
        `${targetUser.displayName} (${email}) was added as ${memberRole}.`);

      logger.info("Board member added", { boardId, userId: targetUserId, role: memberRole });

      return res.status(201).json({
        message: `${targetUser.displayName} added to the board as ${memberRole}.`,
        member: { userId: targetUserId, displayName: targetUser.displayName,
          email: targetUser.email, role: memberRole },
      });
    } catch (error) {
      logger.error("addBoardMember error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const removeBoardMember = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "DELETE") {
        return res.status(405).json({ error: "Method not allowed. Use DELETE." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, userId } = req.body;

      requireFields(req.body, ["boardId", "userId"]);
      const requesterMembership = await checkMembership(decodedToken.uid, boardId, ["owner", "admin"]);

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (boardDoc.data().ownerId === userId) {
        return res.status(400).json({ error: "The board owner cannot be removed." });
      }

      const targetMemberDocId = `${userId}_${boardId}`;
      const targetMemberDoc = await db.collection("boardMembers").doc(targetMemberDocId).get();

      if (!targetMemberDoc.exists) {
        return res.status(404).json({ error: "Member not found on this board." });
      }

      if (targetMemberDoc.data().role === "admin" && requesterMembership.role !== "owner") {
        return res.status(403).json({ error: "Only the board owner can remove admins." });
      }

      const assignedTasks = await db.collection("tasks")
        .where("boardId", "==", boardId).where("assignedTo", "==", userId).get();

      const batch = db.batch();
      assignedTasks.docs.forEach((doc) => batch.update(doc.ref, { assignedTo: null }));
      batch.delete(db.collection("boardMembers").doc(targetMemberDocId));
      await batch.commit();

      await createLog(boardId, decodedToken.uid, "member_removed", "A member was removed from the board.");

      logger.info("Board member removed", { boardId, removedUserId: userId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Member removed from the board." });
    } catch (error) {
      logger.error("removeBoardMember error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const updateMemberRole = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "PATCH") {
        return res.status(405).json({ error: "Method not allowed. Use PATCH." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, userId, role } = req.body;

      requireFields(req.body, ["boardId", "userId", "role"]);
      await checkMembership(decodedToken.uid, boardId, ["owner"]);

      if (!["member", "admin"].includes(role)) {
        return res.status(400).json({ error: "Role must be 'member' or 'admin'." });
      }
      if (userId === decodedToken.uid) {
        return res.status(400).json({ error: "You cannot change your own role." });
      }

      const targetMemberDocId = `${userId}_${boardId}`;
      const targetMemberDoc = await db.collection("boardMembers").doc(targetMemberDocId).get();
      if (!targetMemberDoc.exists) {
        return res.status(404).json({ error: "Member not found on this board." });
      }

      await db.collection("boardMembers").doc(targetMemberDocId).update({ role });
      await createLog(boardId, decodedToken.uid, "role_changed", `Member role changed to ${role}.`);

      logger.info("Member role updated", { boardId, targetUserId: userId, newRole: role });

      return res.status(200).json({ message: `Member role updated to ${role}.` });
    } catch (error) {
      logger.error("updateMemberRole error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const acceptBoardInvite = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { notificationId } = req.body;

      requireFields(req.body, ["notificationId"]);

      const notifRef = db.collection("notifications").doc(notificationId);
      const notifDoc = await notifRef.get();

      if (!notifDoc.exists) {
        return res.status(404).json({ error: "Notification not found." });
      }

      const notif = notifDoc.data();

      if (notif.recipientId !== decodedToken.uid) {
        return res.status(403).json({ error: "This invite is not addressed to you." });
      }

      if (notif.type !== "board_invite") {
        return res.status(400).json({ error: "This notification is not a board invite." });
      }

      if (notif.read) {
        return res.status(400).json({ error: "This invite has already been handled." });
      }

      const boardId = notif.boardId;
      const inviteRole = notif.inviteRole || "member";

      if (!["member", "admin"].includes(inviteRole)) {
        return res.status(400).json({ error: "Invalid role on invite." });
      }

      const boardDoc = await db.collection("boards").doc(boardId).get();
      if (!boardDoc.exists) {
        return res.status(404).json({ error: "The board no longer exists." });
      }

      const memberDocId = `${decodedToken.uid}_${boardId}`;
      const existingMember = await db.collection("boardMembers").doc(memberDocId).get();

      if (!existingMember.exists) {
        await db.collection("boardMembers").doc(memberDocId).set({
          memberId: memberDocId,
          boardId,
          userId: decodedToken.uid,
          role: inviteRole,
          joinedAt: FieldValue.serverTimestamp(),
        });
      }

      await notifRef.update({ read: true });

      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const displayName = userDoc.exists ? userDoc.data().displayName : "A user";

      await createLog(boardId, decodedToken.uid, "member_added",
        `${displayName} accepted the invite as ${inviteRole}.`);

      logger.info("Board invite accepted", {
        boardId, userId: decodedToken.uid, role: inviteRole,
      });

      return res.status(200).json({
        message: `You joined the board as ${inviteRole}.`,
        boardId,
        role: inviteRole,
      });
    } catch (error) {
      logger.error("acceptBoardInvite error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const leaveBoard = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId } = req.body;
      requireFields(req.body, ["boardId"]);

      const memberDocId = `${decodedToken.uid}_${boardId}`;
      const memberDoc = await db.collection("boardMembers").doc(memberDocId).get();

      if (!memberDoc.exists) {
        return res.status(404).json({ error: "You are not a member of this board." });
      }

      if (memberDoc.data().role === "owner") {
        return res.status(400).json({
          error: "Owners cannot leave. Transfer ownership or delete the board instead.",
        });
      }

      // Null out assignedTo on tasks where this user is the assignee
      const assignedTasks = await db.collection("tasks")
        .where("boardId", "==", boardId)
        .where("assignedTo", "==", decodedToken.uid).get();

      const batch = db.batch();
      assignedTasks.docs.forEach((doc) => batch.update(doc.ref, { assignedTo: null }));
      batch.delete(db.collection("boardMembers").doc(memberDocId));
      await batch.commit();

      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const displayName = userDoc.exists ? userDoc.data().displayName : "A member";
      await createLog(boardId, decodedToken.uid, "member_left",
        `${displayName} left the board.`);

      logger.info("Member left board", { boardId, userId: decodedToken.uid });

      return res.status(200).json({ message: "You left the board." });
    } catch (error) {
      logger.error("leaveBoard error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const transferOwnership = onRequest({ region: REGION }, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
      }

      const decodedToken = await verifyAuth(req);
      const { boardId, newOwnerId } = req.body;
      requireFields(req.body, ["boardId", "newOwnerId"]);

      if (newOwnerId === decodedToken.uid) {
        return res.status(400).json({ error: "You are already the owner." });
      }

      await checkMembership(decodedToken.uid, boardId, ["owner"]);

      const targetMemberDocId = `${newOwnerId}_${boardId}`;
      const targetMemberDoc = await db.collection("boardMembers").doc(targetMemberDocId).get();
      if (!targetMemberDoc.exists) {
        return res.status(404).json({ error: "Target user is not a member of this board." });
      }

      const currentOwnerDocId = `${decodedToken.uid}_${boardId}`;

      const batch = db.batch();
      batch.update(db.collection("boards").doc(boardId), { ownerId: newOwnerId });
      batch.update(db.collection("boardMembers").doc(targetMemberDocId), { role: "owner" });
      batch.update(db.collection("boardMembers").doc(currentOwnerDocId), { role: "admin" });
      await batch.commit();

      const targetUserDoc = await db.collection("users").doc(newOwnerId).get();
      const newOwnerName = targetUserDoc.exists ? targetUserDoc.data().displayName : "a member";
      await createLog(boardId, decodedToken.uid, "ownership_transferred",
        `Ownership was transferred to ${newOwnerName}.`);

      logger.info("Ownership transferred", {
        boardId, from: decodedToken.uid, to: newOwnerId,
      });

      return res.status(200).json({ message: `Ownership transferred to ${newOwnerName}.` });
    } catch (error) {
      logger.error("transferOwnership error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = {
  createBoard, getBoards, getBoardById, updateBoard, deleteBoard,
  addBoardMember, removeBoardMember, updateMemberRole, acceptBoardInvite,
  leaveBoard, transferOwnership, checkMembership,
};
