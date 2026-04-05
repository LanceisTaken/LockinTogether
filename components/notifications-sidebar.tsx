"use client"

import { ArrowRight, Bell, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  useNotificationsRealtime,
  markNotificationRead,
  type Notification,
} from "@/lib/firebase/firestore"
import { moveTask } from "@/lib/api"

function formatTimestamp(ts: unknown): string {
  if (!ts) return ""
  const date =
    typeof (ts as { toDate?: () => Date }).toDate === "function"
      ? (ts as { toDate: () => Date }).toDate()
      : typeof (ts as { seconds?: number }).seconds === "number"
        ? new Date((ts as { seconds: number }).seconds * 1000)
        : new Date(ts as string)

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

interface NotificationsSidebarProps {
  userId: string
  /** Whether the current user can edit a given task (creator or co-editor) */
  canEditTask: (taskId: string) => boolean
}

export function NotificationsSidebar({ userId, canEditTask }: NotificationsSidebarProps) {
  const { notifications, loading } = useNotificationsRealtime(userId)

  const handleApprove = async (notification: Notification) => {
    try {
      await moveTask({
        taskId: notification.taskId,
        boardId: notification.boardId,
        newStatus: notification.requestedStatus,
      })
      await markNotificationRead(notification.id)
    } catch (err) {
      console.error("Failed to approve state change:", err)
    }
  }

  const handleDismiss = async (notificationId: string) => {
    await markNotificationRead(notificationId)
  }

  return (
    <div className="p-4">
      <h3 className="font-semibold text-sm text-slate-900 mb-3 flex items-center gap-2">
        <Bell className="w-4 h-4" />
        Notifications
      </h3>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No notifications
        </p>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border p-3 text-sm ${
                n.read ? "bg-white border-slate-200 opacity-60" : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 leading-snug">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimestamp(n.createdAt)}
                  </p>
                </div>
              </div>

              {!n.read && canEditTask(n.taskId) && (
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleApprove(n)}
                  >
                    <Check className="w-3 h-3" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleDismiss(n.id)}
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {!n.read && !canEditTask(n.taskId) && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleDismiss(n.id)}
                  >
                    Mark read
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
