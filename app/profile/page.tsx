"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { UserMenu } from "@/components/auth/user-menu"
import { useAuth } from "@/lib/firebase/auth-context"
import { getUserStats, type UserStats } from "@/lib/api"
import { Spinner } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  Trophy,
  TrendingUp,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Animated ring chart ──────────────────────────────────────

function ScoreRing({
  score,
  size = 160,
  strokeWidth = 12,
}: {
  score: number
  size?: number
  strokeWidth?: number
}) {
  const [animatedScore, setAnimatedScore] = useState(0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedScore / 100) * circumference

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100)
    return () => clearTimeout(timer)
  }, [score])

  const color =
    score >= 80
      ? "text-emerald-500"
      : score >= 50
        ? "text-amber-500"
        : "text-red-500"

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200"
        />
        {/* Score ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(color, "transition-all duration-1000 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-bold", color)}>
          {Math.round(animatedScore)}%
        </span>
        <span className="text-xs text-muted-foreground">On Time</span>
      </div>
    </div>
  )
}

// ── Mini progress bar ────────────────────────────────────────

function ProgressBar({
  value,
  max,
  className,
}: {
  value: number
  max: number
  className?: string
}) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-700 ease-out",
          className || "bg-primary"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  subtext,
}: {
  icon: typeof CheckCircle2
  label: string
  value: number
  color: string
  subtext?: string
}) {
  const [animatedValue, setAnimatedValue] = useState(0)

  useEffect(() => {
    if (value === 0) return
    let start = 0
    const step = Math.max(1, Math.ceil(value / 20))
    const interval = setInterval(() => {
      start += step
      if (start >= value) {
        setAnimatedValue(value)
        clearInterval(interval)
      } else {
        setAnimatedValue(start)
      }
    }, 40)
    return () => clearInterval(interval)
  }, [value])

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2.5", color)}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{animatedValue}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-2">{subtext}</p>
      )}
    </div>
  )
}

// ── Format timestamp ─────────────────────────────────────────

function formatDate(ts: string | null): string {
  if (!ts) return "No date"
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ── Main page ────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!user) return
    setLoading(true)
    getUserStats()
      .then((data) => setStats(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load stats")
      )
      .finally(() => setLoading(false))
  }, [user])

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0].toUpperCase() || "U"

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-primary border-b border-border h-20 flex items-center justify-between px-8 shadow-lg">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={() => router.push("/")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h1 className="text-primary-foreground font-bold text-2xl tracking-wide">
              My Profile
            </h1>
          </div>
          <UserMenu />
        </header>

        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          {/* ── User info card ── */}
          <div className="rounded-xl border bg-white p-6 shadow-sm flex items-center gap-6">
            <Avatar className="h-20 w-20 border-4 border-primary/20">
              <AvatarImage
                src={user?.photoURL || undefined}
                alt={user?.displayName || "User"}
              />
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {user?.displayName || "User"}
              </h2>
              <p className="text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner className="h-8 w-8 text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600 font-medium">{error}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setError("")
                  setLoading(true)
                  getUserStats()
                    .then((data) => setStats(data))
                    .catch((err) =>
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Failed to load stats"
                      )
                    )
                    .finally(() => setLoading(false))
                }}
              >
                Retry
              </Button>
            </div>
          ) : stats ? (
            <>
              {/* ── Score ring + Stat cards row ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8">
                {/* Score ring */}
                <div className="rounded-xl border bg-white p-6 shadow-sm flex flex-col items-center justify-center">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <h3 className="font-semibold text-slate-900">
                      Completion Rate
                    </h3>
                  </div>
                  <ScoreRing score={stats.completionRate} />
                  <p className="text-xs text-muted-foreground mt-3 text-center max-w-[180px]">
                    {stats.completedOnTime} of{" "}
                    {stats.completedOnTime + stats.completedLate} tasks with
                    deadlines completed on time
                  </p>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    icon={CheckCircle2}
                    label="Completed"
                    value={stats.totalCompleted}
                    color="bg-emerald-500"
                    subtext="Total tasks finished"
                  />
                  <StatCard
                    icon={Clock}
                    label="On Time"
                    value={stats.completedOnTime}
                    color="bg-blue-500"
                    subtext="Finished before deadline"
                  />
                  <StatCard
                    icon={AlertTriangle}
                    label="Completed Late"
                    value={stats.completedLate}
                    color="bg-amber-500"
                    subtext="Finished after deadline"
                  />
                  <StatCard
                    icon={Loader2}
                    label="In Progress"
                    value={stats.inProgress}
                    color="bg-violet-500"
                    subtext="Still being worked on"
                  />
                </div>
              </div>

              {/* ── Board breakdown ── */}
              {stats.boardBreakdown.length > 0 && (
                <div className="rounded-xl border bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-slate-900">
                      Board Breakdown
                    </h3>
                  </div>
                  <div className="space-y-5">
                    {stats.boardBreakdown.map((board) => (
                      <div key={board.boardId}>
                        <div className="flex items-center justify-between mb-1.5">
                          <button
                            onClick={() =>
                              router.push(`/board/${board.boardId}`)
                            }
                            className="text-sm font-medium text-slate-700 hover:text-primary transition-colors"
                          >
                            {board.boardTitle}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {board.completed}/{board.total} completed
                          </span>
                        </div>
                        <ProgressBar
                          value={board.completed}
                          max={board.total}
                          className="bg-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Recent completed tasks ── */}
              {stats.recentCompleted.length > 0 && (
                <div className="rounded-xl border bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-5">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-slate-900">
                      Recent Completions
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {stats.recentCompleted.map((task) => (
                      <div
                        key={task.taskId}
                        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => router.push(`/board/${task.boardId}`)}
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            task.completedOnTime
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {task.boardTitle}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={cn(
                              "inline-block text-xs font-medium px-2 py-0.5 rounded-full",
                              task.completedOnTime
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {task.completedOnTime ? "On Time" : "Late"}
                          </span>
                          {task.deadline && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Due {formatDate(task.deadline)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {stats.totalCompleted === 0 && stats.inProgress === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">No tasks yet</p>
                  <p className="text-sm mt-1">
                    Get started by creating tasks on your boards.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => router.push("/")}
                  >
                    Go to Boards
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </ProtectedRoute>
  )
}
