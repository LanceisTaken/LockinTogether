"use client"

import { KanbanBoard } from "@/components/kanban/kanban-board"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserMenu } from "@/components/auth/user-menu"

export default function Home() {
  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <header className="bg-primary h-16 flex items-center justify-between px-6">
          <h1 className="text-primary-foreground font-semibold text-lg">Task Board</h1>
          <UserMenu />
        </header>
        <KanbanBoard />
      </main>
    </ProtectedRoute>
  )
}
