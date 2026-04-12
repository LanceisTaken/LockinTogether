"use client"

import { useEffect, useState } from "react"
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "./config"
import type { TaskData, BoardMember } from "@/lib/api"

/**
 * Real-time listener for all tasks belonging to a board.
 * Uses Firestore onSnapshot so the UI updates instantly when
 * any user creates, moves, edits, or deletes a task.
 */
export function useTasksRealtime(boardId: string | null) {
  const [tasks, setTasks] = useState<TaskData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const q = query(
      collection(db, "tasks"),
      where("boardId", "==", boardId),
      orderBy("status"),
      orderBy("columnIndex")
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const result: TaskData[] = snapshot.docs.map((d) => ({
          taskId: d.id,
          ...(d.data() as Omit<TaskData, "taskId">),
        }))
        setTasks(result)
        setLoading(false)
      },
      (err) => {
        console.error("Tasks realtime error:", err)
        setError("Failed to load tasks. Please refresh the page.")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [boardId])

  return { tasks, loading, error }
}

/**
 * Real-time listener for board members.
 * Fires when members are added/removed/role-changed.
 */
export function useBoardMembersRealtime(boardId: string | null) {
  const [members, setMembers] = useState<BoardMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId) {
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const q = query(
      collection(db, "boardMembers"),
      where("boardId", "==", boardId)
    )

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const result: BoardMember[] = await Promise.all(
          snapshot.docs.map(async (d) => {
            const data = d.data()
            // Enrich with user profile data
            let displayName = data.displayName || ""
            let email = data.email || ""
            let photoURL = data.photoURL || null

            if (!displayName && !email) {
              try {
                const userDoc = await getDoc(doc(db, "users", data.userId))
                if (userDoc.exists()) {
                  const userData = userDoc.data()
                  displayName = userData.displayName || ""
                  email = userData.email || ""
                  photoURL = userData.photoURL || null
                }
              } catch (err) {
                console.warn(`Failed to enrich member profile for userId=${data.userId}:`, err)
              }
            }

            return {
              memberId: data.memberId,
              userId: data.userId,
              role: data.role,
              joinedAt: data.joinedAt,
              displayName,
              email,
              photoURL,
            }
          })
        )
        setMembers(result)
        setLoading(false)
      },
      (err) => {
        console.error("Board members realtime error:", err)
        setError("Failed to load members. Please refresh the page.")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [boardId])

  return { members, loading, error }
}

/**
 * Real-time listener for a single board document.
 * Fires when the board title, description, or columns change.
 */
export function useBoardRealtime(boardId: string | null) {
  const [board, setBoard] = useState<{
    boardId: string
    ownerId: string
    title: string
    description: string
    columns: string[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId) {
      setBoard(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const unsubscribe = onSnapshot(
      doc(db, "boards", boardId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          setBoard({
            boardId: snapshot.id,
            ownerId: data.ownerId,
            title: data.title,
            description: data.description || "",
            columns: data.columns || [],
          })
        } else {
          setBoard(null)
        }
        setLoading(false)
      },
      (err) => {
        console.error("Board realtime error:", err)
        setError("Failed to load board. Please refresh the page.")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [boardId])

  return { board, loading, error }
}

/**
 * Real-time listener for activity log entries on a board.
 */
export function useActivityLogRealtime(boardId: string | null, limit = 20) {
  const [logs, setLogs] = useState<
    {
      logId: string
      boardId: string
      userId: string
      action: string
      details: string
      taskId: string | null
      timestamp: unknown
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!boardId) {
      setLogs([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const q = query(
      collection(db, "activityLog"),
      where("boardId", "==", boardId),
      orderBy("timestamp", "desc")
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const result = snapshot.docs.slice(0, limit).map((d) => ({
          logId: d.id,
          ...(d.data() as {
            boardId: string
            userId: string
            action: string
            details: string
            taskId: string | null
            timestamp: unknown
          }),
        }))
        setLogs(result)
        setLoading(false)
      },
      (err) => {
        console.error("Activity log realtime error:", err)
        setError("Failed to load activity log.")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [boardId, limit])

  return { logs, loading, error }
}

// ── Notifications ─────────────────────────────────────────────

export interface Notification {
  id: string
  recipientId: string
  senderId: string
  senderName: string
  boardId: string
  boardTitle?: string
  taskId?: string
  taskTitle?: string
  type: "state_change_request" | "board_invite"
  requestedStatus?: string
  inviteRole?: string
  message: string
  read: boolean
  createdAt: unknown
}

/**
 * Send a notification to a user (writes directly to Firestore).
 */
export async function sendNotification(data: {
  recipientId: string
  senderId: string
  senderName: string
  boardId: string
  boardTitle?: string
  taskId?: string
  taskTitle?: string
  type: "state_change_request" | "board_invite"
  requestedStatus?: string
  inviteRole?: string
  message: string
}) {
  await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  })
}

/**
 * Mark a notification as read.
 */
export async function markNotificationRead(notificationId: string) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true })
}

/**
 * Real-time listener for notifications for the current user.
 */
export function useNotificationsRealtime(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const q = query(
      collection(db, "notifications"),
      where("recipientId", "==", userId),
      orderBy("createdAt", "desc")
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const result: Notification[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Notification, "id">),
        }))
        setNotifications(result)
        setLoading(false)
      },
      (err) => {
        console.error("Notifications realtime error:", err)
        setError("Failed to load notifications.")
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, loading, error }
}
