const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const cors = require("cors")({ origin: true });
const { db, admin, storage, FieldValue } = require("../config/firebase");
const { verifyAuth } = require("../middleware/auth");
const { checkMembership } = require("./boards");
const { createLog } = require("./activityLog");
const { requireFields, validateFile } = require("../utils/validators");
const { startTimer, logRequest, logSuccess, logError, logWarn } = require("../utils/monitoring");
const Busboy = require("busboy");

const REGION = "asia-southeast1";

const UPLOAD_OPTIONS = { region: REGION, maxInstances: 3, memory: "512MiB", timeoutSeconds: 120, concurrency: 10 };
const ATTACH_OPTIONS = { region: REGION, maxInstances: 3, concurrency: 40 };

// File Attachment System

const uploadAttachment = onRequest(UPLOAD_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    const t = startTimer();
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

      const decodedToken = await verifyAuth(req);
      const busboy = Busboy({ headers: req.headers });
      const fields = {};
      let fileData = null;

      busboy.on("field", (fieldName, value) => { fields[fieldName] = value; });

      const filePromise = new Promise((resolve, reject) => {
        busboy.on("file", (fieldName, fileStream, info) => {
          const { filename, mimeType } = info;
          const chunks = [];
          let fileSize = 0;

          fileStream.on("data", (chunk) => {
            fileSize += chunk.length;
            if (fileSize > 10 * 1024 * 1024) { fileStream.destroy(); reject(Object.assign(new Error("File size exceeds the 10MB limit."), { code: 400 })); return; }
            chunks.push(chunk);
          });
          fileStream.on("end", () => { fileData = { buffer: Buffer.concat(chunks), fileName: filename, mimeType, fileSize }; resolve(); });
          fileStream.on("error", reject);
        });
        busboy.on("finish", () => { if (!fileData) reject(Object.assign(new Error("No file was uploaded."), { code: 400 })); });
        busboy.on("error", reject);
      });

      busboy.end(req.rawBody);
      await filePromise;

      const { boardId, taskId } = fields;
      if (!boardId || !taskId) return res.status(400).json({ error: "boardId and taskId fields are required." });

      await checkMembership(decodedToken.uid, boardId);

      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) return res.status(404).json({ error: "Task not found." });
      if (taskDoc.data().boardId !== boardId) return res.status(403).json({ error: "Task does not belong to this board." });

      validateFile(fileData.fileSize, fileData.mimeType);

      const timestamp = Date.now();
      const sanitizedName = fileData.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `boards/${boardId}/tasks/${taskId}/${timestamp}_${sanitizedName}`;

      const bucket = storage.bucket();
      const file = bucket.file(storagePath);
      await file.save(fileData.buffer, { metadata: { contentType: fileData.mimeType, metadata: { uploadedBy: decodedToken.uid, boardId, taskId } } });
      await file.makePublic();
      const storageURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      const attachmentData = {
        taskId, boardId, uploadedBy: decodedToken.uid, fileName: fileData.fileName,
        fileType: fileData.mimeType, fileSize: fileData.fileSize, storagePath, storageURL,
        createdAt: FieldValue.serverTimestamp(),
      };
      const attachmentRef = await db.collection("attachments").add(attachmentData);

      await createLog(boardId, decodedToken.uid, "file_uploaded",
        `File "${fileData.fileName}" attached to task "${taskDoc.data().title}".`, taskId);

      logSuccess("uploadAttachment", t, { boardId, taskId, fileName: fileData.fileName, fileSize: fileData.fileSize, userId: decodedToken.uid });

      return res.status(201).json({ message: "File uploaded successfully.", attachment: { attachmentId: attachmentRef.id, ...attachmentData } });
    } catch (error) {
      logError("uploadAttachment", error, { boardId: fields?.boardId, taskId: fields?.taskId });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const getAttachmentsByTask = onRequest(ATTACH_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed. Use GET." });

      const decodedToken = await verifyAuth(req);
      const { taskId, boardId } = req.query;
      if (!taskId || !boardId) return res.status(400).json({ error: "taskId and boardId query parameters are required." });

      await checkMembership(decodedToken.uid, boardId);

      const attachmentsSnapshot = await db.collection("attachments")
        .where("taskId", "==", taskId).orderBy("createdAt", "desc").get();

      const attachments = attachmentsSnapshot.docs.map((doc) => ({ attachmentId: doc.id, ...doc.data() }));
      return res.status(200).json({ attachments });
    } catch (error) {
      logger.error("getAttachmentsByTask error", { error: error.message });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

const deleteAttachment = onRequest(ATTACH_OPTIONS, (req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed. Use DELETE." });

      const decodedToken = await verifyAuth(req);
      const { attachmentId, boardId } = req.body;
      requireFields(req.body, ["attachmentId", "boardId"]);

      const membership = await checkMembership(decodedToken.uid, boardId);
      const attachmentDoc = await db.collection("attachments").doc(attachmentId).get();
      if (!attachmentDoc.exists) return res.status(404).json({ error: "Attachment not found." });

      const attachmentData = attachmentDoc.data();
      if (attachmentData.boardId !== boardId) return res.status(403).json({ error: "Attachment does not belong to this board." });

      const isUploader = attachmentData.uploadedBy === decodedToken.uid;
      const isAdminOrOwner = ["owner", "admin"].includes(membership.role);
      if (!isUploader && !isAdminOrOwner) return res.status(403).json({ error: "Only the uploader or a board admin can delete attachments." });

      try {
        const bucket = storage.bucket();
        await bucket.file(attachmentData.storagePath).delete();
      } catch (storageError) {
        logWarn("deleteAttachment", "Storage delete failed", { boardId, error: storageError.message });
      }

      await db.collection("attachments").doc(attachmentId).delete();
      await createLog(boardId, decodedToken.uid, "file_deleted", `File "${attachmentData.fileName}" was deleted.`, attachmentData.taskId);

      logger.info("File deleted", { boardId, attachmentId, userId: decodedToken.uid });

      return res.status(200).json({ message: "Attachment deleted successfully." });
    } catch (error) {
      logError("deleteAttachment", error, { boardId: req.body?.boardId });
      return res.status(error.code || 500).json({ error: error.message });
    }
  });
});

module.exports = { uploadAttachment, getAttachmentsByTask, deleteAttachment };
