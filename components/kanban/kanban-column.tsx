"use client"

import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface KanbanColumnProps {
  title: string
  taskCount: number
  children: ReactNode
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragOver?: boolean
}

export function KanbanColumn({
  title,
  taskCount,
  children,
  onDragOver,
  onDrop,
  isDragOver,
}: KanbanColumnProps) {
  return (
    <div
      className={cn(
        "kanban-column flex flex-col min-w-[280px] max-w-[320px] h-full rounded-xl border-2 transition-all bg-white border-slate-400",
        isDragOver && "shadow-lg border-primary/50"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="kanban-column-header min-h-[80px] px-3 pt-6 pb-5 border-b border-[var(--kanban-border)] bg-slate-100 text-[var(--kanban-header)] flex flex-col items-center justify-center gap-1">
        <h3 className="font-semibold text-slate-900 text-xl leading-tight">{title}</h3>
        <span className="text-xs font-medium text-slate-700">{taskCount} {taskCount === 1 ? "task" : "tasks"}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 px-1 pb-3 pt-3">
        {children}
      </div>
    </div>
  )
}
