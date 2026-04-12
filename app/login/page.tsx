"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { Globe, Lock, Mail, AlertCircle } from "lucide-react"
import { GoogleAuthProvider, signInWithCredential, type AuthError } from "firebase/auth"
import { auth } from "@/lib/firebase/config"
import { useAuth } from "@/lib/firebase/auth-context"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

declare global {
  interface Window {
    handleGoogleCredential: (response: { credential: string }) => void
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { user, loading, signInWithEmail, sendPasswordReset } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [forgotSent, setForgotSent] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && user) {
      router.replace("/")
    }
  }, [loading, user, router])

  // Called by GIS when user completes Google sign-in
  useEffect(() => {
    window.handleGoogleCredential = async ({ credential }) => {
      setError("")
      setIsSigningIn(true)
      try {
        const googleCredential = GoogleAuthProvider.credential(credential)
        await signInWithCredential(auth, googleCredential)
        router.replace("/")
      } catch (err) {
        const code = (err as AuthError)?.code
        console.error("Google sign-in error:", code, err)
        if (code === "auth/account-exists-with-different-credential") {
          setError("This email uses another sign-in method. Use email/password.")
        } else if (code === "auth/invalid-credential") {
          setError("Google sign-in could not verify your session. Try again.")
        } else {
          setError("Google sign-in failed. Please try again.")
        }
      } finally {
        setIsSigningIn(false)
      }
    }
  }, [router])

  // Render the official Google button once GIS script is ready
  const handleGISLoad = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable")
      return
    }
    if (window.google && googleButtonRef.current) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: window.handleGoogleCredential,
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: googleButtonRef.current.offsetWidth,
      })
    }
  }

  const handleEmailSignIn = async () => {
    setError("")
    if (!email) return setError("Please enter your email address.")
    if (!password) return setError("Please enter your password.")

    setIsSigningIn(true)
    try {
      await signInWithEmail(email, password)
      router.replace("/")
    } catch (err: any) {
      const code = err?.code ?? ""
      if (
        code === "auth/user-not-found" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setError("Incorrect email or password. Please try again.")
      } else if (code === "auth/invalid-email") {
        setError("That doesn't look like a valid email address.")
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a moment and try again.")
      } else {
        console.error("Unexpected auth error:", code, err)
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleForgotPassword = async () => {
    setError("")
    if (!email) return setError("Enter your email above first, then click Forgot password.")

    setIsSendingReset(true)
    try {
      await sendPasswordReset(email)
      setForgotSent(true)
    } catch (err: any) {
      const code = err?.code ?? ""
      if (code === "auth/user-not-found") {
        setError("No account found with that email address.")
      } else if (code === "auth/invalid-email") {
        setError("That doesn't look like a valid email address.")
      } else {
        setError("Couldn't send reset email. Please try again.")
      }
    } finally {
      setIsSendingReset(false)
    }
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={handleGISLoad}
      />

      <main className="min-h-screen bg-indigo-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-lg border bg-white text-card-foreground p-6 shadow-lg">

          <div className="flex items-center gap-2 text-black mb-1">
            <Globe className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">TaskBoard Login</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your login and password, or continue with Google.
          </p>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1 mb-1">
                <Mail className="w-4 h-4" /> Email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); setForgotSent(false) }}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="you@example.com"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1 mb-1">
                <Lock className="w-4 h-4" /> Password
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError("") }}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
              />
            </label>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isSendingReset}
                className="text-xs text-primary hover:underline disabled:opacity-50 transition-colors"
              >
                {isSendingReset ? "Sending…" : "Forgot password?"}
              </button>
            </div>

            {forgotSent && (
              <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                ✅ Reset email sent — check your inbox.
              </p>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-4">
            <Button
              type="button"
              className="w-full transition-all duration-200 hover:shadow-[0_0_14px_3px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 active:scale-95"
              onClick={handleEmailSignIn}
              disabled={isSigningIn}
            >
              {isSigningIn ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </div>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Official Google button rendered by GIS */}
          <div className="w-full flex justify-center">
            {isSigningIn ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Spinner className="h-4 w-4" /> Signing in…
              </div>
            ) : (
              <div ref={googleButtonRef} className="w-full" />
            )}
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/signup" className="font-medium text-primary hover:underline transition-colors">
              Sign up
            </a>
          </p>

        </div>
      </main>
    </>
  )
}