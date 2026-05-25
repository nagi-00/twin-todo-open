import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();

const db = getFirestore();
const region = "asia-northeast3";
const callableOptions = { region, enforceAppCheck: true };

const reservedNicknames = new Set([
  "admin",
  "support",
  "twintodo",
  "twin-todo",
  "관리자",
  "운영자",
]);

function requireUid(auth: { uid: string } | undefined) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  return auth.uid;
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

async function getUserNickname(uid: string) {
  const userSnap = await db.doc(`users/${uid}`).get();
  return userSnap.exists ? userSnap.data()?.nickname ?? null : null;
}

function buildPairKey(uidA: string, uidB: string) {
  return [uidA, uidB].sort().join("__");
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

  if (!existingPair.empty) throw new HttpsError("already-exists", "이미 연결된 사용자입니다.");

  const duplicate = await db.collection("pairRequests")
    .where("fromUid", "==", fromUid)
    .where("toUid", "==", toUid)
    .where("status", "==", "pending")
    .limit(1)
    .get();

  if (!duplicate.empty) throw new HttpsError("already-exists", "이미 보낸 요청이 있습니다.");

  const [fromNickname, toNickname] = await Promise.all([
    getUserNickname(fromUid),
    getUserNickname(toUid),
  ]);

  const requestRef = await db.collection("pairRequests").add({
    fromUid,
    toUid,
    fromNickname,
    toNickname,
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

  const pairId = await db.runTransaction(async (tx) => {
    const requestRef = db.doc(`pairRequests/${requestId}`);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError("not-found", "요청을 찾을 수 없습니다.");

    const data = requestSnap.data()!;
    if (data.toUid !== uid) throw new HttpsError("permission-denied", "수락 권한이 없습니다.");
    if (data.status !== "pending") throw new HttpsError("failed-precondition", "대기 중인 요청이 아닙니다.");

    const pairRef = db.collection("pairs").doc();
    tx.set(pairRef, {
      members: [data.fromUid, data.toUid],
      pairKey: buildPairKey(data.fromUid, data.toUid),
      memberMap: {
        [data.fromUid]: true,
        [data.toUid]: true,
      },
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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
