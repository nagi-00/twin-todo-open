import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type JournalEntry = {
  morning?: string;
  evening?: string;
  mood?: string | null;
  updatedAt?: unknown;
};

export function subscribeJournal(uid: string, date: string, callback: (entry: JournalEntry) => void) {
  if (!db) return () => undefined;
  return onSnapshot(doc(db, "users", uid, "journal", date), (snapshot) => {
    callback(snapshot.exists() ? (snapshot.data() as JournalEntry) : {});
  });
}

export async function saveJournal(uid: string, date: string, entry: JournalEntry) {
  if (!db) throw new Error("Firestore is not configured.");
  await setDoc(
    doc(db, "users", uid, "journal", date),
    {
      ...entry,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
