"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth"
import { auth, db } from "./config"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { getUserProfile } from "@/lib/api"

export interface UserProfile {
  userId: string
  email: string
  displayName: string
  photoURL: string | null
  role: string
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  /**
   * Ensure user profile exists in Firestore.
   * The onUserCreate trigger should create it, but if it didn't
   * (common with Google OAuth in emulator), create it client-side.
   */
  const ensureProfile = async (firebaseUser: User) => {
    const userRef = doc(db, "users", firebaseUser.uid)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      await setDoc(userRef, {
        userId: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName:
          firebaseUser.displayName ||
          firebaseUser.email?.split("@")[0] ||
          "New User",
        photoURL: firebaseUser.photoURL || null,
        role: "user",
        createdAt: serverTimestamp(),
      })
    }
  }

  const fetchProfile = async () => {
    try {
      const data = await getUserProfile()
      setProfile({
        userId: data.userId,
        email: data.email,
        displayName: data.displayName,
        photoURL: data.photoURL,
        role: data.role,
      })
    } catch (error) {
      console.error("Failed to fetch user profile:", error)
      setProfile(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        try {
          // Ensure profile exists (handles Google OAuth in emulator)
          await ensureProfile(firebaseUser)
        } catch (err) {
          console.error("Failed to ensure user profile in Firestore:", err)
        }
        await fetchProfile()
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUpWithEmail = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const sendPasswordReset = async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
