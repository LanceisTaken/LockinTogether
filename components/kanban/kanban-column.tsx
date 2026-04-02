"use client"

import { Plus } from "lucide-react"
import { TaskCard, Task } from "./task-card"
import { cn } from "@/lib/utils"

interface TaskGroup {
  label?: string
  tasks: Task[]
}

interface KanbanColumnProps {
  title: string
  count?: string
  groups: TaskGroup[]
  onSubtaskToggle?: (taskId: string, subtaskId: string) => void
  onTaskUpdate?: (taskId: string, updates: Partial<Pick<Task, "title" | "description" | "deadline" | "attachments">>) => void
  onAddTask?: () => void
  onDragStart?: (e: React.DragEvent, taskId: string) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragOver?: boolean
}

export function KanbanColumn({
  title,
  count,
  groups,
  onSubtaskToggle,
  onTaskUpdate,
  onAddTask,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "kanban-column flex flex-col min-w-[280px] max-w-[320px] h-full rounded-xl border-2 transition-all bg-white border-slate-400",
        isDragOver && "shadow-lg"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="kanban-column-header relative min-h-[80px] px-3 pt-6 pb-5 border-b border-[var(--kanban-border)] bg-slate-100 text-[var(--kanban-header)]">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <h3 className="font-semibold text-slate-900 text-xl leading-tight">{title}</h3>
          {count && (
            <span className="text-xs font-medium text-slate-700">{count}</span>
          )}
        </div>
        <button
          onClick={onAddTask}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5 stroke-2" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-1 pb-3 pt-3">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex === 0 ? "mt-2" : ""}>
            {group.label && (
              <p className="text-xs font-medium text-muted-foreground mb-2 px-1">
                {group.label}
              </p>
            )}
            <div className="space-y-2">
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onSubtaskToggle={onSubtaskToggle}
                  onTaskUpdate={onTaskUpdate}
                  onDragStart={onDragStart}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
