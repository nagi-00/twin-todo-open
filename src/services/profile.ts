import { User } from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../firebase";
import type { UserProfile } from "../types";

export function subscribeProfile(uid: string, callback: (profile: UserProfile | null) => void) {
  if (!db) return () => undefined;
  return onSnapshot(doc(db, "users", uid), (snapshot) => {
    callback(snapshot.exists() ? (snapshot.data() as UserProfile) : null);
  });
}

export async function ensureUserProfile(user: User) {
  if (!db) throw new Error("Firestore is not configured.");
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) return;

  await setDoc(
    userRef,
    {
      email: user.email ?? "",
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? "TwinTodo User",
      nickname: null,
      nicknameNormalized: null,
      avatarPath: null,
      backgroundPath: null,
      backgroundOpacity: 0.18,
      role: "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateDisplayName(uid: string, displayName: string) {
  if (!db) throw new Error("Firestore is not configured.");
  await updateDoc(doc(db, "users", uid), {
    displayName,
    updatedAt: serverTimestamp(),
  });
}

export async function uploadAvatar(uid: string, file: File) {
  if (!storage || !db) throw new Error("Firebase Storage is not configured.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `profiles/${uid}/avatar/avatar.${extension}`;
  const avatarRef = ref(storage, path);
  await uploadBytes(avatarRef, file, { contentType: file.type });
  await updateDoc(doc(db, "users", uid), {
    avatarPath: path,
    updatedAt: serverTimestamp(),
  });
  return getDownloadURL(avatarRef);
}

export async function uploadBackground(uid: string, file: File, opacity: number) {
  if (!storage || !db) throw new Error("Firebase Storage is not configured.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `profiles/${uid}/background/background.${extension}`;
  const backgroundRef = ref(storage, path);
  const safeOpacity = Math.max(0, Math.min(0.7, opacity));
  await uploadBytes(backgroundRef, file, { contentType: file.type });
  await updateDoc(doc(db, "users", uid), {
    backgroundPath: path,
    backgroundOpacity: safeOpacity,
    updatedAt: serverTimestamp(),
  });
  return getDownloadURL(backgroundRef);
}

export async function getAvatarUrl(path: string | null) {
  if (!storage || !path) return null;
  return getDownloadURL(ref(storage, path));
}
