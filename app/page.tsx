"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserMenu } from "@/components/auth/user-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
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
import { LayoutGrid, PlusCircle, Users, Trash2, Bell } from "lucide-react"
import { getBoards, createBoard, deleteBoard, type Board } from "@/lib/api"
import { useAuth } from "@/lib/firebase/auth-context"
import { useNotificationsRealtime } from "@/lib/firebase/firestore"
import { NotificationsSidebar } from "@/components/notifications-sidebar"

export default function Home() {
  const router = useRouter()
  const { user } = useAuth()
  const currentUserId = user?.uid || ""
  const { unreadCount } = useNotificationsRealtime(currentUserId)
  const [showNotifications, setShowNotifications] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [loadingBoards, setLoadingBoards] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [boardsError, setBoardsError] = useState("")

  useEffect(() => {
    if (!user) return
    loadBoards()
  }, [user])

  // Reload boards when notifications panel closes (user may have accepted an invite)
  useEffect(() => {
    if (!showNotifications && user) loadBoards()
  }, [showNotifications])

  const loadBoards = async () => {
    try {
      setLoadingBoards(true)
      setBoardsError("")
      const data = await getBoards()
      setBoards(data.boards)
    } catch (err: unknown) {
      console.error("Failed to load boards:", err)
      setBoardsError(err instanceof Error ? err.message : "Failed to load boards")
    } finally {
      setLoadingBoards(false)
    }
  }

  const handleCreateBoard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setIsSubmitting(true)

    try {
      const data = await createBoard({ title, description: description || undefined })
      setBoards((prev) => [...prev, data.board])
      setTitle("")
      setDescription("")
      setIsDialogOpen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create board")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteBoard = async (boardId: string) => {
    if (!confirm("Delete this board and all its tasks? This cannot be undone.")) return
    try {
      await deleteBoard(boardId)
      setBoards((prev) => prev.filter((b) => b.boardId !== boardId))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete board")
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
            <h1 className="text-primary-foreground font-bold text-2xl tracking-wide">
              My Boards
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <PlusCircle className="w-4 h-4" /> New Board
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Board</DialogTitle>
                  <DialogDescription>
                    Give your board a name and optional description.
                  </DialogDescription>
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
                  {error && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
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

            {/* Notifications bell */}
            <Button
              variant="secondary"
              size="sm"
              className="relative"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            <UserMenu />
          </div>
        </header>

        <div className="relative">
        <div className="w-full p-8">
          {loadingBoards ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="h-8 w-8 text-primary" />
            </div>
          ) : boardsError ? (
            <div className="text-center py-20">
              <p className="text-red-600 font-medium">{boardsError}</p>
              <Button variant="outline" className="mt-4" onClick={loadBoards}>
                Retry
              </Button>
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">No boards yet</p>
              <p className="text-sm mt-1">Create your first board to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {boards.map((board) => (
                <div
                  key={board.boardId}
                  className="group relative rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
                  onClick={() => router.push(`/board/${board.boardId}`)}
                >
                  <h3 className="font-semibold text-lg text-slate-900 truncate">
                    {board.title}
                  </h3>
                  {board.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {board.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    <span className="capitalize">{board.userRole}</span>
                    <span className="mx-1">|</span>
                    <span>{board.columns.length} columns</span>
                  </div>
                  {board.userRole === "owner" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteBoard(board.boardId)
                      }}
                      className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {showNotifications && (
          <div className="absolute top-0 right-0 w-80 h-[calc(100vh-80px)] border-l border-border bg-slate-50 overflow-y-auto shadow-lg z-20">
            <NotificationsSidebar
              userId={currentUserId}
              canEditTask={() => false}
            />
          </div>
        )}
        </div>
      </main>
    </ProtectedRoute>
  )
}
