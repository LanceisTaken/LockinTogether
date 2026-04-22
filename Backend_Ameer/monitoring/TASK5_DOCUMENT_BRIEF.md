# Task 5: Monitoring, Logging and Scaling — Document Brief
## Application: LockinTogether (Collaborative Kanban Board)
## Cloud Platform: Google Cloud Platform (Firebase / Cloud Run), Region: asia-southeast1

---

## Overview

LockinTogether is a real-time collaborative Kanban board application. The backend consists of 15+ Firebase Cloud Functions v2 (backed by Cloud Run) handling all business logic, a Next.js frontend served via Firebase App Hosting (also Cloud Run), and a Firestore database with real-time listeners on the client side.

All three components — Cloud Functions, App Hosting, and Firestore — are fully managed GCP services that auto-scale without manual intervention.

---

## Task 5.1 — Monitoring

### Tool Used
**Google Cloud Monitoring** (Cloud Operations Suite) — built into GCP, no additional setup required. A custom dashboard was created and deployed programmatically using the Cloud Monitoring Dashboard API via the `gcloud` CLI.

### Dashboard: "LockinTogether — Application Monitoring"
**Location:** GCP Console → Monitoring → Dashboards → "LockinTogether — Application Monitoring"
**Config file:** `Backend_Ameer/monitoring/dashboard.json`

The dashboard contains 10 panels grouped into 4 rows:

#### Row 1 — Traffic & Errors
| Panel | Metric | Purpose |
|---|---|---|
| Cloud Run — Total Requests (per service) | `run.googleapis.com/request_count` with `ALIGN_SUM` over 5-min windows, `STACKED_BAR` | Tracks request counts per Cloud Function, grouped by service name. Uses sum aggregation (not rate) so low-traffic functions are visible |
| Cloud Run — 5xx Errors (per service) | `run.googleapis.com/request_count` filtered by `response_code_class=5xx`, `STACKED_BAR` | Detects function failures — each bar shows error count per 5-minute window per service |

#### Row 2 — Latency & Database
| Panel | Metric | Purpose |
|---|---|---|
| Request Latency p50/p95 (ms) | `run.googleapis.com/request_latencies` with both p50 and p95 percentiles | Shows median and worst-case response time per function — identifies slow operations like `moveTask` (Firestore transactions) and `uploadAttachment` (file processing) |
| Firestore — Document Reads & Writes (ops/sec) | `firestore.googleapis.com/document/read_ops_count` + `write_ops_count` | Monitors database load driven by real-time `onSnapshot` listeners and write operations |

#### Row 3 — Scaling & Resource Usage
| Panel | Metric | Purpose |
|---|---|---|
| Auto-Scaling Instances (stacked area) | `run.googleapis.com/container/instance_count` | Visually demonstrates Cloud Run auto-scaling — instances spin up under load and down to 0 at idle |
| CPU & Memory Utilisation | `run.googleapis.com/container/cpu/utilizations` + `memory/utilizations` at p95 | Monitors resource consumption per service — validates that functions like `uploadAttachment` (512MiB) have adequate memory allocation |

#### Row 4 — KPI Scorecards
| Scorecard | What it shows |
|---|---|
| Total Requests (1h) | Overall function call volume in the past hour |
| Total Errors (1h) | 5xx count with colour thresholds (yellow ≥1, red ≥10) |
| Firestore Reads (1h) | Database read volume driven by real-time collaboration |
| Peak Instances (1h) | Maximum Cloud Run instances active — demonstrates elastic scaling |

### What is monitored and why (justification per metric)
- **Request count (sum, not rate)** — Using `ALIGN_SUM` with 5-minute windows ensures even low-traffic functions are visible. `ALIGN_RATE` was previously used but divided counts by alignment period, making infrequent calls appear as near-zero.
- **Error rate** — All 15 Cloud Functions use auth middleware (`verifyAuth`). A spike in 5xx errors immediately indicates authentication failures, Firestore permission issues, or code regressions.
- **Latency p50 & p95** — Dual percentiles give both typical and worst-case latency. `moveTask` runs a Firestore transaction reindexing multiple tasks atomically; `uploadAttachment` processes multipart file data and writes to Cloud Storage.
- **Firestore read/write volume** — Each board page opens 4 concurrent real-time `onSnapshot` listeners (tasks, boardMembers, activityLog, notifications). Read volume scales directly with concurrent users, making it the primary cost and performance indicator.
- **Active instances** — Cloud Run scales to zero at idle and up under load. The stacked area chart proves auto-scaling behaviour is working.
- **CPU & memory utilisation** — Validates resource allocation decisions (e.g. `uploadAttachment` configured with 512MiB memory). High CPU or memory utilisation would indicate a need to increase resource limits.


## Task 5.2 — Logging

### Logging Architecture

Logging operates at two layers:

#### Layer 1 — Structured Application Logging (`utils/monitoring.js`)
A custom logging utility was created at `Backend_Ameer/functions/utils/monitoring.js` that wraps `firebase-functions/logger` with consistent structured fields. Every log entry contains:

| Field | Description |
|---|---|
| `service` | Always `"lockintogether"` — allows filtering all app logs |
| `function` | Function name e.g. `"createTask"`, `"moveTask"` |
| `userId` | Authenticated user UID |
| `durationMs` | Execution time in milliseconds (success logs only) |
| `errorCode` | HTTP status code (error logs only) |
| `errorMessage` | Error description (error logs only) |
| `boardId` / `taskId` | Business context fields |

Three log types are emitted per function call:
- `request_start` — logged after authentication, records who called what
- `request_success` — logged on completion with `durationMs`
- `request_error` — logged on failure with `errorCode` and `errorMessage`

This is applied to the most critical handlers: `createTask`, `updateTask`, `moveTask`, `deleteTask` (in `tasks.js`) and `uploadAttachment`, `getAttachmentsByTask`, `deleteAttachment` (in `attachments.js`).

#### Layer 2 — Pre-existing Handler Logging
All other Cloud Function handlers (`boards.js`, `users.js`, `activityLog.js`, `triggers/onTaskChange.js`) already used `firebase-functions/logger` with structured fields. Examples:
- `logger.info("Task created", { boardId, taskId, userId, status })`
- `logger.error("createTask error", { error: error.message })`
- `logger.warn("Storage cleanup warning", { boardId, taskId, error })`

#### Layer 3 — Application Activity Log (Firestore)
All user actions are also written to the `activityLog` Firestore collection by the `createLog()` helper, recording: `boardId`, `userId`, `action` (e.g. `task_created`, `task_moved`, `file_uploaded`), `details`, `taskId`, and `timestamp`. This serves as an audit trail visible in the app's activity sidebar.

#### Layer 4 — Firestore Trigger Logging
`onTaskWrite` (in `triggers/onTaskChange.js`) fires on every write to the `tasks` collection and appends a supplementary log entry, providing event-driven logging independent of the HTTP handler path.

### Where Logs Are Stored
All `firebase-functions/logger` output is automatically shipped to **Google Cloud Logging** (formerly Stackdriver). Logs are queryable in the Log Explorer.

**Useful Log Explorer queries:**
```
resource.type="cloud_run_revision"
jsonPayload.service="lockintogether"
```
Filter by specific function:
```
jsonPayload.function="moveTask"
```
Find slow operations (over 2 seconds):
```
jsonPayload.function="uploadAttachment"
jsonPayload.durationMs > 2000
```
Find all errors:
```
resource.type="cloud_run_revision"
severity=ERROR
```

### Screenshot required
> **[SCREENSHOT 2]** GCP Console → Logging → Log Explorer
> Filter: `resource.type="cloud_run_revision"` and `jsonPayload.service="lockintogether"`
> Expand one log entry to show the structured fields (function, userId, durationMs, etc.)

> **[SCREENSHOT 3]** Same Log Explorer, filter by `severity=ERROR` to show error log structure
> (If no real errors exist, filter by `severity=INFO` and show a `request_success` entry with `durationMs`)

---

## Task 5.3 — Scaling

### Scaling Architecture

The application uses **elastic auto-scaling** provided natively by Cloud Run. There are no servers to manage — instances spin up automatically when traffic increases and scale back to zero when idle, minimising cost.

### App Hosting (Next.js Frontend) — `apphosting.yaml`
```yaml
runConfig:
  minInstances: 0
  maxInstances: 20
  concurrency: 80
  cpu: 1
  memoryMiB: 512
```
- `minInstances: 0` — scales to zero at idle (cost efficient)
- `maxInstances: 20` — caps at 20 concurrent instances to stay within the `asia-southeast1` CPU quota (56,000 mCPU / 56 vCPU total for the project)
- `concurrency: 80` — each instance handles up to 80 simultaneous SSR requests

### Cloud Functions — Scaling Configuration
Critical functions have explicit scaling options configured on their `onRequest()` declarations:

| Function | maxInstances | concurrency | Memory | Timeout | Reason |
|---|---|---|---|---|---|
| `moveTask` | 5 | 40 | default | default | Most burst-prone — runs Firestore transactions reindexing all tasks in a column |
| `createTask` | 5 | 40 | default | default | High frequency during active collaboration sessions |
| `updateTask` | 5 | 40 | default | default | High frequency — called on every task edit |
| `uploadAttachment` | 3 | 10 | 512 MiB | 120s | File processing requires more memory; longer timeout for large files up to 10MB |
| `getAttachmentsByTask` | 3 | 40 | default | default | Read-only, moderate load |
| `deleteAttachment` | 3 | 40 | default | default | Infrequent, includes Storage delete |
| All other functions | default | default | default | default | Auto-scales on demand |

All functions have `minInstances: 0` (default), meaning they scale to zero when not in use.

### How Auto-Scaling Works in This Application
1. A user drags a task card on the Kanban board → client calls `moveTask`
2. If no instance is warm, Cloud Run starts a new container (cold start ~300–800ms)
3. If multiple users drag cards simultaneously, Cloud Run spawns additional instances up to `maxInstances`
4. When activity stops, instances are terminated after idle timeout → back to 0 instances
5. The **"Auto-Scaling Instances"** dashboard panel shows this behaviour in real-time

### Load Handling Justification
- **Real-time listeners** (`onSnapshot` on tasks, boardMembers, activityLog, notifications) are handled client-side by the Firebase SDK — they do not go through Cloud Functions and scale independently via Firestore's infrastructure
- **Firestore** itself is a fully managed, serverless database — no scaling configuration required
- **Cloud Storage** (for file attachments) is also fully managed and scales automatically
- The only scaling configuration needed is on Cloud Run (App Hosting + Cloud Functions), which has been explicitly set




