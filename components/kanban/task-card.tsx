"use client"

import { useEffect, useState } from "react"
import { Paperclip, Trash2, Download, X, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  uploadAttachment,
  getAttachmentsByTask,
  deleteAttachment,
  assignTask,
  moveTask,
  type TaskData,
  type BoardMember,
  type Attachment,
} from "@/lib/api"
import { sendNotification } from "@/lib/firebase/firestore"

/** Safely parse a date that could be a Firestore Timestamp, ISO string, or Date */
function parseDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate()
  }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000)
  }
  const d = new Date(value as string | number)
  return isNaN(d.getTime()) ? null : d
}

export const TASK_COLORS: Record<string, { bg: string; border: string; label: string; swatch: string }> = {
  cyan:    { bg: "bg-cyan-100",    border: "border-cyan-600",    label: "Cyan",    swatch: "bg-cyan-400" },
  amber:   { bg: "bg-amber-100",   border: "border-amber-600",   label: "Amber",   swatch: "bg-amber-400" },
  emerald: { bg: "bg-emerald-100", border: "border-emerald-600", label: "Emerald", swatch: "bg-emerald-400" },
  fuchsia: { bg: "bg-fuchsia-100", border: "border-fuchsia-600", label: "Fuchsia", swatch: "bg-fuchsia-400" },
  blue:    { bg: "bg-blue-100",    border: "border-blue-600",    label: "Blue",    swatch: "bg-blue-400" },
  rose:    { bg: "bg-rose-100",    border: "border-rose-600",    label: "Rose",    swatch: "bg-rose-400" },
}

export const TASK_COLOR_KEYS = Object.keys(TASK_COLORS)

function getTaskColor(task: TaskData) {
  const key = task.color && TASK_COLORS[task.color] ? task.color : "cyan"
  return TASK_COLORS[key]
}

interface TaskCardProps {
  task: TaskData
  assignee?: BoardMember
  boardId: string
  members: BoardMember[]
  columns: string[]
  currentUserId: string
  canEdit: boolean
  onTaskUpdate: (
    taskId: string,
    updates: {
      title?: string
      description?: string
      deadline?: string | null
      coEditors?: string[]
      color?: string
    }
  ) => void
  onTaskDelete: (taskId: string) => void
  onDragStart: (e: React.DragEvent) => void
}

export function TaskCard({
  task,
  assignee,
  boardId,
  members,
  columns,
  currentUserId,
  canEdit,
  onTaskUpdate,
  onTaskDelete,
  onDragStart,
}: TaskCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [deadline, setDeadline] = useState(
    task.deadline ? (parseDate(task.deadline)?.toISOString().split("T")[0] ?? "") : ""
  )
  const [selectedAssignee, setSelectedAssignee] = useState(task.assignedTo || "")
  const [selectedStatus, setSelectedStatus] = useState(task.status)
  const [coEditors, setCoEditors] = useState<string[]>(task.coEditors || [])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const [actionError, setActionError] = useState("")

  // State change request (for non-editors)
  const [requestStatus, setRequestStatus] = useState("")
  const [requestSent, setRequestSent] = useState(false)

  const isAssigned = task.assignedTo === currentUserId
  const colors = getTaskColor(task)
  const [selectedColor, setSelectedColor] = useState(task.color || "cyan")

  useEffect(() => {
    if (isDialogOpen) {
      getAttachmentsByTask(task.taskId, boardId)
        .then((data) => setAttachments(data.attachments))
        .catch((err) => setActionError(err instanceof Error ? err.message : "Failed to load attachments"))
    }
  }, [isDialogOpen, task.taskId, boardId])

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description || "")
    setDeadline(
      task.deadline ? (parseDate(task.deadline)?.toISOString().split("T")[0] ?? "") : ""
    )
    setSelectedAssignee(task.assignedTo || "")
    setSelectedStatus(task.status)
    setCoEditors(task.coEditors || [])
    setSelectedColor(task.color || "cyan")
    setRequestSent(false)
  }, [task])

  // ── Creator/Co-editor: Save all changes ─────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError("")

    onTaskUpdate(task.taskId, {
      title,
      description,
      deadline: deadline || null,
      coEditors,
      color: selectedColor,
    })

    // Handle assignee change
    if (selectedAssignee !== (task.assignedTo || "")) {
      try {
        await assignTask({
          taskId: task.taskId,
          boardId,
          assignedTo: selectedAssignee || null,
        })
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to assign task")
        return
      }
    }

    // Handle status change
    if (selectedStatus !== task.status) {
      try {
        await moveTask({
          taskId: task.taskId,
          boardId,
          newStatus: selectedStatus,
        })
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to move task")
        return
      }
    }

    setIsDialogOpen(false)
  }

  const handleDelete = () => {
    onTaskDelete(task.taskId)
    setIsDialogOpen(false)
  }

  // ── Assigned member: Request state change ───────────────

  const handleRequestStateChange = async () => {
    if (!requestStatus || requestStatus === task.status) return
    setActionError("")

    const senderMember = members.find((m) => m.userId === currentUserId)
    const senderName = senderMember?.displayName || senderMember?.email || "A member"

    try {
    // Send to creator
    await sendNotification({
      recipientId: task.createdBy,
      senderId: currentUserId,
      senderName,
      boardId,
      taskId: task.taskId,
      taskTitle: task.title,
      type: "state_change_request",
      requestedStatus: requestStatus,
      message: `${senderName} requests to move "${task.title}" to "${requestStatus}"`,
    })

    // Also notify co-editors
    if (task.coEditors) {
      for (const editorId of task.coEditors) {
        if (editorId !== currentUserId) {
          await sendNotification({
            recipientId: editorId,
            senderId: currentUserId,
            senderName,
            boardId,
            taskId: task.taskId,
            taskTitle: task.title,
            type: "state_change_request",
            requestedStatus: requestStatus,
            message: `${senderName} requests to move "${task.title}" to "${requestStatus}"`,
          })
        }
      }
    }

    setRequestSent(true)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to send request")
    }
  }

  // ── File handling ───────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    setIsUploading(true)
    setActionError("")
    try {
      for (const file of Array.from(e.target.files)) {
        const result = await uploadAttachment(boardId, task.taskId, file)
        setAttachments((prev) => [result.attachment, ...prev])
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
      e.target.value = ""
    }
  }

  const handleDeleteAttachment = async (attachmentId: string) => {
    setActionError("")
    try {
      await deleteAttachment(attachmentId, boardId)
      setAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete attachment")
    }
  }

  const toggleCoEditor = (userId: string) => {
    setCoEditors((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  const initials = assignee
    ? (assignee.displayName || assignee.email || "?")[0].toUpperCase()
    : null

  const creatorMember = members.find((m) => m.userId === task.createdBy)

  // Check if task is overdue: has a deadline, deadline has passed, and not in the last column (Done)
  const lastColumn = columns[columns.length - 1]
  const deadlineDate = parseDate(task.deadline)
  const isOverdue =
    deadlineDate &&
    task.status !== lastColumn &&
    deadlineDate.getTime() < Date.now()

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div
          draggable={canEdit}
          onDragStart={onDragStart}
          className={cn(
            "rounded-lg p-3 transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5 animate-fade-in-up border",
            canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            isOverdue
              ? "bg-red-100 border-red-500"
              : cn(colors.bg, colors.border)
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-black leading-snug flex-1">
              {task.title}
            </p>
            {initials && (
              <div
                className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary shrink-0"
                title={assignee?.displayName || assignee?.email}
              >
                {initials}
              </div>
            )}
          </div>
          {task.deadline && (
            <p className={cn(
              "text-xs mt-1",
              isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
            )}>
              {isOverdue ? "Overdue: " : "Due: "}
              {parseDate(task.deadline)?.toLocaleDateString() ?? ""}
            </p>
          )}
          {!canEdit && isAssigned && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" /> View only
            </div>
          )}
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{canEdit ? "Edit Task" : "Task Details"}</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Update task details, status, and co-editors."
              : `Created by ${creatorMember?.displayName || creatorMember?.email || "Unknown"}. You can request a status change.`}
          </DialogDescription>
        </DialogHeader>

        {canEdit ? (
          /* ── Full edit form for creator/co-editors ── */
          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {columns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Assign to</label>
              <select
                value={selectedAssignee}
                onChange={(e) => setSelectedAssignee(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.email} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Co-editors</label>
              <div className="max-h-28 overflow-y-auto space-y-1 rounded-md border border-input p-2">
                {members
                  .filter((m) => m.userId !== task.createdBy)
                  .map((m) => (
                    <label
                      key={m.userId}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={coEditors.includes(m.userId)}
                        onChange={() => toggleCoEditor(m.userId)}
                        className="rounded"
                      />
                      {m.displayName || m.email}
                    </label>
                  ))}
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                {TASK_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedColor(key)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      TASK_COLORS[key].swatch,
                      selectedColor === key
                        ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                        : "hover:scale-110"
                    )}
                    title={TASK_COLORS[key].label}
                  />
                ))}
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Attachments</label>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id={`file-upload-${task.taskId}`}
              />
              <label
                htmlFor={`file-upload-${task.taskId}`}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 text-sm border rounded-md cursor-pointer transition-all duration-200 hover:bg-muted hover:border-slate-400 hover:shadow-sm active:scale-95",
                  isUploading && "opacity-50 pointer-events-none"
                )}
              >
                <Paperclip className="w-4 h-4" />
                {isUploading ? "Uploading..." : "Upload Files"}
              </label>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((att) => (
                    <div
                      key={att.attachmentId}
                      className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1"
                    >
                      <span className="truncate flex-1">{att.fileName}</span>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <a
                          href={att.storageURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.attachmentId)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}

            <DialogFooter className="flex justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                className="flex items-center gap-2 transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_14px_3px_rgba(239,68,68,0.5)] hover:-translate-y-0.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">Cancel</Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="secondary"
                  className="transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-[0_0_14px_3px_rgba(37,99,235,0.45)] hover:-translate-y-0.5 active:scale-95"
                >
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          /* ── Read-only view for assigned members / others ── */
          <div className="space-y-4 mt-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Title</p>
              <p className="text-sm">{task.title}</p>
            </div>
            {task.description && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Description</p>
                <p className="text-sm">{task.description}</p>
              </div>
            )}
            <div className="flex gap-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <p className="text-sm">{task.status}</p>
              </div>
              {task.deadline && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Deadline</p>
                  <p className="text-sm">{parseDate(task.deadline)?.toLocaleDateString() ?? ""}</p>
                </div>
              )}
            </div>
            {assignee && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Assigned to</p>
                <p className="text-sm">{assignee.displayName || assignee.email}</p>
              </div>
            )}

            {/* Attachments (view-only) */}
            {attachments.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Attachments</p>
                <div className="space-y-1">
                  {attachments.map((att) => (
                    <div
                      key={att.attachmentId}
                      className="flex items-center text-sm bg-muted rounded px-2 py-1"
                    >
                      <Paperclip className="w-3.5 h-3.5 mr-1 shrink-0 text-muted-foreground" />
                      <a
                        href={att.storageURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate hover:underline text-primary"
                      >
                        {att.fileName}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Request state change (assigned members only) */}
            {actionError && (
              <p className="text-sm text-red-600">{actionError}</p>
            )}

            {isAssigned && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Request status change</p>
                {requestSent ? (
                  <p className="text-sm text-emerald-600">Request sent to the task creator.</p>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={requestStatus}
                      onChange={(e) => setRequestStatus(e.target.value)}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select status...</option>
                      {columns
                        .filter((col) => col !== task.status)
                        .map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!requestStatus}
                      onClick={handleRequestStateChange}
                    >
                      Request
                    </Button>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Close</Button>
              </DialogClose>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
