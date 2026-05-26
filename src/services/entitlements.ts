import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { Entitlements } from "../types";

export const FREE_ENTITLEMENTS: Entitlements = {
  pairSlots: 1,
  purchasedPairSlots: 0,
  backgroundImageUnlocked: false,
};

export const ADMIN_ENTITLEMENTS: Entitlements = {
  pairSlots: 99,
  purchasedPairSlots: 99,
  backgroundImageUnlocked: true,
};

export function normalizeEntitlements(value: Partial<Entitlements> | null | undefined): Entitlements {
  if (!value) return FREE_ENTITLEMENTS;
  return {
    pairSlots: Math.max(1, Number.isFinite(value.pairSlots) ? Number(value.pairSlots) : 1),
    purchasedPairSlots: Math.max(0, Number.isFinite(value.purchasedPairSlots) ? Number(value.purchasedPairSlots) : 0),
    backgroundImageUnlocked: value.backgroundImageUnlocked === true,
    updatedAt: value.updatedAt,
  };
}

export function subscribeEntitlements(uid: string, callback: (entitlements: Entitlements) => void) {
  if (!db) return () => undefined;
  return onSnapshot(
    doc(db, "entitlements", uid),
    (snapshot) => callback(normalizeEntitlements(snapshot.exists() ? snapshot.data() as Partial<Entitlements> : null)),
    () => callback(FREE_ENTITLEMENTS),
  );
}
