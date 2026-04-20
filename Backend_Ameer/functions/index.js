/**
 * LockinTogether — Cloud Functions Entry Point
 *
 * This file exports all HTTP functions and Firestore triggers.
 * Firebase reads this file to register available Cloud Functions.
 *
 * Architecture: Serverless + Event-Driven (GCP Firebase)
 * See Task 2.4 for design pattern documentation.
 */

// ── User Management (Phase 1) ──────────────────────────────
const {
  onUserCreate,
  getUserProfile,
  updateUserProfile,
  searchUserByEmail,
} = require("./handlers/users");
exports.onUserCreate = onUserCreate;
exports.getUserProfile = getUserProfile;
exports.updateUserProfile = updateUserProfile;
exports.searchUserByEmail = searchUserByEmail;

// ── Board Management (Phase 2) ─────────────────────────────
const {
  createBoard,
  getBoards,
  getBoardById,
  updateBoard,
  deleteBoard,
  addBoardMember,
  removeBoardMember,
  updateMemberRole,
  acceptBoardInvite,
} = require("./handlers/boards");
exports.createBoard = createBoard;
exports.getBoards = getBoards;
exports.getBoardById = getBoardById;
exports.updateBoard = updateBoard;
exports.deleteBoard = deleteBoard;
exports.addBoardMember = addBoardMember;
exports.removeBoardMember = removeBoardMember;
exports.updateMemberRole = updateMemberRole;
exports.acceptBoardInvite = acceptBoardInvite;

// ── Task Management (Phase 3) ──────────────────────────────
const {
  createTask,
  getTasksByBoard,
  updateTask,
  moveTask,
  deleteTask,
  assignTask,
  getUserStats,
} = require("./handlers/tasks");
exports.createTask = createTask;
exports.getTasksByBoard = getTasksByBoard;
exports.updateTask = updateTask;
exports.moveTask = moveTask;
exports.deleteTask = deleteTask;
exports.assignTask = assignTask;
exports.getUserStats = getUserStats;

// ── File Attachments (Phase 4) ─────────────────────────────
const {
  uploadAttachment,
  getAttachmentsByTask,
  deleteAttachment,
} = require("./handlers/attachments");
exports.uploadAttachment = uploadAttachment;
exports.getAttachmentsByTask = getAttachmentsByTask;
exports.deleteAttachment = deleteAttachment;

// ── Activity Log Query (Phase 5) ────────────────────────────
const { getActivityLog } = require("./handlers/activityLog");
exports.getActivityLog = getActivityLog;

// ── Firestore Triggers (Event-Driven) ──────────────────────
const { onTaskWrite } = require("./triggers/onTaskChange");
exports.onTaskWrite = onTaskWrite;
