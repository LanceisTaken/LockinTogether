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
import { ArrowLeft, LayoutGrid, UserPlus, History, Bell, Users, Trash2, LogOut, Crown } from "lucide-react"
import {
  useBoardRealtime,
  useTasksRealtime,
  useBoardMembersRealtime,
  useNotificationsRealtime,
} from "@/lib/firebase/firestore"
import {
  searchUserByEmail,
  updateMemberRole,
  removeBoardMember,
  leaveBoard,
  transferOwnership,
} from "@/lib/api"
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

  const [membersOpen, setMembersOpen] = useState(false)
  const [membersError, setMembersError] = useState("")
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)

  const [rightPanel, setRightPanel] = useState<RightPanel>("none")

  // Current user's role on this board ("owner" | "admin" | "member" | undefined)
  const currentUserRole = members.find((m) => m.userId === currentUserId)?.role
  const isOwner = currentUserRole === "owner"
  const canInvite = currentUserRole === "owner" || currentUserRole === "admin"

  const handleChangeMemberRole = async (userId: string, role: string) => {
    setMembersError("")
    setPendingMemberId(userId)
    try {
      await updateMemberRole({ boardId, userId, role })
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to change role.")
    } finally {
      setPendingMemberId(null)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!confirm("Remove this member from the board?")) return
    setMembersError("")
    setPendingMemberId(userId)
    try {
      await removeBoardMember(boardId, userId)
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to remove member.")
    } finally {
      setPendingMemberId(null)
    }
  }

  const handleLeaveBoard = async () => {
    if (!confirm("Leave this board? You will lose access to all its tasks.")) return
    setMembersError("")
    try {
      await leaveBoard(boardId)
      router.push("/")
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to leave board.")
    }
  }

  const handleTransferOwnership = async (userId: string, displayName: string) => {
    if (!confirm(
      `Transfer ownership to ${displayName}? You will be demoted to admin.`
    )) return
    setMembersError("")
    setPendingMemberId(userId)
    try {
      await transferOwnership(boardId, userId)
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Failed to transfer ownership.")
    } finally {
      setPendingMemberId(null)
    }
  }

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

  // Check if current user can edit/delete a task:
  // board owner, board admin, task creator, or listed co-editor.
  const canEditTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task) return false
      if (currentUserRole === "owner" || currentUserRole === "admin") return true
      return (
        task.createdBy === currentUserId ||
        (task.coEditors && task.coEditors.includes(currentUserId))
      )
    },
    [tasks, currentUserId, currentUserRole]
  )

  const loading = boardLoading || tasksLoading

  return (
    <ProtectedRoute>
      <main className="h-[100dvh] overflow-hidden bg-white text-black flex flex-col">
        <header className="bg-primary border-b border-border px-4 py-3 flex flex-col gap-3 md:flex-row md:h-20 md:items-center md:justify-between md:px-8">
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
            {/* Member avatars — first 3, then +N, all clickable to open members dialog */}
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              className="flex -space-x-2 hover:opacity-90 transition-opacity"
              title="View members"
            >
              {members.slice(0, 3).map((m) => (
                <div
                  key={m.userId}
                  className="w-8 h-8 rounded-full bg-white/20 border-2 border-white flex items-center justify-center text-xs font-medium text-white"
                  title={`${m.displayName || m.email} (${m.role})`}
                >
                  {(m.displayName || m.email || "U")[0].toUpperCase()}
                </div>
              ))}
              {members.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-white/30 border-2 border-white flex items-center justify-center text-xs font-medium text-white">
                  +{members.length - 3}
                </div>
              )}
            </button>

            {/* Members list dialog */}
            <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
              <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" /> Board Members
                  </DialogTitle>
                  <DialogDescription>
                    {isOwner
                      ? "As the owner, you can change member roles or remove members."
                      : "Members with access to this board."}
                  </DialogDescription>
                </DialogHeader>

                {membersError && (
                  <p className="text-sm text-red-600">{membersError}</p>
                )}

                <div className="space-y-2">
                  {members.map((m) => {
                    const isMemberOwner = m.role === "owner"
                    const isSelf = m.userId === currentUserId
                    const disabled = pendingMemberId === m.userId
                    return (
                      <div
                        key={m.userId}
                        className="flex items-center gap-3 rounded-md border border-slate-200 p-2"
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary shrink-0">
                          {(m.displayName || m.email || "U")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {m.displayName || m.email}
                            {isSelf && <span className="text-xs text-muted-foreground"> (you)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                        </div>

                        {isOwner && !isMemberOwner && !isSelf ? (
                          <>
                            <select
                              value={m.role}
                              onChange={(e) => handleChangeMemberRole(m.userId, e.target.value)}
                              disabled={disabled}
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-50"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => handleTransferOwnership(m.userId, m.displayName || m.email)}
                              disabled={disabled}
                              className="text-amber-600 hover:text-amber-700 disabled:opacity-40"
                              title="Transfer ownership"
                            >
                              <Crown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.userId)}
                              disabled={disabled}
                              className="text-red-600 hover:text-red-700 disabled:opacity-40"
                              title="Remove member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                              isMemberOwner
                                ? "bg-amber-100 text-amber-800"
                                : m.role === "admin"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {m.role}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                  {currentUserRole && currentUserRole !== "owner" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                      onClick={handleLeaveBoard}
                    >
                      <LogOut className="w-4 h-4" /> Leave Board
                    </Button>
                  )}
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Invite member — only owner/admin */}
            {canInvite && (
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
            )}

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
                currentUserRole={currentUserRole}
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
