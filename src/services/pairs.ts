import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Pair, PairRequest } from "../types";

export function subscribeActivePair(uid: string, callback: (pair: Pair | null) => void) {
  return subscribeActivePairs(uid, (pairs) => callback(pairs[0] || null));
}

export function subscribeActivePairs(uid: string, callback: (pairs: Pair[]) => void) {
  if (!db) return () => undefined;
  const q = query(
    collection(db, "pairs"),
    where("members", "array-contains", uid),
    where("status", "==", "active"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Pair));
    },
    (error) => {
      console.error("Active pairs subscription failed", error);
      callback([]);
    },
  );
}

export function subscribePairRequests(uid: string, callback: (requests: PairRequest[]) => void) {
  if (!db) return () => undefined;
  const incoming = query(collection(db, "pairRequests"), where("toUid", "==", uid), where("status", "==", "pending"));
  return onSnapshot(incoming, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PairRequest));
  });
}
