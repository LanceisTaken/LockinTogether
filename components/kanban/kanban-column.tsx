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
  onAddTask,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "flex flex-col min-w-[280px] max-w-[320px] h-full rounded-xl transition-colors",
        isDragOver && "bg-primary/5"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {count && (
            <span className="text-sm text-muted-foreground">{count}</span>
          )}
        </div>
        <button
          onClick={onAddTask}
          className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 px-1">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex}>
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
