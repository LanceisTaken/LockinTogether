# LockinTogether — Backend Development Roadmap

**Role:** Member 2 — Backend & Data Architect  
**Scope:** Firebase Cloud Functions (Node.js), Firestore schema, Cloud Storage integration  
**Status:** Firebase project created, no code yet

---

## Phase 0: Project Scaffolding & Firestore Schema

**Goal:** Get the Firebase Functions project initialized and define every Firestore collection so the frontend dev can start wiring listeners immediately.

### 0.1 — Initialize Firebase Functions Project

- Run `firebase init functions` (select Node.js, ESLint yes)
- Set up project structure:

```
functions/
├── index.js              ← exports all Cloud Functions
├── package.json
├── .eslintrc.js
├── config/
│   └── firebase.js       ← admin SDK initialization
├── middleware/
│   └── auth.js           ← token verification middleware
├── handlers/
│   ├── users.js          ← user profile CRUD
│   ├── boards.js         ← board CRUD + member management
│   ├── tasks.js          ← task CRUD + move/reorder
│   ├── attachments.js    ← file upload/delete via Cloud Storage
│   └── activityLog.js    ← log creation (internal helper)
├── triggers/
│   └── onTaskChange.js   ← Firestore-triggered functions (activity logging)
└── utils/
    └── validators.js     ← input validation helpers
```

- Install dependencies: `firebase-admin`, `firebase-functions`, `cors`, `busboy` (for file uploads)
- Configure `firebase.json` to point to functions directory

### 0.2 — Define Firestore Collections & Document Schemas

Based on the ERD from Task 2, define six collections:

**Collection: `users`**
```
{
  userId: string (auto / matches Firebase Auth UID),
  email: string,
  displayName: string,
  role: string ("user" | "admin"),
  photoURL: string | null,
  createdAt: Timestamp
}
```

**Collection: `boards`**
```
{
  boardId: string (auto),
  ownerId: string (FK → users),
  title: string,
  description: string,
  columns: string[] (e.g., ["To-Do", "In-Progress", "Done"]),
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Collection: `boardMembers`**
```
{
  memberId: string (auto),
  boardId: string (FK → boards),
  userId: string (FK → users),
  role: string ("owner" | "admin" | "member"),
  joinedAt: Timestamp
}
```

**Collection: `tasks`**
```
{
  taskId: string (auto),
  boardId: string (FK → boards),
  createdBy: string (FK → users),
  assignedTo: string | null (FK → users),
  title: string,
  description: string,
  status: string (matches a column name),
  columnIndex: number (position within column),
  deadline: Timestamp | null,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Collection: `attachments`**
```
{
  attachmentId: string (auto),
  taskId: string (FK → tasks),
  boardId: string (FK → boards),
  uploadedBy: string (FK → users),
  fileName: string,
  fileType: string (MIME type),
  fileSize: number (bytes),
  storageURL: string (Cloud Storage download URL),
  createdAt: Timestamp
}
```

**Collection: `activityLog`**
```
{
  logId: string (auto),
  boardId: string (FK → boards),
  userId: string (FK → users),
  taskId: string | null (FK → tasks),
  action: string (e.g., "task_created", "task_moved", "task_deleted",
                  "member_added", "file_uploaded"),
  details: string (human-readable description),
  timestamp: Timestamp
}
```

### 0.3 — Firestore Security Rules (Initial Draft)

Write `firestore.rules` to enforce:
- Users can only read/write boards they are members of
- Only board owners/admins can manage members
- Tasks can only be modified by board members
- ActivityLog is read-only for clients (written by Cloud Functions only)

### 0.4 — Cloud Storage Rules

Write `storage.rules` to enforce:
- Only authenticated users who are board members can upload
- File size limit (e.g., 10MB max)
- Allowed MIME types (images, PDFs, common documents)

**Deliverable:** Initialized project, all schemas documented, security rules drafted.

---

## Phase 1: Authentication & User Profile Management

**Goal:** Cloud Functions that handle user profile creation on signup and profile retrieval.

### 1.1 — Auth Trigger: `onUserCreate`

- Firestore trigger: `functions.auth.user().onCreate()`
- Automatically creates a `users` document when someone signs up via Firebase Auth
- Populates: `userId`, `email`, `displayName`, `role: "user"`, `createdAt`

### 1.2 — HTTP Function: `getUserProfile`

- GET endpoint: retrieves the user's profile document
- Verifies Firebase Auth ID token from the `Authorization` header
- Returns user data (used by frontend to display user info)

### 1.3 — HTTP Function: `updateUserProfile`

- PATCH endpoint: allows user to update `displayName` and `photoURL`
- Token verification + input validation

### 1.4 — Auth Middleware (Reusable)

- Create `middleware/auth.js` that extracts and verifies the ID token
- Returns decoded user info (uid, email) for downstream use
- Every subsequent HTTP function will use this

**Deliverable:** Users auto-provisioned on signup, profile read/update working.

---

## Phase 2: Board Management

**Goal:** Full CRUD for boards + member invitation/removal system.

### 2.1 — `createBoard`

- POST: Creates a new board document
- Automatically creates a `boardMembers` document with `role: "owner"` for the creator
- Validates: title required, columns must be non-empty array
- Logs activity: `"board_created"`

### 2.2 — `getBoards`

- GET: Returns all boards where the authenticated user is a member
- Queries `boardMembers` where `userId == auth.uid`, then fetches board docs
- Returns board metadata + user's role on each board

### 2.3 — `getBoardById`

- GET: Returns full board details including member list
- Verifies the requester is a board member
- Fetches board doc + all boardMember docs + associated user profiles

### 2.4 — `updateBoard`

- PATCH: Update board title, description, or columns
- Only board owner or admin can update
- Validates columns aren't removed if tasks exist in that column

### 2.5 — `deleteBoard`

- DELETE: Removes board, all associated boardMembers, tasks, attachments, and activity logs
- Only the board owner can delete
- Batch delete all related documents + Cloud Storage files

### 2.6 — `addBoardMember`

- POST: Admin/owner invites a user by email
- Looks up user by email → creates a `boardMembers` document
- Validates: user exists, not already a member
- Logs activity: `"member_added"`

### 2.7 — `removeBoardMember`

- DELETE: Admin/owner removes a member
- Deletes the `boardMembers` document
- Reassigns or unassigns any tasks assigned to the removed user
- Logs activity: `"member_removed"`

### 2.8 — `updateMemberRole`

- PATCH: Owner can change a member's role (member ↔ admin)
- Validates: can't change own role, can't demote the owner

**Deliverable:** Complete board lifecycle + team membership management.

---

## Phase 3: Task Management (Core Feature)

**Goal:** Full CRUD for tasks + drag-and-drop move + assignment — this is the heart of the app.

### 3.1 — `createTask`

- POST: Creates a new task in a specific board/column
- Required fields: `title`, `boardId`, `status` (column name)
- Auto-sets: `createdBy`, `columnIndex` (append to end of column), `createdAt`
- Validates: user is a board member, column exists on the board
- Logs activity: `"task_created"`
- Firestore real-time listeners will auto-broadcast to other clients

### 3.2 — `getTasksByBoard`

- GET: Returns all tasks for a given board
- Verifies membership, returns tasks ordered by `status` and `columnIndex`
- Frontend uses Firestore `onSnapshot` for real-time, but this serves as initial load

### 3.3 — `updateTask`

- PATCH: Edit task title, description, deadline, assignedTo
- Validates: user is board member, assignee (if provided) is a board member
- Updates `updatedAt` timestamp
- Logs activity: `"task_edited"`

### 3.4 — `moveTask` ⭐ (Critical for real-time collaboration)

- PATCH: Updates task's `status` (column) and `columnIndex` (position)
- Accepts: `taskId`, `newStatus`, `newColumnIndex`
- Reindexes other tasks in both source and destination columns
- Must be done in a Firestore **transaction** to prevent race conditions
- Logs activity: `"task_moved"` with details like "Moved from To-Do to In-Progress"

### 3.5 — `deleteTask`

- DELETE: Removes a task and all its attachments
- Deletes associated attachment docs + files from Cloud Storage
- Reindexes remaining tasks in the column
- Logs activity: `"task_deleted"`

### 3.6 — `assignTask`

- PATCH (could be part of `updateTask`, but separated for clarity)
- Validates assignee is a board member
- Logs activity: `"task_assigned"`

### 3.7 — Firestore Trigger: `onTaskWrite`

- Trigger: `functions.firestore.document('tasks/{taskId}').onWrite()`
- Automatically creates an `activityLog` entry on any task change
- This is the event-driven pattern from your Task 2 design

**Deliverable:** Complete task CRUD with transactional moves and auto-logging.

---

## Phase 4: File Attachment System

**Goal:** Upload files to Cloud Storage linked to task cards, with metadata in Firestore.

### 4.1 — `uploadAttachment`

- POST: Multipart file upload using `busboy`
- Flow:
  1. Verify auth + board membership
  2. Validate file size (≤10MB) and MIME type
  3. Upload to Cloud Storage bucket at path: `boards/{boardId}/tasks/{taskId}/{timestamp}_{fileName}`
  4. Generate a signed download URL (or make file publicly readable within the project)
  5. Create an `attachments` document in Firestore with metadata
- Logs activity: `"file_uploaded"`

### 4.2 — `getAttachmentsByTask`

- GET: Returns all attachment metadata for a given task
- Verifies board membership

### 4.3 — `deleteAttachment`

- DELETE: Removes the file from Cloud Storage + deletes the Firestore document
- Verifies: uploader or board admin can delete
- Logs activity: `"file_deleted"`

### 4.4 — Cloud Storage Bucket Configuration

- Set up CORS policy for the storage bucket (needed for frontend direct downloads)
- Configure lifecycle rules if desired (e.g., auto-delete after 1 year)

**Deliverable:** Working file upload/download/delete tied to task cards.

---

## Phase 5: Activity Logging & Query Support

**Goal:** Robust activity logging for the board analytics / audit trail.

### 5.1 — Activity Log Helper (`handlers/activityLog.js`)

- Internal function `createLog(boardId, userId, taskId, action, details)`
- Called by all other handlers after successful operations
- Not exposed as an HTTP endpoint — clients read logs via Firestore listeners

### 5.2 — `getActivityLog`

- GET: Returns paginated activity log for a board
- Supports: filtering by action type, date range
- Ordered by `timestamp` descending
- Verifies board membership

### 5.3 — Firestore Compound Indexes

- Create needed indexes in `firestore.indexes.json`:
  - `activityLog`: composite index on `boardId` + `timestamp` (descending)
  - `tasks`: composite index on `boardId` + `status` + `columnIndex`
  - `boardMembers`: composite index on `userId` + `boardId`

**Deliverable:** Full audit trail queryable by board, with proper indexes for performance.

---

## Phase 6: Deployment & Documentation

**Goal:** Deploy to Firebase, write clear documentation, and ensure everything works end-to-end.

### 6.1 — Deploy Cloud Functions

- `firebase deploy --only functions`
- Test each endpoint with curl / Postman / Thunder Client
- Verify Firestore triggers fire correctly

### 6.2 — Deploy Security Rules

- `firebase deploy --only firestore:rules,storage`
- Test rules using the Firebase Emulator Suite

### 6.3 — Deployment Documentation

Write deployment instructions covering:
- Prerequisites (Node.js, Firebase CLI, project setup)
- Environment configuration (Firebase project ID, region)
- How to deploy (`firebase deploy`)
- API endpoint reference (all HTTP functions with request/response formats)
- How to access the deployed application

### 6.4 — Code Quality Checklist (Task 3.3 Criteria)

- [ ] Clean, modular code with separation of concerns
- [ ] Consistent error handling across all functions
- [ ] Input validation on all endpoints
- [ ] Meaningful Git commits showing incremental progress
- [ ] Comments on complex logic (transactions, reindexing)
- [ ] No hardcoded secrets or API keys

### 6.5 — Integration Testing with Frontend

- Coordinate with Member 1 to test:
  - Auth flow → profile creation trigger
  - Board CRUD → real-time updates via `onSnapshot`
  - Task drag-and-drop → transactional move → broadcast
  - File upload → attachment metadata → display on task card
- Fix any CORS, auth token, or data format mismatches

---

## Suggested Build Order (Priority Sequence)

| Order | Phase | Rationale |
|-------|-------|-----------|
| 1st | Phase 0 | Schema + scaffold — unblocks frontend dev |
| 2nd | Phase 1 | Auth — everything depends on authenticated users |
| 3rd | Phase 2 (2.1–2.3) | Board creation + listing — needed before tasks |
| 4th | Phase 3 (3.1–3.4) | Task CRUD + move — the core product |
| 5th | Phase 4 | File attachments — secondary but required |
| 6th | Phase 2 (2.4–2.8) | Board update/delete + member management |
| 7th | Phase 3 (3.5–3.7) | Task delete + triggers |
| 8th | Phase 5 | Activity log queries + indexes |
| 9th | Phase 6 | Deploy + docs + integration test |

---

## Key Technical Decisions to Remember

1. **All backend logic runs as Firebase Cloud Functions (Node.js)** — matches proposal's serverless architecture
2. **Firestore is NoSQL** — no JOINs, denormalize where needed (e.g., store `displayName` on task assignment, not just userId)
3. **Real-time sync is handled by Firestore listeners on the frontend** — backend just writes data correctly
4. **Use Firestore transactions for `moveTask`** — prevents race conditions when two people drag cards simultaneously
5. **Activity logging is event-driven** — Firestore `onWrite` trigger + explicit helper calls
6. **Cloud Storage paths follow convention:** `boards/{boardId}/tasks/{taskId}/{filename}`
7. **All HTTP functions verify auth token** via reusable middleware
8. **CORS must be configured** for all HTTP callable functions

---

## Files for Task 3 Submission

Per the coursework requirements, you need to deliver:
- **Source code** → GitHub repository with clear commit history
- **Deployment instructions** → How to set up and deploy the Firebase backend
- **Link to deployed app** or demo video
- **Demo presentation** → Show the working application

Your backend contribution specifically demonstrates:
- Task 3.1 (Backend & Cloud Services Implementation) — all Cloud Functions + Firestore integration
- Task 3.3 (Code Quality) — modular structure, Git history, clean code
- Task 3.4 (System Functionality) — all functional requirements implemented
- Task 3.5 (Cloud Deployment) — deployed on Firebase/GCP