"use client"

import { useState } from "react"
import { KanbanBoard, Column, initialColumns } from "@/components/kanban/kanban-board"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserMenu } from "@/components/auth/user-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { LayoutGrid, PlusCircle } from "lucide-react"

export default function Home() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [kanbanColumns, setKanbanColumns] = useState<Column[]>(initialColumns)

  const handleCreateBoard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    const payload = {
      title,
      description,
    }

    try {
      await fetch("/api/createBoard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const newColumnId = title.toLowerCase().replace(/\s+/g, "-") + '-' + Date.now()
      const newBoard = {
        id: newColumnId,
        title,
        tasks: [],
      }
      setKanbanColumns((prev) => [...prev, newBoard])

      setTitle("")
      setDescription("")
      setIsDialogOpen(false)
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-white text-black">
        <header className="bg-primary border-b border-border h-20 flex items-center justify-between px-8 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-white/20 p-2">
              <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-primary-foreground font-bold text-2xl tracking-wide">Task Board</h1>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <PlusCircle className="w-4 h-4" /> Create New Board
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Board</DialogTitle>
                  <DialogDescription>Fill in board details</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateBoard} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="My new board"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional board description"
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="w-full sm:w-auto">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                      {isSubmitting ? "Creating..." : "Create Board"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <UserMenu />
          </div>
        </header>
        <KanbanBoard columns={kanbanColumns} onColumnsChange={setKanbanColumns} />
      </main>
    </ProtectedRoute>
  )
}