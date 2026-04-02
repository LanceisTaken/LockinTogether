"use client"

import { useState } from "react"
import { Paperclip, MessageSquare, ListTodo, Trash2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
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

export type TaskColor = "blue" | "yellow" | "green" | "pink"

export interface Subtask {
  id: string
  title: string
  completed: boolean
}

export interface Task {
  id: string
  title: string
  color: TaskColor
  avatar: string
  description?: string
  deadline?: string
  attachments?: File[]
  hasAttachment?: boolean
  hasComments?: boolean
  hasSubtasks?: boolean
  subtasks?: Subtask[]
}

interface TaskCardProps {
  task: Task
  onSubtaskToggle?: (taskId: string, subtaskId: string) => void
  onTaskUpdate?: (
    taskId: string,
    updates: Partial<Pick<Task, "title" | "description" | "deadline" | "attachments">>
  ) => void
  onTaskDelete?: (taskId: string) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, taskId: string) => void
}

const colorClasses: Record<TaskColor, { bg: string; border: string }> = {
  blue: { bg: "bg-cyan-100", border: "border border-cyan-600" },
  yellow: { bg: "bg-amber-100", border: "border border-amber-600" },
  green: { bg: "bg-emerald-100", border: "border border-emerald-600" },
  pink: { bg: "bg-fuchsia-100", border: "border border-fuchsia-600" },
}

export function TaskCard({
  task,
  onSubtaskToggle,
  onTaskUpdate,
  onTaskDelete,
  draggable = true,
  onDragStart,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(task.hasSubtasks)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || "")
  const [deadline, setDeadline] = useState(task.deadline || "")
  const [attachments, setAttachments] = useState<File[]>(task.attachments || [])

  const colors = colorClasses[task.color]

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onTaskUpdate?.(task.id, { title, description, deadline, attachments })
    setIsDialogOpen(false)
  }

  const handleDelete = () => {
    onTaskDelete?.(task.id)
    setIsDialogOpen(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files)
      setAttachments(filesArray)
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div
          draggable={draggable}
          onDragStart={(e) => onDragStart?.(e, task.id)}
          className={cn(
            "rounded-lg p-3 cursor-grab active:cursor-grabbing transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5 animate-fade-in-up",
            colors.bg,
            colors.border
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-black leading-snug flex-1">
              {task.title}
            </p>
            <img
              src={task.avatar}
              alt="User"
              className="w-7 h-7 rounded-full object-cover shrink-0"
            />
          </div>

          {(task.hasAttachment || task.hasComments || task.hasSubtasks) && (
            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
              {task.hasSubtasks && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded(!expanded)
                  }}
                  className="hover:text-foreground transition-colors"
                >
                  <ListTodo className="w-4 h-4" />
                </button>
              )}
              {task.hasAttachment && <Paperclip className="w-4 h-4" />}
              {task.hasComments && <MessageSquare className="w-4 h-4" />}
            </div>
          )}

          {expanded && task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-dashed border-muted-foreground/30 space-y-2">
              {task.subtasks.map((subtask) => (
                <label
                  key={subtask.id}
                  className="flex items-center gap-2 text-sm cursor-pointer group"
                >
                  <Checkbox
                    checked={subtask.completed}
                    onCheckedChange={() =>
                      onSubtaskToggle?.(task.id, subtask.id)
                    }
                    className="w-4 h-4"
                  />
                  <span
                    className={cn(
                      "text-black transition-colors",
                      subtask.completed &&
                        "line-through text-muted-foreground"
                    )}
                  >
                    {subtask.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Update task details and save changes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Deadline</label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {/* Custom File Upload */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Attachments</label>

            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id={`file-upload-${task.id}`}
            />

            <label
              htmlFor={`file-upload-${task.id}`}
              className="inline-flex items-center gap-2 px-45.5 py-2 text-sm border rounded-md cursor-pointer transition-all duration-200 hover:bg-muted hover:border-slate-400 hover:shadow-sm active:scale-95"
            >
              📎 Upload Files
            </label>

            {attachments.length > 0 && (
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                {attachments.map((file, index) => (
                  <div key={index} className="truncate">
                    📎 {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            {/* Delete — red glow + lift */}
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              className="flex items-center gap-2 transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_14px_3px_rgba(239,68,68,0.5)] hover:-translate-y-0.5 active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>

            <div className="flex gap-2">
              {/* Cancel — lift + border + bg tint */}
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className="transition-all duration-200 hover:bg-blue-600 hover:text-white hover:shadow-[0_0_14px_3px_rgba(37,99,235,0.45)] hover:-translate-y-0.5 active:scale-95"
                >
                  Cancel
                </Button>
              </DialogClose>

              {/* Save Changes — blue fill + glow + lift */}
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
      </DialogContent>
    </Dialog>
  )
}