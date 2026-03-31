"use client"

import { useState } from "react"
import { Paperclip, MessageSquare, ListTodo } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

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
  hasAttachment?: boolean
  hasComments?: boolean
  hasSubtasks?: boolean
  subtasks?: Subtask[]
}

interface TaskCardProps {
  task: Task
  onSubtaskToggle?: (taskId: string, subtaskId: string) => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, taskId: string) => void
}

const colorClasses: Record<TaskColor, { bg: string; border: string }> = {
  blue: { bg: "bg-[var(--task-blue)]", border: "border-l-[var(--task-blue-border)]" },
  yellow: { bg: "bg-[var(--task-yellow)]", border: "border-l-[var(--task-yellow-border)]" },
  green: { bg: "bg-[var(--task-green)]", border: "border-l-[var(--task-green-border)]" },
  pink: { bg: "bg-[var(--task-pink)]", border: "border-l-[var(--task-pink-border)]" },
}

export function TaskCard({ task, onSubtaskToggle, draggable = true, onDragStart }: TaskCardProps) {
  const [expanded, setExpanded] = useState(task.hasSubtasks)
  const colors = colorClasses[task.color]

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, task.id)}
      className={cn(
        "rounded-lg border-l-4 p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md",
        colors.bg,
        colors.border
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">{task.title}</p>
        <img
          src={task.avatar}
          alt="Assignee"
          className="w-7 h-7 rounded-full object-cover flex-shrink-0"
        />
      </div>

      {(task.hasAttachment || task.hasComments || task.hasSubtasks) && (
        <div className="flex items-center gap-2 mt-2 text-muted-foreground">
          {task.hasSubtasks && (
            <button
              onClick={() => setExpanded(!expanded)}
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
                onCheckedChange={() => onSubtaskToggle?.(task.id, subtask.id)}
                className="w-4 h-4"
              />
              <span
                className={cn(
                  "group-hover:text-foreground transition-colors",
                  subtask.completed && "line-through text-muted-foreground"
                )}
              >
                {subtask.title}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
