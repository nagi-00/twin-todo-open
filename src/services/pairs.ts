import {
  collection,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Pair, PairRequest } from "../types";

export function subscribeActivePair(uid: string, callback: (pair: Pair | null) => void) {
  if (!db) return () => undefined;
  const q = query(
    collection(db, "pairs"),
    where("members", "array-contains", uid),
    where("status", "==", "active"),
    limit(1),
  );
  return onSnapshot(q, (snapshot) => {
    const first = snapshot.docs[0];
    callback(first ? ({ id: first.id, ...first.data() } as Pair) : null);
  });
}

export function subscribePairRequests(uid: string, callback: (requests: PairRequest[]) => void) {
  if (!db) return () => undefined;
  const incoming = query(collection(db, "pairRequests"), where("toUid", "==", uid), where("status", "==", "pending"));
  return onSnapshot(incoming, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PairRequest));
  });
}
