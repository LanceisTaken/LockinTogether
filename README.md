# LockinTogether — Backend Documentation

**Real-Time Collaborative Task Manager**
Cloud-Based Application Development | COMP3207 | Semester 2, 2025/2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Prerequisites](#prerequisites)
4. [Project Structure](#project-structure)
5. [Local Development Setup](#local-development-setup)
6. [Deployment to Firebase](#deployment-to-firebase)
7. [API Reference](#api-reference)
8. [Security](#security)
9. [Firestore Data Schema](#firestore-data-schema)

---

## Architecture Overview

LockinTogether uses a fully **serverless, event-driven architecture** on Google Cloud Platform via Firebase. All backend logic runs as **Firebase Cloud Functions (Gen 2)**, with data stored in **Cloud Firestore** (NoSQL) and files in **Cloud Storage**.

**Design Patterns Implemented:**

- **Serverless Architecture** — Cloud Functions execute on demand, scaling automatically from zero. No servers to provision or manage.
- **Event-Driven Architecture** — Firestore document changes emit events that trigger Cloud Functions (e.g., `onTaskWrite` creates activity log entries) and push updates to connected clients.
- **MVC (Model-View-Controller)** — Firestore collections = Model, React frontend = View, Cloud Functions = Controller.
- **Observer Pattern** — Firestore `onSnapshot` listeners notify all connected clients when data changes, enabling real-time collaboration.

**Data Flow:**
1. Frontend sends HTTP request with Firebase Auth token → Cloud Function
2. Cloud Function verifies token, validates input, writes to Firestore
3. Firestore emits change event → triggers `onTaskWrite` for activity logging
4. Firestore `onSnapshot` listeners on all connected clients receive the update
5. Each client re-renders the UI in real time

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend Logic | Firebase Cloud Functions (Gen 2, Node.js) | Serverless API endpoints |
| Database | Google Cloud Firestore (NoSQL) | Real-time document database |
| File Storage | Google Cloud Storage | Attachment uploads |
| Authentication | Firebase Authentication | Email/password + Google OAuth |
| Hosting | Firebase Hosting | Static React frontend |
| Region | `asia-southeast1` (Singapore) | Low latency for target users |

---

## Prerequisites

Before deploying, ensure you have the following installed:

- **Node.js** v18 or later — [https://nodejs.org](https://nodejs.org)
- **Firebase CLI** — Install with: `npm install -g firebase-tools`
- **A Firebase project** — Create one at [https://console.firebase.google.com](https://console.firebase.google.com)

**Firebase project setup (one-time):**

1. Go to Firebase Console → Create a new project (or use an existing one)
2. Enable **Authentication** → Sign-in providers → Enable Email/Password and Google
3. Enable **Cloud Firestore** → Create database → Select `asia-southeast1` region → Start in production mode
4. Enable **Cloud Storage** → Create default bucket → Select `asia-southeast1`

---

## Project Structure

```
lockin-together/
├── firebase.json                 # Firebase configuration
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Composite indexes for queries
├── storage.rules                 # Cloud Storage security rules
├── test-backend.sh               # Automated test script
│
└── functions/
    ├── package.json              # Dependencies
    ├── index.js                  # Cloud Functions entry point (exports all functions)
    ├── .eslintrc.js              # Linting configuration
    │
    ├── config/
    │   └── firebase.js           # Firebase Admin SDK initialization
    │
    ├── middleware/
    │   └── auth.js               # JWT token verification middleware
    │
    ├── handlers/
    │   ├── users.js              # User profile CRUD (Phase 1)
    │   ├── boards.js             # Board CRUD + member management (Phase 2)
    │   ├── tasks.js              # Task CRUD + move/assign (Phase 3)
    │   ├── attachments.js        # File upload/delete (Phase 4)
    │   └── activityLog.js        # Activity log helper + query endpoint (Phase 5)
    │
    ├── triggers/
    │   └── onTaskChange.js       # Firestore trigger for event-driven logging
    │
    └── utils/
        └── validators.js         # Input validation utilities
```

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/lockin-together.git
cd lockin-together
```

### 2. Install dependencies

```bash
cd functions
npm install
cd ..
```

### 3. Link to your Firebase project

```bash
firebase login
firebase use --add    # Select your project, alias as "default"
```

### 4. Start the Firebase Emulator Suite

```bash
firebase emulators:start
```

This starts local emulators for Cloud Functions, Firestore, Auth, and Storage. The Emulator UI is available at `http://127.0.0.1:4000`.

### 5. Run the test suite

Open a second terminal:

```bash
bash test-backend.sh
```

This creates test users, boards, tasks, and attachments, then verifies all 23 Cloud Functions work correctly. The script automatically resets emulator data before each run.

---

## Deployment to Firebase

### 1. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

All 23 functions will be deployed to the `asia-southeast1` region. After deployment, the CLI prints the URL for each HTTP function:

```
https://asia-southeast1-YOUR_PROJECT_ID.cloudfunctions.net/createBoard
https://asia-southeast1-YOUR_PROJECT_ID.cloudfunctions.net/moveTask
... etc
```

### 2. Deploy Firestore rules and indexes

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### 3. Deploy Cloud Storage rules

```bash
firebase deploy --only storage
```

### 4. Deploy everything at once

```bash
firebase deploy
```

### 5. Verify deployment

After deploying, test a simple endpoint:

```bash
curl https://asia-southeast1-YOUR_PROJECT_ID.cloudfunctions.net/getBoards \
  -H "Authorization: Bearer YOUR_FIREBASE_AUTH_TOKEN"
```

---

## API Reference

All endpoints require a Firebase Authentication token in the `Authorization` header:

```
Authorization: Bearer <firebase_id_token>
```

The base URL for deployed functions is:
```
https://asia-southeast1-YOUR_PROJECT_ID.cloudfunctions.net
```

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| — | `onUserCreate` | Auth trigger: auto-creates user profile on signup |
| GET | `/getUserProfile` | Get own profile (or `?uid=X` for public profile) |
| PATCH | `/updateUserProfile` | Update displayName or photoURL |
| GET | `/searchUserByEmail?email=X` | Find a user by email |

**GET /getUserProfile**
```
Response: { userId, email, displayName, photoURL, role, createdAt }
```

**PATCH /updateUserProfile**
```
Body: { displayName?: string, photoURL?: string }
Response: { message, user: { ... } }
```

### Board Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/createBoard` | Create a new board |
| GET | `/getBoards` | List all boards for the authenticated user |
| GET | `/getBoardById?boardId=X` | Get board details + member list |
| PATCH | `/updateBoard` | Update board title/description/columns |
| DELETE | `/deleteBoard` | Delete board + all associated data |
| POST | `/addBoardMember` | Invite a user to a board by email |
| DELETE | `/removeBoardMember` | Remove a member from a board |
| PATCH | `/updateMemberRole` | Change a member's role |

**POST /createBoard**
```
Body: { title: string, description?: string, columns?: string[] }
Default columns: ["To-Do", "In-Progress", "Done"]
Response: { message, board: { boardId, title, ... } }
```

**POST /addBoardMember** (owner/admin only)
```
Body: { boardId: string, email: string, role?: "member"|"admin" }
Response: { message, member: { userId, displayName, email, role } }
```

**DELETE /deleteBoard** (owner only)
```
Body: { boardId: string }
Cascading delete: removes all boardMembers, tasks, attachments, activityLog, and Cloud Storage files.
```

### Task Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/createTask` | Create a new task in a column |
| GET | `/getTasksByBoard?boardId=X` | Get all tasks for a board |
| PATCH | `/updateTask` | Edit task title/description/deadline |
| PATCH | `/moveTask` | Move task between columns (transactional) |
| DELETE | `/deleteTask` | Delete a task + its attachments |
| PATCH | `/assignTask` | Assign/unassign a task to a member |

**POST /createTask**
```
Body: {
  boardId: string,
  title: string,
  description?: string,
  status: string (must match a board column name),
  deadline?: string (ISO date),
  assignedTo?: string (userId)
}
Response: { message, task: { taskId, ... } }
```

**PATCH /moveTask** (uses Firestore transaction)
```
Body: {
  taskId: string,
  boardId: string,
  newStatus: string (target column),
  newColumnIndex: number (position in column)
}
Response: { message: "Task moved successfully." }
```
This function atomically updates the moved task and reindexes all affected tasks in both source and destination columns.

**PATCH /assignTask**
```
Body: { taskId: string, boardId: string, assignedTo: string|null }
Response: { message: "Task assignment updated." }
```

### File Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/uploadAttachment` | Upload a file to a task (multipart) |
| GET | `/getAttachmentsByTask?taskId=X&boardId=Y` | List attachments for a task |
| DELETE | `/deleteAttachment` | Delete an attachment |

**POST /uploadAttachment** (multipart/form-data)
```
Fields: boardId (string), taskId (string)
File: file (max 10MB, allowed types: images, PDF, Word, Excel, text, CSV)
Response: { message, attachment: { attachmentId, storageURL, ... } }
```

**DELETE /deleteAttachment** (uploader or admin only)
```
Body: { attachmentId: string, boardId: string }
Response: { message: "Attachment deleted successfully." }
```

### Activity Log

| Method | Endpoint | Description |
|--------|----------|-------------|
| — | `onTaskWrite` | Firestore trigger: auto-logs task changes |
| GET | `/getActivityLog?boardId=X` | Query activity log for a board |

**GET /getActivityLog**
```
Query params:
  boardId: string (required)
  action?: string (filter by type, e.g., "task_moved")
  limit?: number (max 50, default 20)
  startAfter?: string (logId for cursor-based pagination)

Response: {
  logs: [{ logId, boardId, userId, userName, action, details, taskId, timestamp }],
  hasMore: boolean,
  lastLogId: string|null
}
```

**Action types logged:** `board_created`, `board_updated`, `member_added`, `member_removed`, `role_changed`, `task_created`, `task_edited`, `task_moved`, `task_assigned`, `task_unassigned`, `task_deleted`, `file_uploaded`, `file_deleted`

---

## Security

### Authentication

All HTTP endpoints require a valid Firebase Authentication ID token. The token is verified server-side using the Firebase Admin SDK before any operation is executed.

### Authorization (Role-Based Access Control)

Board membership uses three roles with escalating permissions:

| Role | Can view board | Can manage tasks | Can manage members | Can delete board |
|------|---------------|-----------------|-------------------|-----------------|
| member | Yes | Yes | No | No |
| admin | Yes | Yes | Yes (invite/remove members) | No |
| owner | Yes | Yes | Yes (full control) | Yes |

### Data Security

- **Encryption in Transit:** All communication uses HTTPS with TLS 1.2+, enforced by Google Cloud Platform.
- **Encryption at Rest:** All data in Firestore and Cloud Storage is encrypted with AES-256, managed automatically by GCP.
- **Credential Hashing:** Firebase Authentication handles password hashing using scrypt.
- **Firestore Security Rules:** Zero-trust model — all client reads/writes are blocked by default. Only Cloud Functions (using the Admin SDK) can write data. Clients can only read data for boards they are members of.
- **Cloud Storage Rules:** Uploads are restricted to authenticated users, with a 10MB file size limit and MIME type validation.

### Structured Logging

All Cloud Functions use `firebase-functions/logger` for structured logging that integrates with GCP Cloud Logging. Every major action includes `boardId` and `userId` for audit tracking:

```javascript
logger.info("Task Status Changed", {
  boardId: "abc123",
  taskId: "xyz789",
  newStatus: "Done",
  userId: "user456"
});
```

---

## Firestore Data Schema

### users
```
{
  userId: string (document ID = Firebase Auth UID),
  email: string,
  displayName: string,
  photoURL: string | null,
  role: "user",
  createdAt: Timestamp
}
```

### boards
```
{
  boardId: string (auto-generated),
  ownerId: string → users.userId,
  title: string,
  description: string,
  columns: string[],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### boardMembers
```
Document ID: "{userId}_{boardId}" (composite key for O(1) lookups)
{
  memberId: string,
  boardId: string → boards,
  userId: string → users,
  role: "owner" | "admin" | "member",
  joinedAt: Timestamp
}
```

### tasks
```
{
  taskId: string (auto-generated),
  boardId: string → boards,
  createdBy: string → users,
  assignedTo: string | null → users,
  title: string,
  description: string,
  status: string (matches a column name),
  columnIndex: number (position within column),
  deadline: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### attachments
```
{
  attachmentId: string (auto-generated),
  taskId: string → tasks,
  boardId: string → boards,
  uploadedBy: string → users,
  fileName: string,
  fileType: string (MIME type),
  fileSize: number (bytes),
  storagePath: string,
  storageURL: string,
  createdAt: Timestamp
}
```

### activityLog
```
{
  logId: string (auto-generated),
  boardId: string → boards,
  userId: string → users,
  taskId: string | null → tasks,
  action: string,
  details: string,
  timestamp: Timestamp
}
```

### Composite Indexes

| Collection | Fields | Purpose |
|-----------|--------|---------|
| tasks | boardId (ASC), status (ASC), columnIndex (ASC) | Query tasks by board and column |
| activityLog | boardId (ASC), timestamp (DESC) | Query activity log by board |
| boardMembers | userId (ASC), joinedAt (DESC) | Query user memberships |
| attachments | taskId (ASC), createdAt (DESC) | Query attachments by task |

---

## Cloud Functions Summary

**23 Cloud Functions** deployed to `asia-southeast1`:

| # | Function | Type | Phase |
|---|----------|------|-------|
| 1 | onUserCreate | Auth Trigger | 1 |
| 2 | getUserProfile | HTTP GET | 1 |
| 3 | updateUserProfile | HTTP PATCH | 1 |
| 4 | searchUserByEmail | HTTP GET | 1 |
| 5 | createBoard | HTTP POST | 2 |
| 6 | getBoards | HTTP GET | 2 |
| 7 | getBoardById | HTTP GET | 2 |
| 8 | updateBoard | HTTP PATCH | 2 |
| 9 | deleteBoard | HTTP DELETE | 2 |
| 10 | addBoardMember | HTTP POST | 2 |
| 11 | removeBoardMember | HTTP DELETE | 2 |
| 12 | updateMemberRole | HTTP PATCH | 2 |
| 13 | createTask | HTTP POST | 3 |
| 14 | getTasksByBoard | HTTP GET | 3 |
| 15 | updateTask | HTTP PATCH | 3 |
| 16 | moveTask | HTTP PATCH | 3 |
| 17 | deleteTask | HTTP DELETE | 3 |
| 18 | assignTask | HTTP PATCH | 3 |
| 19 | uploadAttachment | HTTP POST | 4 |
| 20 | getAttachmentsByTask | HTTP GET | 4 |
| 21 | deleteAttachment | HTTP DELETE | 4 |
| 22 | getActivityLog | HTTP GET | 5 |
| 23 | onTaskWrite | Firestore Trigger | 3 |
