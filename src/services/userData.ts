import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CategoryKey, Routine } from "../types";

export type DateColorMap = Record<string, string>;
export type NoteMap = Record<string, string>;
export type DailyEntry = {
  gratitude?: string[];
  mood?: string[];
  diary?: string;
  dream?: string;
};
export type Message = {
  text: string;
  time: number;
};
export type SharedDay = {
  todos: unknown[];
  note: string;
  color: string;
  messages: Message[];
  updatedAt?: unknown;
};

function requireDb() {
  if (!db) throw new Error("Firestore is not configured.");
  return db;
}

function docFromPath(path: string[]) {
  if (path.length < 2) throw new Error("Invalid document path.");
  const [first, second, ...rest] = path;
  return doc(requireDb(), first, second, ...rest);
}

export function subscribeDateColors(uid: string, callback: (colors: DateColorMap) => void) {
  return onSnapshot(collection(requireDb(), "users", uid, "dateColors"), (snapshot) => {
    const colors: DateColorMap = {};
    snapshot.forEach((item) => {
      colors[item.id] = item.data().value ?? "#2d2d2d";
    });
    callback(colors);
  });
}

export function subscribeNotes(uid: string, callback: (notes: NoteMap) => void) {
  return onSnapshot(collection(requireDb(), "users", uid, "notes"), (snapshot) => {
    const notes: NoteMap = {};
    snapshot.forEach((item) => {
      const text = item.data().text;
      if (typeof text === "string" && text.trim()) notes[item.id] = text;
    });
    callback(notes);
  });
}

export async function saveDateColor(uid: string, date: string, value: string) {
  await setDoc(doc(requireDb(), "users", uid, "dateColors", date), {
    value,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeTextDoc(path: string[], field: string, callback: (value: string) => void) {
  return onSnapshot(docFromPath(path), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data()[field] ?? "" : "");
  });
}

export async function saveTextDoc(path: string[], field: string, value: string) {
  await setDoc(docFromPath(path), {
    [field]: value,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeDaily(uid: string, date: string, callback: (entry: DailyEntry) => void) {
  return onSnapshot(doc(requireDb(), "users", uid, "daily", date), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() as DailyEntry : {});
  });
}

export async function saveDaily(uid: string, date: string, patch: DailyEntry) {
  await setDoc(doc(requireDb(), "users", uid, "daily", date), {
    ...patch,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeMessages(uid: string, date: string, callback: (messages: Message[]) => void) {
  return onSnapshot(doc(requireDb(), "users", uid, "messages", date), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data().items ?? [] : []);
  });
}

export async function saveMessages(uid: string, date: string, items: Message[]) {
  await setDoc(doc(requireDb(), "users", uid, "messages", date), {
    items,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeSharedDay(uid: string, date: string, callback: (shared: SharedDay | null) => void) {
  return onSnapshot(doc(requireDb(), "users", uid, "shared", date), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() as SharedDay : null);
  });
}

export async function saveSharedDay(uid: string, date: string, shared: SharedDay) {
  await setDoc(doc(requireDb(), "users", uid, "shared", date), {
    ...shared,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribePairSharedDay(pairId: string, uid: string, date: string, callback: (shared: SharedDay | null) => void) {
  return onSnapshot(doc(requireDb(), "pairs", pairId, "shared", `${uid}_${date}`), (snapshot) => {
    callback(snapshot.exists() ? snapshot.data() as SharedDay : null);
  });
}

export async function savePairSharedDay(pairId: string, uid: string, date: string, shared: SharedDay) {
  await setDoc(doc(requireDb(), "pairs", pairId, "shared", `${uid}_${date}`), {
    ...shared,
    uid,
    date,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function subscribeRoutines(uid: string, callback: (routines: Routine[]) => void) {
  const q = query(collection(requireDb(), "users", uid, "routines"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Routine));
  });
}

export async function addRoutine(uid: string, text: string, categoryKey: CategoryKey, frequency: "daily" | "weekly", weekdays: number[]) {
  await addDoc(collection(requireDb(), "users", uid, "routines"), {
    text: text.trim(),
    categoryKey,
    frequency,
    weekdays,
    createdAt: serverTimestamp(),
  });
}

export async function removeRoutine(uid: string, routineId: string) {
  await deleteDoc(doc(requireDb(), "users", uid, "routines", routineId));
}
