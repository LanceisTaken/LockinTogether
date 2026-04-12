"use client"

import { use, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserMenu } from "@/components/auth/user-menu"
import { KanbanBoard } from "@/components/kanban/kanban-board"
import { ActivityLog } from "@/components/activity-log"
import { NotificationsSidebar } from "@/components/notifications-sidebar"
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
import { ArrowLeft, LayoutGrid, UserPlus, History, Bell } from "lucide-react"
import {
  useBoardRealtime,
  useTasksRealtime,
  useBoardMembersRealtime,
  useNotificationsRealtime,
} from "@/lib/firebase/firestore"
import { searchUserByEmail } from "@/lib/api"
import { sendNotification } from "@/lib/firebase/firestore"
import { useAuth } from "@/lib/firebase/auth-context"

type RightPanel = "none" | "activity" | "notifications"

export default function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentUserId = user?.uid || ""

  const { board, loading: boardLoading, error: boardError } = useBoardRealtime(boardId)
  const { tasks, loading: tasksLoading, error: tasksError } = useTasksRealtime(boardId)
  const { members } = useBoardMembersRealtime(boardId)
  const { unreadCount } = useNotificationsRealtime(currentUserId)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [inviteError, setInviteError] = useState("")
  const [isInviting, setIsInviting] = useState(false)

  const [rightPanel, setRightPanel] = useState<RightPanel>("none")

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError("")
    setIsInviting(true)
    try {
      // Look up user by email
      let targetUser
      try {
        targetUser = await searchUserByEmail(inviteEmail)
      } catch {
        setInviteError("No user found with that email address.")
        return
      }

      if (!targetUser?.userId) {
        setInviteError("No user found with that email address.")
        return
      }

      // Check if already a member
      const alreadyMember = members.find((m) => m.userId === targetUser.userId)
      if (alreadyMember) {
        setInviteError("This user is already a member of the board.")
        return
      }

      const senderName = user?.displayName || user?.email || "Someone"

      // Send invite notification instead of immediately adding
      await sendNotification({
        recipientId: targetUser.userId,
        senderId: currentUserId,
        senderName,
        boardId,
        boardTitle: board?.title || "a board",
        type: "board_invite",
        inviteRole: inviteRole,
        message: `${senderName} invited you to join "${board?.title || "a board"}" as ${inviteRole}`,
      })

      setInviteEmail("")
      setInviteOpen(false)
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setIsInviting(false)
    }
  }

  const togglePanel = (panel: "activity" | "notifications") => {
    setRightPanel((prev) => (prev === panel ? "none" : panel))
  }

  // Check if current user can edit a task (creator or co-editor)
  const canEditTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task) return false
      return (
        task.createdBy === currentUserId ||
        (task.coEditors && task.coEditors.includes(currentUserId))
      )
    },
    [tasks, currentUserId]
  )

  const loading = boardLoading || tasksLoading

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-white text-black">
        <header className="bg-primary border-b border-border h-20 flex items-center justify-between px-8 shadow-lg">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-white/10"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Boards
            </Button>
            <div className="rounded-md bg-white/20 p-2">
              <LayoutGrid className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-primary-foreground font-bold text-2xl tracking-wide">
              {board?.title || "Loading..."}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Member avatars */}
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m) => (
                <div
                  key={m.userId}
                  className="w-8 h-8 rounded-full bg-white/20 border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                  title={`${m.displayName || m.email} (${m.role})`}
                >
                  {(m.displayName || m.email || "U")[0].toUpperCase()}
                </div>
              ))}
              {members.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-white/30 border-2 border-white flex items-center justify-center text-xs font-medium text-white">
                  +{members.length - 5}
                </div>
              )}
            </div>

            {/* Invite member */}
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  <UserPlus className="w-4 h-4" /> Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Member</DialogTitle>
                  <DialogDescription>
                    Add a team member by their email address.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      placeholder="teammate@example.com"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button type="submit" disabled={isInviting}>
                      {isInviting ? "Inviting..." : "Send Invite"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Notifications toggle */}
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 relative"
              onClick={() => togglePanel("notifications")}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>

            {/* Activity log toggle */}
            <Button
              variant="secondary"
              size="sm"
              className="gap-2"
              onClick={() => togglePanel("activity")}
            >
              <History className="w-4 h-4" />
            </Button>

            <UserMenu />
          </div>
        </header>

        {(boardError || tasksError) && (
          <div className="mx-8 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
            {boardError || tasksError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-8 w-8 text-primary" />
          </div>
        ) : !board ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">Board not found</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push("/")}>
              Back to Boards
            </Button>
          </div>
        ) : (
          <div className="flex">
            <div className={rightPanel !== "none" ? "flex-1 min-w-0" : "w-full"}>
              <KanbanBoard
                boardId={boardId}
                columns={board.columns}
                tasks={tasks}
                members={members}
                currentUserId={currentUserId}
              />
            </div>
            {rightPanel === "activity" && (
              <div className="w-80 border-l border-border bg-slate-50 overflow-y-auto max-h-[calc(100vh-80px)]">
                <ActivityLog boardId={boardId} />
              </div>
            )}
            {rightPanel === "notifications" && (
              <div className="w-80 border-l border-border bg-slate-50 overflow-y-auto max-h-[calc(100vh-80px)]">
                <NotificationsSidebar
                  userId={currentUserId}
                  canEditTask={canEditTask}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </ProtectedRoute>
  )
}
