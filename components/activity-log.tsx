"use client"

import { useActivityLogRealtime } from "@/lib/firebase/firestore"
import { Spinner } from "@/components/ui/spinner"
import {
  PlusCircle,
  ArrowRight,
  Edit3,
  Trash2,
  UserPlus,
  UserMinus,
  Paperclip,
  Settings,
  Activity,
} from "lucide-react"

const ACTION_ICONS: Record<string, typeof Activity> = {
  task_created: PlusCircle,
  task_moved: ArrowRight,
  task_edited: Edit3,
  task_deleted: Trash2,
  task_assigned: UserPlus,
  task_unassigned: UserMinus,
  member_added: UserPlus,
  member_removed: UserMinus,
  role_changed: Settings,
  board_created: PlusCircle,
  board_updated: Edit3,
  file_uploaded: Paperclip,
  file_deleted: Trash2,
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return ""
  // Firestore Timestamp has a toDate() method; plain objects have seconds
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

interface ActivityLogProps {
  boardId: string
}

export function ActivityLog({ boardId }: ActivityLogProps) {
  const { logs, loading, error } = useActivityLogRealtime(boardId, 30)

  return (
    <div className="p-4">
      <h3 className="font-semibold text-sm text-slate-900 mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Activity Log
      </h3>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 text-center py-8">{error}</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No activity yet
        </p>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const Icon = ACTION_ICONS[log.action] || Activity
            return (
              <div
                key={log.logId}
                className="flex gap-2 text-sm"
              >
                <div className="mt-0.5 shrink-0">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-700 leading-snug">{log.details}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatTimestamp(log.timestamp)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
