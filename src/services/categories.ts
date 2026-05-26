import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { DEFAULT_CATEGORIES } from "../lib/categories";
import { db } from "../firebase";
import type { CategoryLabels } from "../types";

type CategoryScope =
  | { type: "solo"; uid: string }
  | { type: "pair"; pairId: string; uid: string };

function categoriesDoc(scope: CategoryScope) {
  if (!db) throw new Error("Firestore is not configured.");
  if (scope.type === "solo") return doc(db, "users", scope.uid, "settings", "categories");
  return doc(db, "pairs", scope.pairId, "settings", "categories");
}

export function subscribeCategories(scope: CategoryScope, callback: (labels: CategoryLabels) => void) {
  return onSnapshot(categoriesDoc(scope), (snapshot) => {
    callback(snapshot.exists() ? ({ ...DEFAULT_CATEGORIES, ...snapshot.data() } as CategoryLabels) : DEFAULT_CATEGORIES);
  });
}

export async function saveCategories(scope: CategoryScope, labels: CategoryLabels) {
  await setDoc(
    categoriesDoc(scope),
    {
      ...labels,
      updatedBy: scope.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
