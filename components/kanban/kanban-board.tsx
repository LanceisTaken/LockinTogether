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
import {
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  type TaskData,
  type BoardMember,
} from "@/lib/api"

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
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState("")

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
        deadline: newDeadline || undefined,
        assignedTo: newAssignee || undefined,
        coEditors: newCoEditors.length > 0 ? newCoEditors : undefined,
        // No status — backend defaults to first column (To-Do)
      })
      setNewTitle("")
      setNewDescription("")
      setNewDeadline("")
      setNewAssignee("")
      setNewCoEditors([])
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
    }
  ) => {
    try {
      await updateTask({ taskId, boardId, ...updates })
    } catch (err) {
      console.error("Failed to update task:", err)
    }
  }

  const handleTaskDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId, boardId)
    } catch (err) {
      console.error("Failed to delete task:", err)
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
        console.error("Failed to move task:", err)
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
