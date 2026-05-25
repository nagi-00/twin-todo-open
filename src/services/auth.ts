import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

export function subscribeAuth(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured.");
  await signInWithPopup(auth, googleProvider);
}

export async function logout() {
  if (!auth) return;
  await signOut(auth);
}
