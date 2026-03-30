"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/firebase/auth-context"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, signInWithGoogle } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      router.replace("/")
    }
  }, [loading, user, router])

  const handleSignIn = async () => {
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
      router.replace("/")
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card text-card-foreground p-6">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Continue with Google to access the task board.
        </p>

        <div className="mt-6">
          <Button
            type="button"
            className="w-full"
            onClick={handleSignIn}
            disabled={loading || isSigningIn}
          >
            {loading || isSigningIn ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Signing in…
              </>
            ) : (
              "Continue with Google"
            )}
          </Button>
        </div>
      </div>
    </main>
  )
}

