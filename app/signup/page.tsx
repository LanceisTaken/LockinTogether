"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import { Globe, Lock, Mail, User, AlertCircle } from "lucide-react"
import {
  GoogleAuthProvider,
  signInWithCredential,
  createUserWithEmailAndPassword,
  updateProfile,
  type AuthError,
} from "firebase/auth"
import { auth } from "@/lib/firebase/config"
import { useAuth } from "@/lib/firebase/auth-context"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

declare global {
  interface Window {
    handleGoogleCredentialSignup: (response: { credential: string }) => void
  }
}

export default function SignUpPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const googleButtonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loading && user) {
      router.replace("/")
    }
  }, [loading, user, router])

  useEffect(() => {
    window.handleGoogleCredentialSignup = async ({ credential }) => {
      setError("")
      setIsSigningUp(true)
      try {
        const googleCredential = GoogleAuthProvider.credential(credential)
        await signInWithCredential(auth, googleCredential)
        router.replace("/")
      } catch (err) {
        const code = (err as AuthError)?.code
        console.error("Google sign-up error:", code, err)
        if (code === "auth/account-exists-with-different-credential") {
          setError("This email already uses another sign-in method. Sign in with email instead.")
        } else if (code === "auth/invalid-credential") {
          setError("Google sign-in could not verify your session. Try again.")
        } else {
          setError("Google sign-up failed. Please try again.")
        }
      } finally {
        setIsSigningUp(false)
      }
    }
  }, [router])

  const handleGISLoad = () => {
    if (window.google && googleButtonRef.current) {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: window.handleGoogleCredentialSignup,
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signup_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: googleButtonRef.current.offsetWidth,
      })
    }
  }

  const handleEmailSignUp = async () => {
    setError("")

    if (!displayName.trim()) return setError("Please enter your name.")
    if (!email) return setError("Please enter your email address.")
    if (!password) return setError("Please enter a password.")
    if (password.length < 6) return setError("Password must be at least 6 characters.")
    if (password !== confirmPassword) return setError("Passwords do not match.")

    setIsSigningUp(true)
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(result.user, { displayName: displayName.trim() })
      router.replace("/")
    } catch (err: any) {
      const code = err?.code ?? ""
      if (code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Try signing in instead.")
      } else if (code === "auth/invalid-email") {
        setError("That doesn't look like a valid email address.")
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Please choose a stronger one.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } finally {
      setIsSigningUp(false)
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

          {/* Header */}
          <div className="flex items-center gap-2 text-black mb-1">
            <Globe className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-semibold">Create an account</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Sign up to get started with TaskBoard.
          </p>

          {/* Fields */}
          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1 mb-1">
                <User className="w-4 h-4" /> Name
              </div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => { setDisplayName(e.target.value); setError("") }}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Your full name"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1 mb-1">
                <Mail className="w-4 h-4" /> Email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError("") }}
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
                placeholder="At least 6 characters"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              <div className="flex items-center gap-1 mb-1">
                <Lock className="w-4 h-4" /> Confirm Password
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError("") }}
                className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="••••••••"
              />
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sign up button */}
          <div className="mt-4">
            <Button
              type="button"
              className="w-full transition-all duration-200 hover:shadow-[0_0_14px_3px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 active:scale-95"
              onClick={handleEmailSignUp}
              disabled={isSigningUp}
            >
              {isSigningUp ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Creating account…
                </>
              ) : (
                "Sign up"
              )}
            </Button>
          </div>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Official Google button */}
          <div className="w-full flex justify-center">
            {isSigningUp ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Spinner className="h-4 w-4" /> Signing up…
              </div>
            ) : (
              <div ref={googleButtonRef} className="w-full" />
            )}
          </div>

          {/* Sign in link */}
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-primary hover:underline transition-colors">
              Sign in
            </a>
          </p>

        </div>
      </main>
    </>
  )
}