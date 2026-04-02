"use client"

import { useState } from "react"
import { KanbanColumn } from "./kanban-column"
import { Task, TaskColor } from "./task-card"

// Avatar URLs for demo
const avatars = {
  alex: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex&backgroundColor=b6e3f4",
  sarah: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah&backgroundColor=ffd5dc",
  mike: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mike&backgroundColor=c0aede",
  emma: "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma&backgroundColor=d1d4f9",
}

export interface Column {
  id: string
  title: string
  count?: string
  tasks: Task[]
}

export const initialColumns: Column[] = [
  {
    id: "todo",
    title: "To-do",
    tasks: [
      { id: "1", title: "Review and update sales pitch for new product", color: "blue", avatar: avatars.alex },
      { id: "2", title: "Pay employee salaries", color: "blue", avatar: avatars.mike, hasAttachment: true },
      { id: "3", title: "Design marketing campaign", color: "yellow", avatar: avatars.sarah },
      { id: "4", title: "Experiment with AR/VR in app", color: "green", avatar: avatars.alex },
      { id: "5", title: "Update employee handbook with remote work policies", color: "blue", avatar: avatars.emma },
      { id: "6", title: "Coordinate with influencers for upcoming promotional event", color: "yellow", avatar: avatars.sarah },
      { id: "7", title: "Implement 2FA for all systems", color: "blue", avatar: avatars.mike },
      { id: "8", title: "Analyze ROI from recent investments", color: "blue", avatar: avatars.alex },
      { id: "9", title: "Develop strategy for re-engaging past customers", color: "blue", avatar: avatars.sarah },
    ],
  },
  {
    id: "this-week",
    title: "This week",
    tasks: [
      { id: "10", title: "Prepare and send out client invoices", color: "blue", avatar: avatars.alex },
      { id: "11", title: "Research market trends", color: "yellow", avatar: avatars.sarah, hasAttachment: true, hasComments: true },
      { id: "12", title: "Add AI chatbot for support", color: "green", avatar: avatars.mike },
      { id: "13", title: "Customer reported performance issue", color: "yellow", avatar: avatars.sarah },
      { id: "14", title: "Shortlist candidates for interviews", color: "green", avatar: avatars.emma },
    ],
  },
  {
    id: "in-progress",
    title: "In progress",
    count: "3 / 5",
    tasks: [
      { id: "15", title: "Organize team-building event", color: "green", avatar: avatars.emma },
      { id: "16", title: "Review data pipelines for AI model training", color: "green", avatar: avatars.alex },
      {
        id: "17",
        title: "Plan exhibition for upcoming trade show",
        color: "pink",
        avatar: avatars.sarah,
        hasSubtasks: true,
        hasAttachment: true,
        subtasks: [
          { id: "s1", title: "Decide overall budget", completed: true },
          { id: "s2", title: "Agree on booth size and location", completed: true },
          { id: "s3", title: "Order brochures, flyers and popups", completed: false },
          { id: "s4", title: "Promote event on social media", completed: false },
          { id: "s5", title: "Train staff for product demos", completed: false },
        ],
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    tasks: [
      { id: "18", title: "Evaluate sales tools", color: "pink", avatar: avatars.emma },
      { id: "19", title: "Prototype voice-activated features", color: "green", avatar: avatars.alex },
      { id: "20", title: "Company website is down", color: "pink", avatar: avatars.sarah },
      { id: "21", title: "Establish mentorship program for junior staff", color: "green", avatar: avatars.emma },
      { id: "22", title: "Test compatibility on various devices", color: "green", avatar: avatars.alex },
      { id: "23", title: "Review monthly expenditure against budget", color: "pink", avatar: avatars.mike },
    ],
  },
]

// Date labels for Done column
const doneDateLabels = [
  { taskIds: ["18"], label: "Today" },
  { taskIds: ["19", "20"], label: "Yesterday" },
  { taskIds: ["21"], label: "Monday, 4 September" },
  { taskIds: ["22", "23"], label: "Friday, 1 September" },
]

interface KanbanBoardProps {
  columns?: Column[]
  onColumnsChange?: React.Dispatch<React.SetStateAction<Column[]>>
}

export function KanbanBoard({ columns: columnsProp, onColumnsChange }: KanbanBoardProps = {}) {
  const [localColumns, setLocalColumns] = useState<Column[]>(initialColumns)
  const columns = columnsProp ?? localColumns
  const setColumns = onColumnsChange ?? setLocalColumns
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null)

  const handleSubtaskToggle = (taskId: string, subtaskId: string) => {
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) => {
          if (task.id === taskId && task.subtasks) {
            return {
              ...task,
              subtasks: task.subtasks.map((subtask) =>
                subtask.id === subtaskId
                  ? { ...subtask, completed: !subtask.completed }
                  : subtask
              ),
            }
          }
          return task
        }),
      }))
    )
  }

  const handleTaskUpdate = (
    taskId: string,
    updates: Partial<Pick<Task, "title" | "description" | "deadline" | "attachments">>
  ) => {
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        tasks: column.tasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task
        ),
      }))
    )

    // Send to Firebase Cloud Function
    fetch("/api/task/update-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, updates }),
    }).catch((error) => {
      console.error("Real-time update failed", error)
    })
  }

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    setDragOverColumn(columnId)
  }

  const handleAddTask = (columnId: string) => {
    const newTask: Task = {
      id: `${columnId}-${Date.now()}`,
      title: "New task",
      color: "blue",
      avatar: avatars.alex,
    }
    setColumns((prev) =>
      prev.map((column) =>
        column.id === columnId
          ? { ...column, tasks: [...column.tasks, newTask] }
          : column
      )
    )
  }

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault()
    if (!draggedTaskId) return

    setColumns((prev) => {
      let draggedTask: Task | null = null
      
      // Find and remove the dragged task
      const newColumns = prev.map((column) => {
        const taskIndex = column.tasks.findIndex((t) => t.id === draggedTaskId)
        if (taskIndex !== -1) {
          draggedTask = column.tasks[taskIndex]
          return {
            ...column,
            tasks: column.tasks.filter((t) => t.id !== draggedTaskId),
          }
        }
        return column
      })

      // Add task to target column
      if (draggedTask) {
        return newColumns.map((column) => {
          if (column.id === targetColumnId) {
            return {
              ...column,
              tasks: [...column.tasks, draggedTask!],
            }
          }
          return column
        })
      }

      return newColumns
    })

    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  const getColumnGroups = (column: Column) => {
    if (column.id === "done") {
      const grouped = doneDateLabels
        .map((group) => ({
          label: group.label,
          tasks: column.tasks.filter((task) => group.taskIds.includes(task.id)),
        }))
        .filter((group) => group.tasks.length > 0)

      const groupedIds = grouped.flatMap((group) => group.tasks.map((task) => task.id))
      const remaining = column.tasks.filter((task) => !groupedIds.includes(task.id))

      if (remaining.length > 0) {
        grouped.push({ label: "Other", tasks: remaining })
      }

      return grouped
    }

    return [{ tasks: column.tasks }]
  }

  return (
    <div className="flex gap-4 p-6 overflow-x-auto min-h-[calc(100vh-80px)]">
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          title={column.title}
          count={column.count}
          groups={getColumnGroups(column)}
          onSubtaskToggle={handleSubtaskToggle}
          onTaskUpdate={handleTaskUpdate}          onAddTask={() => handleAddTask(column.id)}          onDragStart={handleDragStart}
          onDragOver={(e) => handleDragOver(e, column.id)}
          onDrop={(e) => handleDrop(e, column.id)}
          isDragOver={dragOverColumn === column.id}
        />
      ))}
    </div>
  )
}
