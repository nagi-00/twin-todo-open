import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, DocumentReference, Timestamp } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const region = "asia-northeast3";
const callableOptions = { region, enforceAppCheck: true };
const adminEmails = new Set(["mx.gin.xo@gmail.com", "1995dianalee@gmail.com"]);
const freePairSlots = 1;
const adminPairSlots = 99;
const dailyLimits = {
  avatarUploads: 5,
  backgroundUploads: 3,
  pairRequests: 20,
  shares: 50,
} as const;

type LimitKey = keyof typeof dailyLimits;
type CallableAuth = { uid: string; token?: { email?: string } };
type Entitlements = {
  pairSlots: number;
  purchasedPairSlots: number;
  backgroundImageUnlocked: boolean;
};

const reservedNicknames = new Set([
  "admin",
  "support",
  "twintodo",
  "twin-todo",
  "modoo",
  "modootodo",
  "modoo-todo",
  "modoo.todo",
  "모두투두",
  "관리자",
  "운영자",
]);

function requireUid(auth: { uid: string } | undefined) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  return auth.uid;
}

function isAdminEmail(email: unknown) {
  return typeof email === "string" && adminEmails.has(email.toLowerCase());
}

function isAdminAuth(auth: CallableAuth | undefined) {
  return isAdminEmail(auth?.token?.email);
}

function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

async function getUserEmail(uid: string) {
  const userSnap = await db.doc(`users/${uid}`).get();
  const email = userSnap.exists ? userSnap.data()?.email : "";
  return typeof email === "string" ? email : "";
}

async function getEntitlements(uid: string, emailHint?: string): Promise<Entitlements & { isAdmin: boolean }> {
  const email = emailHint || await getUserEmail(uid);
  if (isAdminEmail(email)) {
    return {
      pairSlots: adminPairSlots,
      purchasedPairSlots: adminPairSlots,
      backgroundImageUnlocked: true,
      isAdmin: true,
    };
  }

  const snap = await db.doc(`entitlements/${uid}`).get();
  const data = snap.exists ? snap.data() : {};
  const purchasedPairSlots = asPositiveInteger(data?.purchasedPairSlots, 0);
  const pairSlots = Math.max(freePairSlots, asPositiveInteger(data?.pairSlots, freePairSlots));
  return {
    pairSlots,
    purchasedPairSlots,
    backgroundImageUnlocked: data?.backgroundImageUnlocked === true,
    isAdmin: false,
  };
}

async function assertDailyLimit(uid: string, key: LimitKey, auth?: CallableAuth) {
  if (isAdminAuth(auth)) return;
  const date = todayKey();
  const ref = db.doc(`usageDaily/${uid}_${date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = asPositiveInteger(snap.exists ? snap.data()?.[key] : 0, 0);
    if (current >= dailyLimits[key]) {
      throw new HttpsError("resource-exhausted", "오늘 가능한 사용량을 모두 사용했습니다. 내일 다시 시도해주세요.");
    }
    tx.set(ref, {
      uid,
      date,
      [key]: current + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function activePairCount(uid: string) {
  const pairs = await db.collection("pairs")
    .where("members", "array-contains", uid)
    .where("status", "==", "active")
    .get();
  return pairs.size;
}

async function assertPairCapacity(uid: string, emailHint?: string) {
  const entitlements = await getEntitlements(uid, emailHint);
  if (entitlements.isAdmin) return;
  const count = await activePairCount(uid);
  if (count >= entitlements.pairSlots) {
    throw new HttpsError("failed-precondition", "연결 슬롯이 가득 찼습니다. 추가 슬롯이 열리면 더 연결할 수 있습니다.");
  }
}

function normalizeNickname(input: unknown) {
  if (typeof input !== "string") {
    throw new HttpsError("invalid-argument", "ID 형식이 올바르지 않습니다.");
  }

  const nickname = input.normalize("NFKC").trim().replace(/\s+/g, " ");
  const normalized = nickname.toLowerCase();

  if (nickname.length < 2 || nickname.length > 20) {
    throw new HttpsError("invalid-argument", "ID는 2자 이상 20자 이하로 입력해주세요.");
  }

  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nickname)) {
    throw new HttpsError("invalid-argument", "ID에 사용할 수 없는 문자가 있습니다.");
  }

  if (/https?:\/\//i.test(nickname) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nickname)) {
    throw new HttpsError("invalid-argument", "URL이나 이메일 형태는 ID로 사용할 수 없습니다.");
  }

  if (reservedNicknames.has(normalized)) {
    throw new HttpsError("invalid-argument", "사용할 수 없는 ID입니다.");
  }

  return { nickname, normalized };
}

function asProfileString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function userDisplayFromData(data: { [field: string]: unknown } | undefined) {
  return {
    nickname: asProfileString(data?.nickname),
    displayName: asProfileString(data?.displayName),
  };
}

async function getUserDisplay(uid: string) {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) return { nickname: "", displayName: "" };
  return userDisplayFromData(userSnap.data());
}

function buildPairKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("__");
}

type PairMemberProfile = Record<string, { nickname?: string | null; displayName?: string | null }>;

function activePairPatch(uidA: string, uidB: string, profiles?: PairMemberProfile) {
  const profileA = profiles?.[uidA] ?? {};
  const profileB = profiles?.[uidB] ?? {};
  return {
    members: [uidA, uidB],
    pairKey: buildPairKey(uidA, uidB),
    memberMap: {
      [uidA]: true,
      [uidB]: true,
    },
    memberNicknames: {
      [uidA]: profileA.nickname ?? "",
      [uidB]: profileB.nickname ?? "",
    },
    memberDisplayNames: {
      [uidA]: profileA.displayName ?? "",
      [uidB]: profileB.displayName ?? "",
    },
    status: "active",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function ensurePairReadable(pairRef: DocumentReference, uidA: string, uidB: string) {
  const [profileA, profileB] = await Promise.all([getUserDisplay(uidA), getUserDisplay(uidB)]);
  await pairRef.set(activePairPatch(uidA, uidB, { [uidA]: profileA, [uidB]: profileB }), { merge: true });
  await pairRef.collection("settings").doc("categories").set({
    required: "필연",
    growth: "성장",
    freedom: "자유",
    updatedBy: uidA,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export const claimNickname = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const { nickname, normalized } = normalizeNickname(request.data?.nickname);

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const nicknameRef = db.doc(`nicknames/${normalized}`);
    const [userSnap, nicknameSnap] = await Promise.all([tx.get(userRef), tx.get(nicknameRef)]);

    if (!userSnap.exists) throw new HttpsError("failed-precondition", "사용자 프로필이 없습니다.");
    if (userSnap.data()?.nicknameNormalized) throw new HttpsError("failed-precondition", "이미 ID가 있습니다.");
    if (nicknameSnap.exists) throw new HttpsError("already-exists", "이미 사용 중인 ID입니다.");

    tx.set(nicknameRef, {
      uid,
      nickname,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      nickname,
      nicknameNormalized: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { nickname, nicknameNormalized: normalized };
});

export const changeNickname = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const { nickname, normalized } = normalizeNickname(request.data?.nickname);

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const nicknameRef = db.doc(`nicknames/${normalized}`);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "사용자 프로필이 없습니다.");

    const currentNormalized = userSnap.data()?.nicknameNormalized;
    if (currentNormalized === normalized) return;

    const nicknameSnap = await tx.get(nicknameRef);
    if (nicknameSnap.exists) throw new HttpsError("already-exists", "이미 사용 중인 ID입니다.");

    if (currentNormalized) tx.delete(db.doc(`nicknames/${currentNormalized}`));
    tx.set(nicknameRef, {
      uid,
      nickname,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      nickname,
      nicknameNormalized: normalized,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { nickname, nicknameNormalized: normalized };
});

export const searchNickname = onCall(callableOptions, async (request) => {
  requireUid(request.auth);
  const { normalized } = normalizeNickname(request.data?.nickname);
  const snap = await db.doc(`nicknames/${normalized}`).get();

  if (!snap.exists) return { exists: false };

  return {
    exists: true,
    nickname: snap.data()?.nickname,
  };
});

export const createPairRequest = onCall(callableOptions, async (request) => {
  const fromUid = requireUid(request.auth);
  const fromEmail = typeof request.auth?.token?.email === "string" ? request.auth.token.email : "";
  const { normalized } = normalizeNickname(request.data?.nickname);
  const nicknameSnap = await db.doc(`nicknames/${normalized}`).get();

  if (!nicknameSnap.exists) throw new HttpsError("not-found", "해당 ID를 찾을 수 없습니다.");

  const toUid = nicknameSnap.data()?.uid;
  if (!toUid || toUid === fromUid) {
    throw new HttpsError("failed-precondition", "자기 자신에게는 연결 요청을 보낼 수 없습니다.");
  }

  const pairKey = buildPairKey(fromUid, toUid);
  const existingPair = await db.collection("pairs")
    .where("pairKey", "==", pairKey)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!existingPair.empty) {
    const pairDoc = existingPair.docs[0];
    await ensurePairReadable(pairDoc.ref, fromUid, toUid);
    return { requestId: "", pairId: pairDoc.id, alreadyConnected: true };
  }

  await assertPairCapacity(fromUid, fromEmail);
  await assertPairCapacity(toUid);

  const duplicate = await db.collection("pairRequests")
    .where("fromUid", "==", fromUid)
    .where("toUid", "==", toUid)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!duplicate.empty) throw new HttpsError("already-exists", "이미 보낸 요청이 있습니다.");
  await assertDailyLimit(fromUid, "pairRequests", request.auth);

  const [fromProfile, toProfile] = await Promise.all([
    getUserDisplay(fromUid),
    getUserDisplay(toUid),
  ]);

  const requestRef = await db.collection("pairRequests").add({
    fromUid,
    toUid,
    fromNickname: fromProfile.nickname,
    toNickname: toProfile.nickname,
    fromDisplayName: fromProfile.displayName,
    toDisplayName: toProfile.displayName,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { requestId: requestRef.id };
});

export const acceptPairRequest = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const requestId = request.data?.requestId;
  if (typeof requestId !== "string") throw new HttpsError("invalid-argument", "요청 ID가 필요합니다.");

  const requestRefForCapacity = db.doc(`pairRequests/${requestId}`);
  const requestSnapForCapacity = await requestRefForCapacity.get();
  if (!requestSnapForCapacity.exists) throw new HttpsError("not-found", "요청을 찾을 수 없습니다.");
  const capacityData = requestSnapForCapacity.data()!;
  if (capacityData.toUid !== uid) throw new HttpsError("permission-denied", "수락 권한이 없습니다.");
  if (capacityData.status !== "pending") throw new HttpsError("failed-precondition", "대기 중인 요청이 아닙니다.");
  const toEmail = typeof request.auth?.token?.email === "string" ? request.auth.token.email : "";
  await assertPairCapacity(capacityData.fromUid);
  await assertPairCapacity(uid, toEmail);

  const pairId = await db.runTransaction(async (tx) => {
    const requestRef = db.doc(`pairRequests/${requestId}`);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError("not-found", "요청을 찾을 수 없습니다.");

    const data = requestSnap.data()!;
    if (data.toUid !== uid) throw new HttpsError("permission-denied", "수락 권한이 없습니다.");
    if (data.status !== "pending") throw new HttpsError("failed-precondition", "대기 중인 요청이 아닙니다.");

    const [fromUserSnap, toUserSnap] = await Promise.all([
      tx.get(db.doc(`users/${data.fromUid}`)),
      tx.get(db.doc(`users/${data.toUid}`)),
    ]);
    const fromProfile = userDisplayFromData(fromUserSnap.data());
    const toProfile = userDisplayFromData(toUserSnap.data());
    const pairRef = db.collection("pairs").doc();
    tx.set(pairRef, {
      ...activePairPatch(data.fromUid, data.toUid, {
        [data.fromUid]: {
          nickname: fromProfile.nickname || data.fromNickname || "",
          displayName: fromProfile.displayName || data.fromDisplayName || "",
        },
        [data.toUid]: {
          nickname: toProfile.nickname || data.toNickname || "",
          displayName: toProfile.displayName || data.toDisplayName || "",
        },
      }),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(requestRef, {
      status: "accepted",
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pairRef.collection("settings").doc("categories"), {
      required: "필연",
      growth: "성장",
      freedom: "자유",
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return pairRef.id;
  });

  return { pairId };
});

export const rejectPairRequest = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const requestId = request.data?.requestId;
  if (typeof requestId !== "string") throw new HttpsError("invalid-argument", "요청 ID가 필요합니다.");

  const requestRef = db.doc(`pairRequests/${requestId}`);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) throw new HttpsError("not-found", "요청을 찾을 수 없습니다.");
  if (requestSnap.data()?.toUid !== uid) throw new HttpsError("permission-denied", "거절 권한이 없습니다.");

  await requestRef.update({
    status: "rejected",
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

export const disconnectPair = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const pairId = request.data?.pairId;
  if (typeof pairId !== "string") throw new HttpsError("invalid-argument", "연결 ID가 필요합니다.");

  await db.runTransaction(async (tx) => {
    const pairRef = db.doc(`pairs/${pairId}`);
    const pairSnap = await tx.get(pairRef);
    if (!pairSnap.exists) throw new HttpsError("not-found", "연결을 찾을 수 없습니다.");

    const data = pairSnap.data()!;
    if (data.status !== "active" || data.memberMap?.[uid] !== true) {
      throw new HttpsError("permission-denied", "연결 해제 권한이 없습니다.");
    }

    tx.update(pairRef, {
      status: "deleted",
      deletedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

export const getPairPartnerInfo = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const pairId = request.data?.pairId;
  if (typeof pairId !== "string") throw new HttpsError("invalid-argument", "연결 ID가 필요합니다.");

  const pairRef = db.doc(`pairs/${pairId}`);
  const pairSnap = await pairRef.get();
  if (!pairSnap.exists) throw new HttpsError("not-found", "연결을 찾을 수 없습니다.");

  const pair = pairSnap.data()!;
  if (pair.status !== "active" || pair.memberMap?.[uid] !== true) {
    throw new HttpsError("permission-denied", "연결 정보를 볼 권한이 없습니다.");
  }

  const members = Array.isArray(pair.members) ? pair.members : [];
  const partnerUid = members.find((member) => member !== uid);
  if (!partnerUid) throw new HttpsError("failed-precondition", "파트너를 찾을 수 없습니다.");

  const [me, partner] = await Promise.all([getUserDisplay(uid), getUserDisplay(partnerUid)]);
  const nextMemberNicknames = {
    [uid]: me.nickname,
    [partnerUid]: partner.nickname,
  };
  const nextMemberDisplayNames = {
    [uid]: me.displayName,
    [partnerUid]: partner.displayName,
  };
  const shouldSyncPair = Object.entries(nextMemberNicknames).some(([memberUid, nickname]) => pair.memberNicknames?.[memberUid] !== nickname)
    || Object.entries(nextMemberDisplayNames).some(([memberUid, displayName]) => pair.memberDisplayNames?.[memberUid] !== displayName);

  if (shouldSyncPair) {
    await pairRef.set({
      memberNicknames: nextMemberNicknames,
      memberDisplayNames: nextMemberDisplayNames,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return {
    partnerUid,
    partnerNickname: partner.nickname,
    partnerDisplayName: partner.displayName,
    partnerName: partner.displayName || partner.nickname || "함께",
  };
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function limitedString(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.slice(0, max) : fallback;
}

function validHexColorString(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#888888";
}

function sanitizeLabels(value: unknown) {
  const labels = asRecord(value);
  return {
    required: limitedString(labels.required, 12, "필연") || "필연",
    growth: limitedString(labels.growth, 12, "성장") || "성장",
    freedom: limitedString(labels.freedom, 12, "자유") || "자유",
  };
}

function sanitizeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((item) => {
    const record = asRecord(item);
    return {
      text: limitedString(record.text, 1000),
      time: typeof record.time === "number" && Number.isFinite(record.time) ? record.time : Date.now(),
    };
  }).filter((item) => item.text.trim());
}

function sanitizeSharedDay(value: unknown) {
  const shared = asRecord(value);
  const todos = Array.isArray(shared.todos) ? shared.todos.slice(0, 300) : [];
  return {
    todos,
    note: limitedString(shared.note, 5000),
    color: validHexColorString(shared.color),
    labels: sanitizeLabels(shared.labels),
    authorName: limitedString(shared.authorName, 80),
    authorNickname: limitedString(shared.authorNickname, 80),
    authorHandle: limitedString(shared.authorHandle, 40),
    messages: sanitizeMessages(shared.messages),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export const prepareUpload = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const kind = request.data?.kind;
  if (kind !== "avatar" && kind !== "background") {
    throw new HttpsError("invalid-argument", "업로드 종류가 올바르지 않습니다.");
  }

  const email = typeof request.auth?.token?.email === "string" ? request.auth.token.email : "";
  const entitlements = await getEntitlements(uid, email);
  if (kind === "background" && !entitlements.backgroundImageUnlocked) {
    throw new HttpsError("permission-denied", "배경 이미지는 unlock 후 사용할 수 있습니다.");
  }

  await assertDailyLimit(uid, kind === "avatar" ? "avatarUploads" : "backgroundUploads", request.auth);
  const expiresAt = Date.now() + 5 * 60 * 1000;
  await db.doc(`uploadTickets/${uid}/kinds/${kind}`).set({
    uid,
    kind,
    expiresAt: Timestamp.fromMillis(expiresAt),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, expiresAt };
});

export const shareDay = onCall(callableOptions, async (request) => {
  const uid = requireUid(request.auth);
  const date = request.data?.date;
  const pairId = request.data?.pairId;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "날짜 형식이 올바르지 않습니다.");
  }
  if (pairId !== null && pairId !== undefined && typeof pairId !== "string") {
    throw new HttpsError("invalid-argument", "연결 정보가 올바르지 않습니다.");
  }

  await assertDailyLimit(uid, "shares", request.auth);
  const shared = sanitizeSharedDay(request.data?.shared);
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}/shared/${date}`), shared, { merge: true });

  if (typeof pairId === "string" && pairId) {
    const pairRef = db.doc(`pairs/${pairId}`);
    const pairSnap = await pairRef.get();
    const pair = pairSnap.exists ? pairSnap.data() : null;
    if (!pair || pair.status !== "active" || pair.memberMap?.[uid] !== true) {
      throw new HttpsError("permission-denied", "공유할 수 있는 연결이 아닙니다.");
    }
    batch.set(pairRef.collection("shared").doc(`${uid}_${date}`), {
      ...shared,
      uid,
      date,
    }, { merge: true });
  }

  await batch.commit();
  return { ok: true };
});

export const syncPairMemberDisplayName = onDocumentUpdated({ region, document: "users/{uid}" }, async (event) => {
  const uid = event.params.uid;
  const beforeName = asProfileString(event.data?.before.data()?.displayName);
  const afterName = asProfileString(event.data?.after.data()?.displayName);

  if (!uid || beforeName === afterName) return;

  const pairs = await db.collection("pairs")
    .where("members", "array-contains", uid)
    .where("status", "==", "active")
    .get();

  if (pairs.empty) return;

  const batch = db.batch();
  pairs.docs.forEach((pairDoc) => {
    batch.set(pairDoc.ref, {
      memberDisplayNames: {
        [uid]: afterName,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
});
