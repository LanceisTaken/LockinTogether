"use client"

import { useState } from "react"
import { KanbanColumn } from "./kanban-column"
import { TaskCard } from "./task-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog"
import { PlusCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  type TaskData,
  type BoardMember,
} from "@/lib/api"
import { TASK_COLORS, TASK_COLOR_KEYS } from "./task-card"

export interface KanbanBoardProps {
  boardId: string
  columns: string[]
  tasks: TaskData[]
  members: BoardMember[]
  currentUserId: string
}

export function KanbanBoard({ boardId, columns, tasks, members, currentUserId }: KanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragSourceColumn, setDragSourceColumn] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  // Create task dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newDeadline, setNewDeadline] = useState("")
  const [newAssignee, setNewAssignee] = useState("")
  const [newCoEditors, setNewCoEditors] = useState<string[]>([])
  const [newColor, setNewColor] = useState("cyan")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [boardError, setBoardError] = useState("")

  const tasksByColumn = (columnName: string) =>
    tasks
      .filter((t) => t.status === columnName)
      .sort((a, b) => a.columnIndex - b.columnIndex)

  const getMemberInfo = (userId: string | null) =>
    members.find((m) => m.userId === userId)

  const canEditTask = (task: TaskData) =>
    task.createdBy === currentUserId ||
    (task.coEditors && task.coEditors.includes(currentUserId))

  // ── Create Task ──────────────────────────────────────────

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError("")
    setIsCreating(true)
    try {
      await createTask({
        boardId,
        title: newTitle,
        description: newDescription || undefined,
        status: columns[0], // Always default to first column (e.g. "To-Do")
        deadline: newDeadline || undefined,
        assignedTo: newAssignee || undefined,
        coEditors: newCoEditors.length > 0 ? newCoEditors : undefined,
        color: newColor,
      })
      setNewTitle("")
      setNewDescription("")
      setNewDeadline("")
      setNewAssignee("")
      setNewCoEditors([])
      setNewColor("cyan")
      setCreateOpen(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create task")
    } finally {
      setIsCreating(false)
    }
  }

  // ── Task Actions ─────────────────────────────────────────

  const handleTaskUpdate = async (
    taskId: string,
    updates: {
      title?: string
      description?: string
      deadline?: string | null
      coEditors?: string[]
      color?: string
    }
  ) => {
    setBoardError("")
    try {
      await updateTask({ taskId, boardId, ...updates })
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Failed to update task")
    }
  }

  const handleTaskDelete = async (taskId: string) => {
    setBoardError("")
    try {
      await deleteTask(taskId, boardId)
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : "Failed to delete task")
    }
  }

  // ── Drag & Drop (only for creators/co-editors) ──────────

  const handleDragStart = (e: React.DragEvent, taskId: string, sourceColumn: string) => {
    const task = tasks.find((t) => t.taskId === taskId)
    if (!task || !canEditTask(task)) {
      e.preventDefault()
      return
    }
    setDraggedTaskId(taskId)
    setDragSourceColumn(sourceColumn)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, columnName: string) => {
    e.preventDefault()
    setDragOverColumn(columnName)
  }

  const handleDrop = async (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault()
    if (!draggedTaskId) return

    const targetTasks = tasksByColumn(targetColumn)
    const newColumnIndex = targetTasks.length

    if (dragSourceColumn !== targetColumn) {
      try {
        await moveTask({
          taskId: draggedTaskId,
          boardId,
          newStatus: targetColumn,
          newColumnIndex,
        })
      } catch (err) {
        setBoardError(err instanceof Error ? err.message : "Failed to move task")
      }
    }

    setDraggedTaskId(null)
    setDragSourceColumn(null)
    setDragOverColumn(null)
  }

  const toggleCoEditor = (userId: string) => {
    setNewCoEditors((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    )
  }

  return (
    <>
      {boardError && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{boardError}</span>
          <button onClick={() => setBoardError("")} className="ml-4 font-medium hover:text-red-800">Dismiss</button>
        </div>
      )}
      <div className="flex gap-4 p-6 overflow-x-auto min-h-[calc(100vh-80px)]">
        {columns.map((columnName) => {
          const columnTasks = tasksByColumn(columnName)
          return (
            <KanbanColumn
              key={columnName}
              title={columnName}
              taskCount={columnTasks.length}
              onDragOver={(e) => handleDragOver(e, columnName)}
              onDrop={(e) => handleDrop(e, columnName)}
              isDragOver={dragOverColumn === columnName}
            >
              {columnTasks.map((task) => {
                const assignee = getMemberInfo(task.assignedTo)
                return (
                  <TaskCard
                    key={task.taskId}
                    task={task}
                    assignee={assignee}
                    boardId={boardId}
                    members={members}
                    columns={columns}
                    currentUserId={currentUserId}
                    canEdit={canEditTask(task)}
                    onTaskUpdate={handleTaskUpdate}
                    onTaskDelete={handleTaskDelete}
                    onDragStart={(e) => handleDragStart(e, task.taskId, columnName)}
                  />
                )
              })}
            </KanbanColumn>
          )
        })}
      </div>

      {/* Floating Create Task button — bottom left */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <button
          onClick={() => setCreateOpen(true)}
          className="fixed bottom-8 left-8 flex items-center gap-2 bg-primary text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 active:scale-95 z-50"
        >
          <PlusCircle className="w-5 h-5" />
          <span className="font-medium">Create Task</span>
        </button>

        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              New tasks are added to the first column ({columns[0] || "To-Do"}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                placeholder="Task title"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Deadline</label>
              <Input
                type="date"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Assign to</label>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Co-editors (can edit this task)</label>
              <div className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-input p-2">
                {members
                  .filter((m) => m.userId !== currentUserId)
                  .map((m) => (
                    <label
                      key={m.userId}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-1 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={newCoEditors.includes(m.userId)}
                        onChange={() => toggleCoEditor(m.userId)}
                        className="rounded"
                      />
                      {m.displayName || m.email}
                    </label>
                  ))}
                {members.filter((m) => m.userId !== currentUserId).length === 0 && (
                  <p className="text-xs text-muted-foreground">No other members to add.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                {TASK_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setNewColor(key)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all",
                      TASK_COLORS[key].swatch,
                      newColor === key
                        ? "ring-2 ring-offset-2 ring-slate-900 scale-110"
                        : "hover:scale-110"
                    )}
                    title={TASK_COLORS[key].label}
                  />
                ))}
              </div>
            </div>

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
