# Task 4 — Full-marks reference (rubrics 4.1–4.3)

Use this when writing your **final submission**. It is aligned to **Task 4 Rubrics**: *RBAC correctly implemented*, *encryption in transit and at rest*, and *clear explanation with evidence*.

---

## Rubric map — what “Excellent (5)” requires vs. your evidence

| Sub-task | Rubric (top band) | Your evidence (what to show / cite) |
|----------|-------------------|-------------------------------------|
| **4.1** | Role-based access control **correctly** implemented | Two-level RBAC: **app role** (`users.role == 'admin'`) + **board roles** (`owner` / `admin` / `member` via `boardMembers`). **Firestore rules** (`Backend_Ameer/firestore.rules`) + **Cloud Functions** (`verifyAuth` + `checkMembership` in `Backend_Ameer/functions/handlers/boards.js`). |
| **4.2** | **Encryption in transit (HTTPS)** and **at rest** | **Transit:** TLS for browser ↔ Firebase services and **HTTPS** Cloud Functions base URL in `lib/api.ts`. **At rest:** **Google-managed encryption** for Firestore, Auth identity store, and Cloud Storage (Firebase default — cite Google/Firebase docs in references). **Passwords:** never in Firestore; **Firebase Auth** stores credentials with secure hashing. |
| **4.3** | **Clear explanation with evidence** | Short structured report + **appendix**: screenshots (HTTPS lock, Firestore rules in console or rules file), and **code references** (paths below). |

---

## 1. Paragraph you can adapt (introduction)

**LockinTogether** uses **Firebase Authentication** for identity (email/password and Google). **Authorization** is **role-based**: a global **application role** in `users` (e.g. `admin`) and **per-board** roles in `boardMembers` (`owner`, `admin`, `member`). Access to Firestore data is enforced by **security rules**; privileged HTTP actions use **Cloud Functions** that verify **Firebase ID tokens** and **board membership**. Data is protected **in transit** with **HTTPS/TLS** to Google endpoints and **at rest** by **platform encryption** on Firebase/Google Cloud, with **password hashing** handled by Firebase Auth.

---

## 2. Task 4.1 — Authentication + RBAC (evidence checklist)

### 2.1 Authentication (identity)

| Mechanism | Location |
|-----------|----------|
| Email / password sign-in & sign-up | `app/login/page.tsx`, `app/signup/page.tsx` |
| Google (GIS → Firebase credential) | same |
| Auth state + profile fetch | `lib/firebase/auth-context.tsx` |
| Password reset | `app/login/page.tsx` (`sendPasswordResetEmail`) |

**One sentence for the marker:** *Authentication establishes who the user is; **authorization** (roles + rules) decides what they may read or write.*

### 2.2 RBAC — application role (`users`)

- Rules function **`isAppAdmin()`** reads `users/{request.auth.uid}.role == 'admin'`.
- **Effect:** only app admins may **delete users**; admins or self may **update** profiles as per `match /users/{userId}` in `Backend_Ameer/firestore.rules`.
- Client reads `profile.role` after login via **`getUserProfile`** (`lib/api.ts` → Cloud Function).

### 2.3 RBAC — board roles (`boardMembers`)

- Member document id: **`{userId}_{boardId}`** (matches `getBoardRole(boardId)` in rules and backend `checkMembership`).
- **Helpers:** `isBoardOwner`, `isBoardAdmin`, `isBoardMember` restrict `boards`, `tasks`, `attachments`, `activityLogs`.

### 2.4 Defense in depth (say this explicitly — markers like it)

| Layer | Purpose |
|-------|---------|
| **Firestore rules** | Default deny; allow only if `request.auth` + correct **role** / membership. |
| **Cloud Functions** | `Backend_Ameer/functions/middleware/auth.js` — **`verifyAuth`** validates **Bearer JWT**; handlers call **`checkMembership(..., allowedRoles)`**. |
| **Client** | Hiding buttons is **UX**; **not** the security boundary. |

**Code to cite in appendix:** `Backend_Ameer/firestore.rules` (helpers + `match` blocks), `Backend_Ameer/functions/middleware/auth.js`, `Backend_Ameer/functions/handlers/boards.js` (`checkMembership`), `lib/api.ts` (`getAuthHeaders`).

---

## 3. Task 4.2 — Data security (transit + at rest + credentials)

### 3.1 Encryption in transit (HTTPS / TLS) — rubric line item

| Path | Evidence |
|------|----------|
| Browser → **Firebase** (Auth, Firestore, Storage SDKs) | HTTPS endpoints (standard Firebase Web SDK). |
| Browser → **Cloud Functions** | `lib/api.ts` uses **`https://asia-southeast1-lockintogether-9c05f.cloudfunctions.net`** in production. |
| Browser → **hosted app** | Production site on Firebase App Hosting / HTTPS (see `apphosting.yaml`). |

**Screenshot evidence:** browser address bar **padlock** on your deployed app URL; **Network** tab shows **https** requests to `firebase` / `googleapis` / `cloudfunctions.net`.

### 3.2 Encryption at rest — rubric line item (state clearly)

Firebase/Google Cloud services used by this project apply **encryption at rest** by default (typically **Google-managed keys**). This covers at minimum:

- **Cloud Firestore** database contents  
- **Firebase Authentication** account data  
- **Cloud Storage for Firebase** (attachment bucket)

**How to phrase it honestly:** *“Sensitive data persisted in Firestore, the Auth identity store, and Cloud Storage is encrypted **at rest** by Google Cloud’s default infrastructure encryption, as documented in Firebase/Google Cloud security documentation.”*

Add a **reference** in your bibliography to official Firebase/Google docs on encryption at rest (search: “Firestore encryption at rest”, “Firebase data encryption”).

### 3.3 Passwords / credentials (complements 4.2 and assignment wording)

- **Do not** store plaintext passwords in Firestore or custom DB.
- **Firebase Authentication** performs **secure password hashing** for email/password accounts; the app only calls `createUserWithEmailAndPassword` / `signInWithEmailAndPassword`.

### 3.4 Storage rules (attachments)

- File path and constraints: `Backend_Ameer/storage.rules` (size cap, content-type allowlist, default deny).

### 3.5 Local development note

- Emulators (`lib/firebase/config.ts`) are for dev only; **describe production** security in the report.

---

## 4. Task 4.3 — Documentation “clear + evidence” (submission template)

Use headings like this (keep each section short):

1. **Security overview** (§1 paragraph above).  
2. **Authentication** — table §2.1 + screenshot of Firebase Console → Authentication (providers enabled).  
3. **RBAC** — explain app admin vs board roles; paste or reference **`Backend_Ameer/firestore.rules`**; mention **`verifyAuth`** + **`checkMembership`**.  
4. **Data protection** — HTTPS (§3.1) + at rest (§3.2) + password hashing (§3.3).  
5. **Evidence appendix** — HTTPS screenshot, rules screenshot or file path, one **`lib/api.ts`** snippet showing **`https://`** and **`Authorization: Bearer`**.

---

## 5. Firestore collections — quick “who can do what” (for your report table)

| Collection | Access pattern (from rules) |
|------------|-----------------------------|
| `users` | Logged-in read; create own doc; update self or app admin; delete app admin only. |
| `boards` | Read/update/delete by **board membership** and **role** (owner for delete, admin+ for update). |
| `boardMembers` | Logged-in read; create/update/delete gated by **board admin/owner** (see rules). |
| `tasks` / `attachments` | Read/write by **board members**; delete tasks/attachments by **board admin** where rule says. |
| `activityLogs` | Board members read/create; **no update/delete** (immutable). |

---

## 6. File index (copy into references)

| Topic | Path |
|-------|------|
| Firestore RBAC | `Backend_Ameer/firestore.rules` |
| Storage rules | `Backend_Ameer/storage.rules` |
| Bearer token API | `lib/api.ts` |
| Token verification | `Backend_Ameer/functions/middleware/auth.js` |
| Board RBAC in API | `Backend_Ameer/functions/handlers/boards.js` |
| Auth UI | `app/login/page.tsx`, `app/signup/page.tsx` |
| Profile + `role` | `lib/firebase/auth-context.tsx` |
| Hosting config | `apphosting.yaml` |

---

## 7. Pre-submit checklist (avoid losing easy marks)

- [ ] Report explicitly uses the words **RBAC**, **HTTPS** / **TLS**, **encryption at rest**, and **evidence** (screenshots or code paths).  
- [ ] Firestore rules in **console** match **`Backend_Ameer/firestore.rules`** (redeploy after edits).  
- [ ] Bibliography: 1–2 **official** Firebase/Google links on HTTPS and encryption at rest.  
- [ ] Optional: show **Network** tab with **https** to `cloudfunctions.net` and `firebase.googleapis.com`.

---

*Last updated to align with Task 4 rubric: RBAC, encryption in transit + at rest, documentation with evidence.*
