import { initializeApp, getApps, type FirebaseOptions } from "firebase/app"
import { getAuth, connectAuthEmulator } from "firebase/auth"
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore"

function resolveFirebaseConfig(): FirebaseOptions {
  const snapshot = process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG
  if (snapshot) {
    try {
      const parsed = JSON.parse(snapshot) as FirebaseOptions
      if (parsed.apiKey && parsed.projectId) return parsed
    } catch {
      /* fall through */
    }
  }
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "localhost",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "lockintogether-9c05f",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "lockintogether-9c05f.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000",
  }
}

const firebaseConfig = resolveFirebaseConfig()

// Initialize Firebase only if it hasn't been initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)

// Connect to emulators in development
if (process.env.NODE_ENV === "development") {
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
    connectFirestoreEmulator(db, "127.0.0.1", 8080)
  } catch {
    // Already connected — safe to ignore on hot reload
  }
}

export default app
