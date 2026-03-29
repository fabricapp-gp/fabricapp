/**
 * FABRICINTEL — Firebase Configuration
 * 
 * Initializes the Firebase app and exports Firestore instance.
 */

import { initializeApp, getApps } from "firebase/app"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyABrZ6DI98ST68aANRD9_MsEZ9BSdmTmD8",
  authDomain: "fabricintel.firebaseapp.com",
  projectId: "fabricintel",
  storageBucket: "fabricintel.firebasestorage.app",
  messagingSenderId: "64889703971",
  appId: "1:64889703971:web:b48abb2a57aeda70566b96"
}

// Initialize Firebase (only once)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const db = getFirestore(app)

export { db }
export default app
