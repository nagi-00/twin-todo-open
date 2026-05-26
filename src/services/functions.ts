import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

function callable<TInput, TOutput>(name: string) {
  if (!functions) throw new Error("Firebase Functions are not configured.");
  return httpsCallable<TInput, TOutput>(functions, name);
}

export async function claimNickname(nickname: string) {
  const fn = callable<{ nickname: string }, { nickname: string; nicknameNormalized: string }>("claimNickname");
  return (await fn({ nickname })).data;
}

export async function changeNickname(nickname: string) {
  const fn = callable<{ nickname: string }, { nickname: string; nicknameNormalized: string }>("changeNickname");
  return (await fn({ nickname })).data;
}

export async function createPairRequest(nickname: string) {
  const fn = callable<{ nickname: string }, { requestId: string; pairId?: string; alreadyConnected?: boolean }>("createPairRequest");
  return (await fn({ nickname })).data;
}

export async function acceptPairRequest(requestId: string) {
  const fn = callable<{ requestId: string }, { pairId: string }>("acceptPairRequest");
  return (await fn({ requestId })).data;
}

export async function rejectPairRequest(requestId: string) {
  const fn = callable<{ requestId: string }, { ok: true }>("rejectPairRequest");
  return (await fn({ requestId })).data;
}

export async function disconnectPair(pairId: string) {
  const fn = callable<{ pairId: string }, { ok: true }>("disconnectPair");
  return (await fn({ pairId })).data;
}

export async function getPairPartnerInfo(pairId: string) {
  const fn = callable<{ pairId: string }, { partnerUid: string; partnerNickname: string; partnerDisplayName: string; partnerName: string }>("getPairPartnerInfo");
  return (await fn({ pairId })).data;
}

export async function prepareUpload(kind: "avatar" | "background") {
  const fn = callable<{ kind: "avatar" | "background" }, { ok: true; expiresAt: number }>("prepareUpload");
  return (await fn({ kind })).data;
}

export async function shareDay(date: string, pairId: string | null, shared: unknown) {
  const fn = callable<{ date: string; pairId: string | null; shared: unknown }, { ok: true }>("shareDay");
  return (await fn({ date, pairId, shared })).data;
}
