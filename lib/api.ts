import { auth } from "@/lib/firebase/config"

// Environment toggle: local emulator vs deployed Cloud Functions
const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:5001/lockintogether-9c05f/asia-southeast1"
    : "https://asia-southeast1-lockintogether-9c05f.cloudfunctions.net"

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser
  if (!user) throw new Error("Session expired. Please sign in again.")
  try {
    const token = await user.getIdToken()
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
  } catch {
    throw new Error("Session expired. Please sign in again.")
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders()

  let res: Response
  try {
    res = await fetch(`${API_BASE}/${endpoint}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    })
  } catch {
    throw new Error("Network error. Please check your connection and try again.")
  }

  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned an invalid response (${res.status})`)
  }

  if (!res.ok) throw new Error((data.error as string) || `Request failed (${res.status})`)
  return data as T
}

// ── User Profile ──────────────────────────────────────────────

export function getUserProfile(uid?: string) {
  const query = uid ? `?uid=${uid}` : ""
  return apiRequest<{
    userId: string
    email: string
    displayName: string
    photoURL: string | null
    role: string
    createdAt: unknown
  }>(`getUserProfile${query}`, { method: "GET" })
}

export interface UserStats {
  totalCompleted: number
  completedOnTime: number
  completedLate: number
  inProgress: number
  completionRate: number
  recentCompleted: {
    taskId: string
    title: string
    boardId: string
    boardTitle: string
    deadline: string | null
    updatedAt: string | null
    completedOnTime: boolean
  }[]
  boardBreakdown: {
    boardId: string
    boardTitle: string
    total: number
    completed: number
    inProgress: number
  }[]
}

export function getUserStats() {
  return apiRequest<UserStats>("getUserStats", { method: "GET" })
}

export function updateUserProfile(updates: {
  displayName?: string
  photoURL?: string
}) {
  return apiRequest<{ message: string; user: unknown }>("updateUserProfile", {
    method: "PATCH",
    body: JSON.stringify(updates),
  })
}

export function searchUserByEmail(email: string) {
  return apiRequest<{
    userId: string
    displayName: string
    email: string
    photoURL: string | null
  }>(`searchUserByEmail?email=${encodeURIComponent(email)}`, { method: "GET" })
}

// ── Boards ────────────────────────────────────────────────────

export interface Board {
  boardId: string
  ownerId: string
  title: string
  description: string
  columns: string[]
  userRole: string
  createdAt: unknown
  updatedAt: unknown
}

export function createBoard(data: {
  title: string
  description?: string
  columns?: string[]
}) {
  return apiRequest<{ message: string; board: Board }>("createBoard", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function getBoards() {
  return apiRequest<{ boards: Board[] }>("getBoards", { method: "GET" })
}

export function getBoardById(boardId: string) {
  return apiRequest<{
    board: Board
    members: BoardMember[]
  }>(`getBoardById?boardId=${boardId}`, { method: "GET" })
}

export function updateBoard(data: {
  boardId: string
  title?: string
  description?: string
  columns?: string[]
}) {
  return apiRequest<{ message: string }>("updateBoard", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteBoard(boardId: string) {
  return apiRequest<{ message: string }>("deleteBoard", {
    method: "DELETE",
    body: JSON.stringify({ boardId }),
  })
}

export interface BoardMember {
  memberId: string
  userId: string
  role: string
  joinedAt: unknown
  displayName: string
  email: string
  photoURL: string | null
}

export function addBoardMember(data: {
  boardId: string
  email: string
  role?: string
}) {
  return apiRequest<{ message: string; member: BoardMember }>(
    "addBoardMember",
    { method: "POST", body: JSON.stringify(data) }
  )
}

export function removeBoardMember(boardId: string, userId: string) {
  return apiRequest<{ message: string }>("removeBoardMember", {
    method: "DELETE",
    body: JSON.stringify({ boardId, userId }),
  })
}

export function updateMemberRole(data: {
  boardId: string
  userId: string
  role: string
}) {
  return apiRequest<{ message: string }>("updateMemberRole", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

// ── Tasks ─────────────────────────────────────────────────────

export interface TaskData {
  taskId: string
  boardId: string
  createdBy: string
  assignedTo: string | null
  coEditors: string[]
  title: string
  description: string
  status: string
  columnIndex: number
  deadline: string | null
  color?: string
  createdAt: unknown
  updatedAt: unknown
}

export function createTask(data: {
  boardId: string
  title: string
  description?: string
  status?: string
  deadline?: string
  assignedTo?: string
  coEditors?: string[]
  color?: string
}) {
  return apiRequest<{ message: string; task: TaskData }>("createTask", {
    method: "POST",
    body: JSON.stringify(data),
  })
}

export function getTasksByBoard(boardId: string) {
  return apiRequest<{ tasks: TaskData[] }>(
    `getTasksByBoard?boardId=${boardId}`,
    { method: "GET" }
  )
}

export function updateTask(data: {
  taskId: string
  boardId: string
  title?: string
  description?: string
  deadline?: string | null
  assignedTo?: string | null
  coEditors?: string[]
  color?: string
}) {
  return apiRequest<{ message: string }>("updateTask", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function moveTask(data: {
  taskId: string
  boardId: string
  newStatus: string
  newColumnIndex?: number
}) {
  return apiRequest<{ message: string }>("moveTask", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

export function deleteTask(taskId: string, boardId: string) {
  return apiRequest<{ message: string }>("deleteTask", {
    method: "DELETE",
    body: JSON.stringify({ taskId, boardId }),
  })
}

export function assignTask(data: {
  taskId: string
  boardId: string
  assignedTo: string | null
}) {
  return apiRequest<{ message: string }>("assignTask", {
    method: "PATCH",
    body: JSON.stringify(data),
  })
}

// ── Attachments ───────────────────────────────────────────────

export interface Attachment {
  attachmentId: string
  taskId: string
  boardId: string
  uploadedBy: string
  fileName: string
  fileType: string
  fileSize: number
  storagePath: string
  storageURL: string
  createdAt: unknown
}

export async function uploadAttachment(
  boardId: string,
  taskId: string,
  file: File
): Promise<{ message: string; attachment: Attachment }> {
  const user = auth.currentUser
  if (!user) throw new Error("Session expired. Please sign in again.")

  let token: string
  try {
    token = await user.getIdToken()
  } catch {
    throw new Error("Session expired. Please sign in again.")
  }

  const formData = new FormData()
  formData.append("boardId", boardId)
  formData.append("taskId", taskId)
  formData.append("file", file)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/uploadAttachment`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
  } catch {
    throw new Error("Network error. Please check your connection and try again.")
  }

  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server returned an invalid response (${res.status})`)
  }

  if (!res.ok) throw new Error((data.error as string) || "Upload failed")
  return data as { message: string; attachment: Attachment }
}

export function getAttachmentsByTask(taskId: string, boardId: string) {
  return apiRequest<{ attachments: Attachment[] }>(
    `getAttachmentsByTask?taskId=${taskId}&boardId=${boardId}`,
    { method: "GET" }
  )
}

export function deleteAttachment(attachmentId: string, boardId: string) {
  return apiRequest<{ message: string }>("deleteAttachment", {
    method: "DELETE",
    body: JSON.stringify({ attachmentId, boardId }),
  })
}

// ── Activity Log ──────────────────────────────────────────────

export interface ActivityLogEntry {
  logId: string
  boardId: string
  userId: string
  userName: string
  action: string
  details: string
  taskId: string | null
  timestamp: unknown
}

export function getActivityLog(
  boardId: string,
  options?: { action?: string; limit?: number; startAfter?: string }
) {
  const params = new URLSearchParams({ boardId })
  if (options?.action) params.set("action", options.action)
  if (options?.limit) params.set("limit", String(options.limit))
  if (options?.startAfter) params.set("startAfter", options.startAfter)

  return apiRequest<{
    logs: ActivityLogEntry[]
    hasMore: boolean
    lastLogId: string | null
  }>(`getActivityLog?${params}`, { method: "GET" })
}
