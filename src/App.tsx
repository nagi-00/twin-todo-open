import { User } from "firebase/auth";
import html2canvas from "html2canvas";
import {
  Edit3,
  Link2,
  Lock,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { isFirebaseConfigured } from "./firebase";
import { CATEGORY_KEYS, DEFAULT_CATEGORIES } from "./lib/categories";
import { addDays, monthMatrix, toDateKey } from "./lib/date";
import { logout, signInWithGoogle, subscribeAuth } from "./services/auth";
import { saveCategories, subscribeCategories } from "./services/categories";
import { acceptPairRequest, claimNickname, createPairRequest, disconnectPair, getPairPartnerInfo, rejectPairRequest } from "./services/functions";
import { JournalEntry, saveJournal, subscribeJournal } from "./services/journal";
import { subscribeActivePair, subscribePairRequests } from "./services/pairs";
import { ensureUserProfile, getAvatarUrl, subscribeProfile, updateDisplayName, uploadAvatar } from "./services/profile";
import { addTodo, archiveTodo, getTodosForDate, reorderTodos, subscribeTodos, updateTodoPatch, updateTodoTitle } from "./services/todos";
import {
  addRoutine,
  DailyEntry,
  Message,
  removeRoutine,
  saveDaily,
  saveDateColor,
  saveMessages,
  savePairSharedDay,
  saveSharedDay,
  SharedDay,
  subscribeDaily,
  subscribeDateColors,
  subscribeNotes,
  subscribeTextDoc,
  subscribeMessages,
  subscribePairSharedDay,
  subscribeRoutines,
  subscribeSharedDay,
  saveTextDoc,
} from "./services/userData";
import type { CategoryKey, CategoryLabels, Pair, PairRequest, Routine, TodoItem, UserProfile } from "./types";

type Scope = { type: "solo"; uid: string } | { type: "pair"; pairId: string; uid: string };
type TabKey = "todo" | "journal" | "week" | "shared";
type MusicTrack = { url: string; title: string };

const ADMIN_EMAIL = "mx.gin.xo@gmail.com";
const BULLETS = ["☐", "☑", "☒"] as const;
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MOODS = ["행복", "보통", "슬픔", "화남", "설렘"];
const MOOD_ICONS: Record<string, string> = { 행복: "♡", 보통: "○", 슬픔: "⋯", 화남: "!", 설렘: "✦" };
const DEF_SCHED: Record<number, { s: number; e: number }> = { 1: { s: 6, e: 13 }, 2: { s: 6, e: 18 }, 3: { s: 6, e: 13 }, 4: { s: 6, e: 18 }, 5: { s: 6, e: 21 } };
const CARD: CSSProperties = {
  background: "#fff",
  borderRadius: "10px",
  boxShadow: "0 1px 5px rgba(0,0,0,0.07)",
  padding: "1.5rem",
};
const FONT_OPTIONS = [
  { key: "leeseyoon", label: "이서윤", family: "LeeSeoyoon" },
  { key: "concon", label: "콘콘", family: "Concon" },
  { key: "maruminya", label: "마루미냐", family: "Maruminya" },
  { key: "pretendard", label: "프리텐다드", family: "PretendardLocal" },
] as const;
type FontKey = typeof FONT_OPTIONS[number]["key"];
const CATEGORY_ORDER: CategoryKey[] = ["required", "growth", "freedom"];
const CATEGORY_ACCENT: Record<CategoryKey, string> = {
  required: "#8A4545",
  growth: "",
  freedom: "#4a7c5a",
};
const PAPER_TEXTURES = [
  "/textures/papertex1.jpg",
  "/textures/papertex2.jpg",
  "/textures/papertex3.png",
  "/textures/papertex4.jpg",
  "/textures/papertex5.png",
  "/textures/papertex6.jpg",
];

function compactTime(time: number) {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function readAppliedActions(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}") as { routines?: boolean; x?: boolean };
  } catch {
    return {};
  }
}

function isCoarsePointer() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

function isComposing(event: KeyboardEvent<HTMLTextAreaElement> | KeyboardEvent<HTMLInputElement>) {
  return Boolean((event.nativeEvent as { isComposing?: boolean }).isComposing);
}

function pill(bg = "#f0f0f0", fg = "#666", sm = false) {
  return {
    background: bg,
    color: fg,
    border: "none",
    borderRadius: "9999px",
    padding: sm ? ".28rem .7rem" : ".4rem .95rem",
    fontSize: sm ? ".72rem" : ".78rem",
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: ".03em",
  } as const;
}

function sectionLabel(extra?: CSSProperties) {
  return { fontSize: ".6rem", letterSpacing: ".2em", color: "#bbb", marginBottom: ".5rem", display: "block", ...extra };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportElementAsPng(elementId: string, filename: string, backgroundColor: string) {
  await document.fonts.ready;
  const element = document.getElementById(elementId);
  if (!element) return;
  const canvas = await html2canvas(element, { backgroundColor, scale: 2, useCORS: true });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    alert("클립보드에 복사했습니다.");
  } catch {
    downloadBlob(blob, filename);
  }
}

function ytEmbed(raw: string) {
  try {
    const u = new URL(raw.trim());
    const v = u.searchParams.get("v");
    const list = u.searchParams.get("list");
    const sid = u.hostname.includes("youtu.be") ? u.pathname.slice(1).split("?")[0] : null;
    const vid = v || sid;
    const params = "rel=0&modestbranding=1&playsinline=1";
    if (vid && list) return `https://www.youtube-nocookie.com/embed/${vid}?list=${list}&${params}`;
    if (vid) return `https://www.youtube-nocookie.com/embed/${vid}?${params}`;
    if (list) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&${params}`;
    return null;
  } catch {
    return null;
  }
}

async function getYoutubeTitle(raw: string) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(raw.trim())}&format=json`);
    if (!res.ok) throw new Error("title fetch failed");
    const data = await res.json() as { title?: string };
    return data.title?.trim() || "YouTube video";
  } catch {
    return "YouTube video";
  }
}

function loadSched() {
  try {
    return JSON.parse(localStorage.getItem("focusSched") || "null") || DEF_SCHED;
  } catch {
    return DEF_SCHED;
  }
}

function getErrorMessage(err: unknown) {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "auth/popup-blocked") return "팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단을 허용해주세요.";
    if (code === "auth/popup-closed-by-user") return "로그인 창이 닫혔습니다. 다시 시도해주세요.";
    if (code === "auth/unauthorized-domain") return "현재 도메인이 Firebase Authentication 승인된 도메인에 없습니다.";
    if (code === "auth/operation-not-allowed") return "Firebase Authentication에서 Google 로그인이 아직 사용 설정되지 않았습니다.";
    return `${code}: ${err instanceof Error ? err.message : "Firebase 오류가 발생했습니다."}`;
  }
  return err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribeAuth(async (nextUser) => {
    setUser(nextUser);
    setLoading(false);
    if (nextUser) await ensureUserProfile(nextUser);
  }), []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return undefined;
    }
    return subscribeProfile(user.uid, setProfile);
  }, [user]);

  if (!isFirebaseConfigured) return <Shell title="Firebase 설정 필요" body=".env.local에 Firebase Web App 설정값을 채워주세요." />;
  if (loading) return <Shell title="TwinTodo" body="불러오는 중입니다." />;
  if (!user) return <LoginScreen />;
  if (!profile) return <Shell title="TwinTodo" body="프로필을 준비하는 중입니다." />;
  if (!profile.nickname) return <HandleOnboarding displayName={profile.displayName} />;

  return <Workspace user={user} profile={profile} />;
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main className="center-screen">
      <section className="login-card">
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <section className="login-card">
        <div className="login-mark">𝘁𝘄𝗶𝗻-𝘁𝗼𝗱𝗼</div>
        <p>혼자 조용히 쓰다가, 원하면 서로의 하루를 연결하세요.</p>
        <button className="dark-btn" onClick={handleLogin} disabled={busy}>
          {busy ? "입장 중..." : "Google로 입장하기"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

function HandleOnboarding({ displayName }: { displayName: string }) {
  const [handle, setHandle] = useState(displayName.replace(/\s/g, "").slice(0, 12));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await claimNickname(handle);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ID 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <section className="login-card">
        <span className="micro-label">first step</span>
        <h1>ID 만들기</h1>
        <p>이 ID는 @nagi처럼 표시되고, 다른 사용자가 연결 요청을 보낼 때 쓰는 고유 핸들이에요. 한 번 만들면 변경할 수 없습니다.</p>
        <input className="soft-input" value={handle} maxLength={20} onChange={(event) => setHandle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} />
        <button className="dark-btn" onClick={submit} disabled={busy || handle.trim().length < 2}>
          {busy ? "확인 중..." : "시작하기"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

function Workspace({ user, profile }: { user: User; profile: UserProfile }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tab, setTab] = useState<TabKey>("todo");
  const [pair, setPair] = useState<Pair | null>(null);
  const [requests, setRequests] = useState<PairRequest[]>([]);
  const [dateColors, setDateColors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeWidget, setActiveWidget] = useState<null | "weather" | "music" | "pomo">(null);
  const [fontKey, setFontKey] = useState<FontKey>(() => (localStorage.getItem("twintodoFont") as FontKey) || "leeseyoon");
  const [partnerName, setPartnerName] = useState<string>("");

  useEffect(() => subscribeActivePair(user.uid, setPair), [user.uid]);
  useEffect(() => subscribePairRequests(user.uid, setRequests), [user.uid]);
  useEffect(() => subscribeDateColors(user.uid, setDateColors), [user.uid]);
  useEffect(() => subscribeNotes(user.uid, setNotes), [user.uid]);
  useEffect(() => {
    let cancelled = false;
    const partnerUid = pair?.members.find((member) => member !== user.uid);
    setPartnerName(partnerUid ? pair?.memberNicknames?.[partnerUid] || "" : "");
    if (!pair) return;
    getPairPartnerInfo(pair.id)
      .then((info) => {
        if (!cancelled) setPartnerName(info.partnerName);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pair, user.uid]);
  useEffect(() => {
    const found = FONT_OPTIONS.find((font) => font.key === fontKey) || FONT_OPTIONS[0];
    document.documentElement.style.setProperty("--app-font", `"${found.family}", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`);
    document.documentElement.dataset.font = found.key;
    localStorage.setItem("twintodoFont", found.key);
  }, [fontKey]);

  const dateKey = toDateKey(selectedDate);
  const color = dateColors[dateKey] || "#2d2d2d";
  const scope: Scope = useMemo(() => ({ type: "solo", uid: user.uid }), [user.uid]);

  return (
    <div className="app" style={{ display: "flex", minHeight: "100vh" }}>
      <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
      <div className={sidebarOpen ? "sidebar-overlay open" : "sidebar-overlay"} onClick={() => setSidebarOpen(false)} />
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div style={{ padding: "1.25rem 1rem 2rem" }}>
          <ProfilePanel
            user={user}
            profile={profile}
            color={color}
            fontKey={fontKey}
            onFontChange={setFontKey}
            requests={requests}
            pair={pair}
          />
          <CalendarPanel selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setSidebarOpen(false); }} colors={dateColors} notes={notes} accent={color} />
        </div>
      </aside>
      <main className="main main-content" onClick={() => activeWidget && setActiveWidget(null)}>
        <div className="tab-bar">
          {[
            ["todo", "ᴛᴏᴅᴏ"],
            ["journal", "ᴊᴏᴜʀɴᴀʟ"],
            ["week", "ᴡᴇᴇᴋ"],
            ["shared", "sʜᴀʀᴇᴅ"],
          ].map(([key, label]) => (
            <button
              key={key}
              style={{
                ...pill(tab === key ? color : "#fff", tab === key ? "#fff" : "#bbb"),
                boxShadow: tab === key ? `0 2px 8px ${color}44` : "0 1px 3px rgba(0,0,0,0.08)",
                transition: "all .2s",
              }}
              onClick={() => setTab(key as TabKey)}
            >{label}</button>
          ))}
        </div>

        {tab === "todo" && <TodoView scope={scope} pair={pair} uid={user.uid} profile={profile} selectedDate={selectedDate} dateKey={dateKey} color={color} />}
        {tab === "journal" && <JournalView uid={user.uid} selectedDate={selectedDate} dateKey={dateKey} color={color} />}
        {tab === "week" && <WeekView uid={user.uid} selectedDate={selectedDate} />}
        {tab === "shared" && <SharedView uid={user.uid} displayName={profile.displayName} partnerName={partnerName} dateKey={dateKey} color={color} pair={pair} />}
      </main>
      <WeatherWidget color={color} open={activeWidget === "weather"} onToggle={() => setActiveWidget((value) => value === "weather" ? null : "weather")} />
      <MusicWidget userId={user.uid} color={color} open={activeWidget === "music"} onToggle={() => setActiveWidget((value) => value === "music" ? null : "music")} />
      <PomodoroWidget color={color} open={activeWidget === "pomo"} onToggle={() => setActiveWidget((value) => value === "pomo" ? null : "pomo")} />
      {user.email === ADMIN_EMAIL && <DemianWidget />}
    </div>
  );
}

function ProfilePanel({
  user,
  profile,
  color,
  fontKey,
  onFontChange,
  requests,
  pair,
}: {
  user: User;
  profile: UserProfile;
  color: string;
  fontKey: FontKey;
  onFontChange: (key: FontKey) => void;
  requests: PairRequest[];
  pair: Pair | null;
}) {
  const [name, setName] = useState(profile.displayName);
  const [editing, setEditing] = useState(false);
  const [draftFontKey, setDraftFontKey] = useState<FontKey>(fontKey);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    getAvatarUrl(profile.avatarPath).then(setAvatarUrl).catch(() => setAvatarUrl(null));
  }, [profile.avatarPath]);

  useEffect(() => {
    if (editing) setDraftFontKey(fontKey);
  }, [editing, fontKey]);

  async function saveName() {
    if (!name.trim()) return;
    await updateDisplayName(user.uid, name.trim());
    onFontChange(draftFontKey);
    setEditing(false);
  }

  return (
    <section className="profile-panel">
      <button className="avatar-btn" onClick={() => setEditorOpen(true)} title="프로필 이미지 편집">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
      </button>
      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ fontSize: ".75rem", color: "#bbb", letterSpacing: ".05em", marginBottom: ".35rem" }}>
          {editing ? (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && saveName()}
              autoFocus
              style={{ width: "100%", textAlign: "center", border: "1px solid #eee", borderRadius: "6px", padding: ".32rem .45rem", fontFamily: "inherit", fontSize: ".8rem", outline: "none" }}
            />
          ) : (
            <>{profile.displayName}님의 공간</>
          )}
        </div>
        <div style={{ fontSize: ".62rem", color: "#c6c6c6", letterSpacing: ".08em", marginBottom: ".45rem" }}>@{profile.nickname}</div>
        {editing && <p className="tiny-note" style={{ textAlign: "center", margin: "0 0 .45rem" }}>ID는 연결 보안을 위해 변경할 수 없습니다.</p>}
        <div style={{ display: "flex", gap: ".3rem", justifyContent: "center" }}>
          <button onClick={logout} style={pill("#f5f5f5", "#aaa", true)}><LogOut size={12} /> 로그아웃</button>
          <button onClick={editing ? saveName : () => setEditing(true)} style={pill(editing ? color : "#f5f5f5", editing ? "#fff" : "#aaa", true)}><Edit3 size={12} /> {editing ? "저장" : "편집"}</button>
        </div>
        {editing && (
          <div className="profile-settings">
            <FontPanel fontKey={draftFontKey} onChange={setDraftFontKey} color={color} />
            <PairPanel requests={requests} pair={pair} color={color} />
          </div>
        )}
      </div>
      {editorOpen && <AvatarEditor uid={user.uid} onSaved={(url) => setAvatarUrl(url)} onClose={() => setEditorOpen(false)} />}
    </section>
  );
}

function AvatarEditor({ uid, onSaved, onClose }: { uid: string; onSaved: (url: string) => void; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [shape, setShape] = useState<"circle" | "square">("circle");
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const image = new window.Image();
    image.onload = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath();
      if (shape === "circle") {
        ctx.arc(128, 128, 120, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.translate(128 + x, 128 + y);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale((flipX ? -1 : 1) * scale, (flipY ? -1 : 1) * scale);
      const fit = Math.min(240 / image.width, 240 / image.height);
      const drawW = image.width * fit;
      const drawH = image.height * fit;
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };
    image.src = src;
  }, [src, shape, angle, scale, x, y, flipX, flipY]);

  function selectFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSrc(String(reader.result));
    reader.readAsDataURL(file);
  }

  function resetEdits() {
    setShape("circle");
    setAngle(0);
    setScale(1);
    setX(0);
    setY(0);
    setFlipX(false);
    setFlipY(false);
  }

  function startDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!src) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, baseX: x, baseY: y };
  }

  function moveDrag(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    setX(Math.max(-120, Math.min(120, dragRef.current.baseX + event.clientX - dragRef.current.x)));
    setY(Math.max(-120, Math.min(120, dragRef.current.baseY + event.clientY - dragRef.current.y)));
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) return;
    const url = await uploadAvatar(uid, new File([blob], "avatar.webp", { type: "image/webp" }));
    onSaved(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="avatar-editor modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><b>프로필 이미지 편집</b><button className="icon-btn" onClick={onClose}><X size={15} /></button></div>
        <div className="avatar-editor-layout">
          <div>
            <canvas
              ref={canvasRef}
              width={256}
              height={256}
              className={shape === "circle" ? "avatar-canvas circle" : "avatar-canvas"}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={() => { dragRef.current = null; }}
              onPointerCancel={() => { dragRef.current = null; }}
            />
            <div className="avatar-hint">{src ? "이미지를 드래그해서 위치를 조정하세요." : "이미지를 선택하면 미리보기가 표시됩니다."}</div>
            <label className="upload-drop"><Upload size={16} />{src ? "다른 이미지 선택" : "이미지 선택"}<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} /></label>
          </div>
          <div className="avatar-controls">
            <div className="segmented">
              <button className={shape === "circle" ? "active" : ""} onClick={() => setShape("circle")}>원형</button>
              <button className={shape === "square" ? "active" : ""} onClick={() => setShape("square")}>정사각</button>
            </div>
            <div className="editor-grid">
              <label><span>회전 {angle}°</span><input type="range" min="-180" max="180" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></label>
              <label><span>확대 {Math.round(scale * 100)}%</span><input type="range" min="0.6" max="2.8" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
              <label><span>좌우 {x}</span><input type="range" min="-120" max="120" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
              <label><span>상하 {y}</span><input type="range" min="-120" max="120" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
            </div>
            <div className="button-row">
              <button className={flipX ? "soft-btn active" : "soft-btn"} onClick={() => setFlipX((v) => !v)}>좌우반전</button>
              <button className={flipY ? "soft-btn active" : "soft-btn"} onClick={() => setFlipY((v) => !v)}>상하반전</button>
              <button className="soft-btn" onClick={resetEdits}>초기화</button>
            </div>
            <button className="dark-btn avatar-save" onClick={save} disabled={!src}>저장</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CalendarPanel({ selectedDate, onSelect, colors, notes, accent }: { selectedDate: Date; onSelect: (date: Date) => void; colors: Record<string, string>; notes: Record<string, string>; accent: string }) {
  const [anchor, setAnchor] = useState(selectedDate);
  const [notesList, setNotesList] = useState(false);
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(new Date());
  return (
    <section className="calendar-panel">
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <div style={{ fontSize: ".75rem", color: "#bbb", letterSpacing: ".05em", marginBottom: ".15rem" }}>{anchor.getFullYear()}</div>
        <div style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: ".6rem" }}>{anchor.toLocaleDateString("en-US", { month: "long" })}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: ".25rem" }}>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))} style={pill("#f5f5f5", "#888", true)}>←</button>
          <button onClick={() => { const now = new Date(); setAnchor(now); onSelect(now); }} style={pill("#f5f5f5", "#888", true)}>Today</button>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))} style={pill("#f5f5f5", "#888", true)}>→</button>
        </div>
      </div>
      <button onClick={() => setNotesList((value) => !value)} style={{ ...pill("#f7f7f7", "#aaa", true), width: "100%", marginBottom: ".75rem", borderRadius: ".4rem", textAlign: "center" }}>{notesList ? "← back" : "Notes"}</button>
      {!notesList ? <>
        <div className="cal-grid week">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}</div>
        <div className="cal-grid">
          {cells.map((cell, i) => {
            if (!cell) return <span key={`e-${i}`} />;
            const key = toDateKey(cell);
            const isSelected = key === selectedKey;
            const isToday = key === todayKey;
            const dayColor = colors[key] || accent;
            return <button
              key={key}
              className={isSelected ? "day selected" : "day"}
              style={{
                border: `1.5px solid ${isToday && !isSelected ? dayColor : "transparent"}`,
                background: isSelected ? dayColor : "transparent",
                color: isSelected ? "#fff" : isToday ? dayColor : "#444",
                fontWeight: isToday ? "bold" : 400,
              }}
              onClick={() => onSelect(cell)}
            >{cell.getDate()}{notes[key] && <span style={{ position: "absolute", bottom: "2px", width: "4px", height: "4px", borderRadius: "50%", background: isSelected ? "rgba(255,255,255,.7)" : dayColor }} />}</button>;
          })}
        </div>
      </> : <div>
        {Object.entries(notes).sort((a, b) => b[0].localeCompare(a[0])).map(([date, text]) => (
          <div key={date} className="note-list-item">
            <div>{new Date(`${date}T00:00:00`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
            <p style={{ color: colors[date] || accent }}>{text}</p>
          </div>
        ))}
        {Object.keys(notes).length === 0 && <div className="empty-note-list">아직 저장된 한마디가 없습니다.</div>}
      </div>}
    </section>
  );
}

function FontPanel({ fontKey, onChange, color }: { fontKey: FontKey; onChange: (key: FontKey) => void; color: string }) {
  return <section className="font-panel">
    <span style={sectionLabel()}>font</span>
    <div>
      {FONT_OPTIONS.map((font) => (
        <button key={font.key} onClick={() => onChange(font.key)} style={{ ...pill(fontKey === font.key ? color : "#f5f5f5", fontKey === font.key ? "#fff" : "#aaa", true), fontFamily: `"${font.family}", sans-serif` }}>{font.label}</button>
      ))}
    </div>
  </section>;
}

function PairPanel({ requests, pair, color }: { requests: PairRequest[]; pair: Pair | null; color: string }) {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  async function send() {
    setMessage("");
    try {
      const result = await createPairRequest(handle);
      setHandle("");
      if (result.alreadyConnected) {
        setMessage("이미 연결된 Twin을 다시 불러왔습니다.");
      } else {
        setMessage("요청을 보냈습니다.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "요청에 실패했습니다.");
    }
  }
  async function unlink() {
    if (!pair || !window.confirm("연결된 파트너를 해제할까요? 이후 Share 공유가 중단됩니다.")) return;
    setMessage("");
    try {
      await disconnectPair(pair.id);
      setMessage("파트너 연결을 해제했습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "연결 해제에 실패했습니다.");
    }
  }
  return (
    <section className="pair-panel">
      <span style={sectionLabel()}>ID로 연결</span>
      {pair && <p className="tiny-note pair-status" style={{ color }}>연결됨 · Share로만 공유돼요</p>}
      {pair && <button className="unlink-btn" onClick={unlink}>연결된 파트너 해제</button>}
      <div className="tiny-form"><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="상대 ID" /><button onClick={send}><Link2 size={14} /></button></div>
      {message && <p className="tiny-note">{message}</p>}
      {requests.map((req) => <div className="request" key={req.id}><span>@{req.fromNickname}</span><button onClick={() => acceptPairRequest(req.id)}>✓</button><button onClick={() => rejectPairRequest(req.id)}>×</button></div>)}
    </section>
  );
}

function TodoView({ scope, pair, uid, profile, selectedDate, dateKey, color }: { scope: Scope; pair: Pair | null; uid: string; profile: UserProfile; selectedDate: Date; dateKey: string; color: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [optimisticTodos, setOptimisticTodos] = useState<TodoItem[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>(DEFAULT_CATEGORIES);
  const [inputs, setInputs] = useState<Record<CategoryKey, string>>({ required: "", growth: "", freedom: "" });
  const [note, setNote] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [todoError, setTodoError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [texture] = useState(() => PAPER_TEXTURES[Math.floor(Math.random() * PAPER_TEXTURES.length)]);
  const scopeKey = scope.type === "pair" ? `pair:${scope.pairId}` : `solo:${uid}`;
  const appliedKey = `twintodoApplied:${scopeKey}:${dateKey}`;
  const [appliedActions, setAppliedActions] = useState(() => readAppliedActions(appliedKey));
  const [applyingAction, setApplyingAction] = useState<null | "routines" | "x">(null);
  const [confettiNonce, setConfettiNonce] = useState(0);
  const previousPct = useRef<number | null>(null);

  useEffect(() => subscribeTodos(scope, dateKey, setTodos), [scope, scopeKey, dateKey]);
  useEffect(() => {
    setOptimisticTodos((prev) => prev.filter((todo) => !todos.some((serverTodo) => serverTodo.id === todo.id)));
  }, [todos]);
  useEffect(() => subscribeCategories(scope, setLabels), [scope, scopeKey]);
  useEffect(() => subscribeTextDoc(["users", uid, "notes", dateKey], "text", setNote), [uid, dateKey]);
  useEffect(() => subscribeMessages(uid, dateKey, setMessages), [uid, dateKey]);
  useEffect(() => subscribeRoutines(uid, setRoutines), [uid]);
  useEffect(() => {
    setAppliedActions(readAppliedActions(appliedKey));
    setApplyingAction(null);
  }, [appliedKey]);

  const mergedTodos = useMemo(() => {
    const map = new Map<string, TodoItem>();
    todos.forEach((todo) => map.set(todo.id, todo));
    optimisticTodos.forEach((todo) => map.set(todo.id, todo));
    return [...map.values()].sort((a, b) => (a.position ?? Number.POSITIVE_INFINITY) - (b.position ?? Number.POSITIVE_INFINITY));
  }, [todos, optimisticTodos]);
  const visible = mergedTodos.filter((todo) => todo.status !== "archived");
  const done = visible.filter((todo) => (todo.state ?? (todo.status === "done" ? 1 : 0)) === 1).length;
  const pct = visible.length ? Math.round(done / visible.length * 100) : 0;
  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const dayOfWeek = new Date(`${dateKey}T00:00:00`).getDay();
  const dueRoutines = routines.filter((r) => (r.frequency || r.freq) === "daily" || (r.weekdays || [r.weekday]).includes(dayOfWeek));

  useEffect(() => {
    const last = previousPct.current;
    const confettiKey = `twintodoConfetti:${scopeKey}:${dateKey}`;
    if (visible.length > 0 && pct === 100 && last !== null && last < 100 && sessionStorage.getItem(confettiKey) !== "1") {
      sessionStorage.setItem(confettiKey, "1");
      setConfettiNonce((value) => value + 1);
    }
    previousPct.current = pct;
  }, [dateKey, pct, scopeKey, visible.length]);

  function markApplied(action: "routines" | "x") {
    setAppliedActions((prev) => {
      const next = { ...prev, [action]: true };
      localStorage.setItem(appliedKey, JSON.stringify(next));
      return next;
    });
  }

  async function submit(key: CategoryKey) {
    const text = inputs[key].trim();
    if (!text) return;
    setTodoError("");
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: TodoItem = {
      id: tempId,
      ownerUid: uid,
      categoryKey: key,
      title: text,
      status: "open",
      state: 0,
      hidden: false,
      important: false,
      memo: "",
      position: Date.now(),
      date: dateKey,
    };
    setOptimisticTodos((prev) => [...prev, optimistic]);
    setInputs((prev) => ({ ...prev, [key]: "" }));
    try {
      const id = await addTodo(scope, dateKey, key, text);
      setOptimisticTodos((prev) => prev.map((todo) => todo.id === tempId ? { ...todo, id } : todo));
    } catch (err) {
      setOptimisticTodos((prev) => prev.filter((todo) => todo.id !== tempId));
      setInputs((prev) => ({ ...prev, [key]: text }));
      setTodoError(err instanceof Error ? err.message : "할일 등록에 실패했습니다.");
    }
  }

  function patchLocal(todoId: string, patch: Partial<TodoItem>) {
    setTodos((prev) => prev.map((todo) => todo.id === todoId ? { ...todo, ...patch } : todo));
    setOptimisticTodos((prev) => prev.map((todo) => todo.id === todoId ? { ...todo, ...patch } : todo));
  }

  async function sendTimestamp() {
    const text = messageInput.trim();
    if (!text) return;
    const next = [...messages, { text, time: Date.now() }];
    setMessages(next);
    setMessageInput("");
    await saveMessages(uid, dateKey, next);
  }

  async function applyRoutines() {
    if (applyingAction || appliedActions.routines || !dueRoutines.length) return;
    setApplyingAction("routines");
    try {
      await Promise.all(dueRoutines.map((r) => addTodo(scope, dateKey, r.categoryKey, r.text)));
      markApplied("routines");
    } finally {
      setApplyingAction(null);
    }
  }

  async function applyYesterdayX() {
    if (applyingAction || appliedActions.x) return;
    setApplyingAction("x");
    const previousDate = addDays(selectedDate, -1);
    const previousKey = toDateKey(previousDate);
    const failed = (await getTodosForDate(scope, previousKey)).filter((todo) => (todo.state ?? 0) === 2 && todo.status !== "archived");
    if (!failed.length) {
      setApplyingAction(null);
      alert("전날 ☒ 항목이 없습니다.");
      return;
    }
    try {
      await Promise.all(failed.map((todo) => addTodo(scope, dateKey, todo.categoryKey, todo.title)));
      markApplied("x");
    } finally {
      setApplyingAction(null);
    }
  }

  async function moveTodo(categoryKey: CategoryKey, todo: TodoItem, dir: -1 | 1) {
    const categoryList = visible.filter((item) => item.categoryKey === categoryKey);
    const from = categoryList.findIndex((item) => item.id === todo.id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= categoryList.length) return;
    const reorderedCategory = [...categoryList];
    [reorderedCategory[from], reorderedCategory[to]] = [reorderedCategory[to], reorderedCategory[from]];
    const queues = new Map<CategoryKey, TodoItem[]>(CATEGORY_ORDER.map((key) => [key, key === categoryKey ? [...reorderedCategory] : visible.filter((item) => item.categoryKey === key)]));
    const nextVisible = visible.map((item) => queues.get(item.categoryKey)?.shift() || item);
    setTodos((prev) => {
      const active = new Map(nextVisible.map((item, index) => [item.id, { ...item, position: index + 1 }]));
      return prev.map((item) => active.get(item.id) || item);
    });
    await reorderTodos(scope, nextVisible);
  }

  async function archiveAll() {
    if (!visible.length || !window.confirm("오늘 목록을 전부 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    setTodos((prev) => prev.map((todo) => todo.status === "archived" ? todo : { ...todo, status: "archived" }));
    await Promise.all(visible.map((todo) => archiveTodo(scope, todo)));
  }

  async function shareToday() {
    try {
      const payload = { todos: visible, note, color, labels, authorName: profile.displayName, authorNickname: profile.nickname, messages, updatedAt: null };
      await saveSharedDay(uid, dateKey, payload);
      if (pair) await savePairSharedDay(pair.id, uid, dateKey, payload);
      alert("오늘의 공유 카드가 업데이트되었습니다.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "공유 저장에 실패했습니다.");
    }
  }

  async function printDaylog() {
    setPrinting(true);
    window.setTimeout(async () => {
      await exportElementAsPng("xcard", `todo-${dateKey}.png`, "#fff");
      setPrinting(false);
    }, 100);
  }

  return (
    <section style={CARD}>
      {confettiNonce > 0 && <ThemeConfetti key={confettiNonce} color={color} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", gap: ".5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: "bold", lineHeight: 1.5, flex: 1, color: "#222" }}>{dateLabel}</h2>
        <div className="todo-top-actions">
          <button className="todo-share-btn" style={{ borderColor: `${color}55`, color }} onClick={shareToday}>Share</button>
          <input
            type="color"
            value={color}
            onChange={(event) => saveDateColor(uid, dateKey, event.target.value)}
            style={{ width: "1.25rem", height: "1.25rem", border: "none", padding: 0, borderRadius: "9999px", cursor: "pointer", flexShrink: 0 }}
          />
        </div>
      </div>

      {visible.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".25rem" }}>
            <span style={{ fontSize: ".58rem", letterSpacing: ".1em", color: "#ccc" }}>오늘의 완료율</span>
            <span style={{ fontSize: ".62rem", fontWeight: "bold", color }}>{pct}%</span>
          </div>
          <div style={{ height: "2.5px", background: "#f0f0f0", borderRadius: "9999px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "9999px", transition: "width .6s ease" }} />
          </div>
        </div>
      )}
      <EditableBlock
        className="note-box"
        viewClassName="note-view"
        viewStyle={{ color }}
        value={note}
        onChange={(value) => {
          setNote(value);
          void saveTextDoc(["users", uid, "notes", dateKey], "text", value);
        }}
        placeholder="오늘의 한마디"
        rows={3}
      />
      <div className="todo-input-grid">
        {CATEGORY_ORDER.map((key) => (
          <div className="todo-input-card" key={key}>
            <textarea
              value={inputs[key]}
              onChange={(event) => setInputs((prev) => ({ ...prev, [key]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !isCoarsePointer()) {
                  event.preventDefault();
                  void submit(key);
                }
              }}
              placeholder={labels[key]}
              rows={3}
            />
            <button onClick={() => submit(key)}>추가</button>
          </div>
        ))}
      </div>
      {todoError && <p className="error-text">{todoError}</p>}
      <div>
        {CATEGORY_ORDER.map((key, idx) => {
          const catColor = CATEGORY_ACCENT[key] || color;
          const list = visible.filter((todo) => todo.categoryKey === key);
          return (
            <div key={key} style={{ marginBottom: ".7rem" }}>
              <span style={sectionLabel({ color: `${catColor}bb` })}>{labels[key]}</span>
              {list.map((todo, catIdx) => <TodoRow key={todo.id} todo={todo} scope={scope} color={color} editMode={editMode} catIdx={catIdx} catLength={list.length} onPatch={patchLocal} onMove={(dir) => moveTodo(key, todo, dir)} />)}
              {list.length === 0 && !editMode && <div style={{ fontSize: ".75rem", color: "#e8e8e8", padding: ".1rem 0" }}>—</div>}
              {idx < CATEGORY_ORDER.length - 1 && <div style={{ borderTop: `1px solid ${color}22`, margin: ".6rem 0" }} />}
            </div>
          );
        })}
      </div>
      <div className="todo-quick-actions">
        {!appliedActions.x && <button disabled={applyingAction === "x"} onClick={applyYesterdayX} style={pill("#f0f0f0", "#888", true)}>☒ 적용</button>}
        {!appliedActions.routines && dueRoutines.length > 0 && <button disabled={applyingAction === "routines"} style={pill(color, "#fff", true)} onClick={applyRoutines}>루틴 적용</button>}
      </div>
      <div className="timestamp-box">
        <span style={sectionLabel({ color })}>timestamp</span>
        {messages.map((message) => (
          <p key={message.time}><b>{compactTime(message.time)}</b><span>{message.text}</span></p>
        ))}
        <div className="timestamp-input">
          <textarea
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !isComposing(event)) {
                event.preventDefault();
                void sendTimestamp();
              }
            }}
            placeholder="남기고 싶은 순간"
            rows={2}
          />
          <button onClick={sendTimestamp}>stamp</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: ".4rem", marginTop: ".85rem", paddingTop: ".85rem", borderTop: "1px solid #f5f5f5" }}>
        <button onClick={printDaylog} style={pill(color, "#fff")}>print!</button>
        <button style={pill("#f5f5f5", "#aaa")} onClick={() => setRoutineOpen(true)}>루틴</button>
        <div style={{ flex: 1 }} />
        {editMode && visible.length > 0 && <button style={pill("#fee2e2", "#ef4444")} onClick={archiveAll}>전체 삭제</button>}
        {editMode && <button style={pill("#f5f5f5", "#aaa")} onClick={() => setCatOpen(true)}>카테고리</button>}
        <button onClick={() => setEditMode((value) => !value)} style={pill(editMode ? "#e8e8e8" : "#f5f5f5", editMode ? "#555" : "#bbb")}>
          {editMode ? "Done" : "Edit"}
        </button>
      </div>
      {routineOpen && <RoutineModal uid={uid} labels={labels} routines={routines} onClose={() => setRoutineOpen(false)} />}
      {catOpen && <CategorySettings scope={scope} labels={labels} onClose={() => setCatOpen(false)} />}
      {printing && <DaylogCard dateLabel={dateLabel} note={note} todos={visible} labels={labels} color={color} texture={texture} />}
    </section>
  );
}

function TodoRow({
  todo,
  scope,
  color,
  editMode,
  catIdx,
  catLength,
  onPatch,
  onMove,
}: {
  todo: TodoItem;
  scope: Scope;
  color: string;
  editMode: boolean;
  catIdx: number;
  catLength: number;
  onPatch: (todoId: string, patch: Partial<TodoItem>) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState(todo.memo || "");
  const state = todo.state ?? (todo.status === "done" ? 1 : 0);
  useEffect(() => setTitle(todo.title), [todo.title]);
  useEffect(() => setMemo(todo.memo || ""), [todo.memo]);
  async function cycle() {
    const next = ((state + 1) % 3) as 0 | 1 | 2;
    onPatch(todo.id, { state: next, status: next === 1 ? "done" : "open" });
    await updateTodoPatch(scope, todo, { state: next, status: next === 1 ? "done" : "open" });
  }
  async function save() {
    onPatch(todo.id, { title: title.trim() });
    await updateTodoTitle(scope, todo, title);
    setEditing(false);
  }
  async function saveMemo(nextMemo = memo) {
    onPatch(todo.id, { memo: nextMemo });
    await updateTodoPatch(scope, todo, { memo: nextMemo });
  }
  return <div style={{ marginBottom: todo.memo && !memoOpen ? ".35rem" : ".22rem" }}>
    <div className="todo-item" style={{ opacity: 1, backgroundColor: todo.important ? `${color}33` : "transparent" }}>
    {editMode && <div className="sort-stack">
      <button className="icon-btn" onClick={() => onMove(-1)} disabled={catIdx === 0}><span className="tri-up" /></button>
      <button className="icon-btn" onClick={() => onMove(1)} disabled={catIdx === catLength - 1}><span className="tri-down" /></button>
    </div>}
    <button className="bullet-btn" onClick={cycle} style={{ color }}>{BULLETS[state]}</button>
    {editing ? <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) { e.preventDefault(); void save(); } }} onBlur={save} rows={2} /> : <span className={state === 1 ? "completed" : state === 2 ? "crossed" : ""} onDoubleClick={() => setEditing(true)}>{todo.title}</span>}
    <button className="icon-btn" onClick={() => setMemoOpen((value) => !value)} style={{ color: todo.memo ? color : "#d8d8d8", fontSize: ".7rem", letterSpacing: "-.03em" }}>{todo.memo && !memoOpen ? "✎·" : " ✎"}</button>
    <button className="icon-btn" onClick={() => { onPatch(todo.id, { important: !todo.important }); void updateTodoPatch(scope, todo, { important: !todo.important }); }} style={{ color: todo.important ? color : "#ccc", fontSize: ".85rem" }}>{todo.important ? "★" : "☆"}</button>
    <button className="icon-btn" onClick={() => { onPatch(todo.id, { hidden: !todo.hidden }); void updateTodoPatch(scope, todo, { hidden: !todo.hidden }); }}>{todo.hidden ? <Lock size={13} /> : <Unlock size={13} />}</button>
    {editMode && <>
      <button className="icon-btn" onClick={editing ? save : () => setEditing(true)}>edit</button>
      <button className="icon-btn" onClick={() => { onPatch(todo.id, { status: "archived" }); void archiveTodo(scope, todo); }}>✕</button>
    </>}
  </div>
  {memoOpen ? (
    <textarea
      autoFocus
      value={memo}
      onChange={(event) => { setMemo(event.target.value); void saveMemo(event.target.value); }}
      onBlur={() => { if (!memo) setMemoOpen(false); }}
      onKeyDown={(event) => { if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey && !isCoarsePointer())) { event.preventDefault(); setMemoOpen(false); } }}
      placeholder="메모를 입력하세요..."
      rows={2}
      style={{ display: "block", width: "100%", marginTop: ".2rem", paddingLeft: "1.5rem", border: "none", borderBottom: `1px solid ${color}44`, background: "transparent", resize: "none", fontFamily: "inherit", fontSize: ".78rem", lineHeight: 1.6, color: "#666", outline: "none" }}
    />
  ) : todo.memo ? (
    <div onClick={() => setMemoOpen(true)} style={{ paddingLeft: "1.5rem", fontSize: ".75rem", color: "#aaa", lineHeight: 1.5, whiteSpace: "pre-wrap", cursor: "text", marginTop: ".1rem" }}>{todo.memo}</div>
  ) : null}
  </div>;
}

function CategorySettings({ scope, labels, onClose }: { scope: Scope; labels: CategoryLabels; onClose: () => void }) {
  const [draft, setDraft] = useState(labels);
  async function save() {
    await saveCategories(scope, draft);
    onClose();
  }
  return <div className="modal-backdrop"><section className="modal-card" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}><div className="modal-head"><b>카테고리명</b><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>{CATEGORY_KEYS.map((key) => <label className="field" key={key}><span>{key}</span><input maxLength={12} value={draft[key]} onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))} /></label>)}<button className="dark-btn" onClick={save}>저장</button></section></div>;
}

function DaylogCard({ dateLabel, note, todos, labels, color, texture }: { dateLabel: string; note: string; todos: TodoItem[]; labels: CategoryLabels; color: string; texture: string }) {
  const done = todos.filter((todo) => (todo.state ?? 0) === 1).length;
  const stamp = new Date().toLocaleString("sv-SE").replace("T", " ").slice(2, 16).replace(/-/g, ".");
  return <div id="xcard" className="print-card daylog-card" style={{ backgroundImage: `url("${texture}")` }}>
    <div className="print-card-wash" />
    <div className="print-card-body">
      <div className="print-title" style={{ color }}>daylog</div>
      <div className="print-date">{dateLabel}</div>
      {note.trim() && <div className="print-note">« {note} »</div>}
      <div className="print-list">
        {CATEGORY_ORDER.map((key) => {
          const list = todos.filter((todo) => todo.categoryKey === key);
          if (!list.length) return null;
          return <section key={key}>
            <PrintSectionHeader label={labels[key]} color={CATEGORY_ACCENT[key] || color} />
            {list.map((todo) => <div key={todo.id} className="print-row" style={{ color: (todo.state ?? 0) === 1 ? "#999" : "#1a1a1a", textDecoration: (todo.state ?? 0) === 1 ? "line-through" : "none", background: todo.important ? `${color}22` : "transparent" }}>
              <span>{(todo.state ?? 0) === 0 ? "·" : (todo.state ?? 0) === 1 ? "✓" : "✗"}</span>
              <p>{todo.title}</p>
              {todo.important && <b style={{ color }}>★</b>}
              {todo.memo && <small>└ {todo.memo}</small>}
            </div>)}
          </section>;
        })}
      </div>
      <div className="print-total"><span>TOTAL    DONE</span><b style={{ color }}>{done} / {todos.length}</b></div>
      <div className="print-stamp">{stamp}</div>
      <div className="print-credit">TODOLIST BY ⓒnagi</div>
    </div>
    <div className="print-card-texture" style={{ backgroundImage: `url("${texture}")` }} />
  </div>;
}

function ThemeConfetti({ color }: { color: string }) {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, index) => ({
    angle: (Math.PI * 2 * index) / 22 + (Math.random() - 0.5) * 0.42,
    distance: 68 + Math.random() * 78,
    fall: 22 + Math.random() * 46,
    delay: Math.random() * 0.09,
    rotate: 220 + Math.random() * 420,
    width: 3 + Math.random() * 6,
    height: 4 + Math.random() * 9,
    opacity: 0.42 + Math.random() * 0.4,
    radius: Math.random() > 0.55 ? "999px" : "2px",
    tint: index % 4 === 0 ? "#fff" : index % 3 === 0 ? `${color}aa` : index % 3 === 1 ? `${color}66` : color,
  })), [color]);
  return (
    <div className="theme-confetti" style={{ "--burst-color": color } as CSSProperties} aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          style={{
            animationDelay: `${piece.delay}s`,
            "--x": `${Math.cos(piece.angle) * piece.distance}px`,
            "--y": `${Math.sin(piece.angle) * piece.distance}px`,
            "--fall": `${piece.fall}px`,
            "--spin": `${piece.rotate}deg`,
            "--piece-opacity": piece.opacity,
            width: `${piece.width}px`,
            height: `${piece.height}px`,
            borderRadius: piece.radius,
            background: piece.tint,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function PrintSectionHeader({ label, color }: { label: string; color: string }) {
  return <div className="print-section-header" style={{ color }}>
    <span>{"─".repeat(30)}</span>
    <b>{label}</b>
    <span>{"─".repeat(30)}</span>
  </div>;
}

function EditableBlock({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  viewClassName,
  viewStyle,
  textareaStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
  className?: string;
  viewClassName?: string;
  viewStyle?: CSSProperties;
  textareaStyle?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const userEditing = useRef(false);

  useEffect(() => {
    if (!value.trim()) {
      setEditing(true);
      return;
    }
    if (!userEditing.current) setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <div
        className={viewClassName || "editable-view"}
        onDoubleClick={() => setEditing(true)}
        onTouchEnd={(event) => {
          event.preventDefault();
          userEditing.current = true;
          setEditing(true);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          userEditing.current = true;
          setEditing(true);
        }}
        onMouseDown={() => {
          userEditing.current = true;
        }}
      >
        <div style={viewStyle}>{value.trim() ? value : <span>{placeholder}</span>}</div>
      </div>
    );
  }

  return (
    <textarea
      className={className}
      value={value}
      onChange={(event) => {
        userEditing.current = true;
        onChange(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.shiftKey || event.ctrlKey || event.metaKey) && !isComposing(event)) {
          event.preventDefault();
          userEditing.current = false;
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        userEditing.current = false;
        if (value.trim()) setEditing(false);
      }}
      placeholder={placeholder}
      rows={rows}
      style={textareaStyle}
      autoFocus
    />
  );
}

function JournalView({ uid, selectedDate, dateKey, color }: { uid: string; selectedDate: Date; dateKey: string; color: string }) {
  const [journal, setJournal] = useState<JournalEntry>({});
  const [daily, setDaily] = useState<DailyEntry>({});
  const [printing, setPrinting] = useState(false);
  const [texture] = useState(() => PAPER_TEXTURES[Math.floor(Math.random() * PAPER_TEXTURES.length)]);
  useEffect(() => subscribeJournal(uid, dateKey, setJournal), [uid, dateKey]);
  useEffect(() => subscribeDaily(uid, dateKey, setDaily), [uid, dateKey]);
  function updateJournal(patch: JournalEntry) {
    const next = { ...journal, ...patch };
    setJournal(next);
    void saveJournal(uid, dateKey, next);
  }
  function updateDaily(patch: DailyEntry) {
    const next = { ...daily, ...patch };
    setDaily(next);
    void saveDaily(uid, dateKey, next);
  }
  async function printNightlog() {
    setPrinting(true);
    window.setTimeout(async () => {
      await exportElementAsPng("bpcard", `nightlog-${dateKey}.png`, "#06070f");
      setPrinting(false);
    }, 100);
  }
  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const divider = { borderTop: `1px solid ${color}20`, margin: "1.25rem 0" };
  const label = { fontSize: ".6rem", letterSpacing: ".2em", color: `${color}99`, display: "block", marginBottom: ".5rem" };
  return <section className="journal" style={CARD}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: "bold", color: "#222" }}>{dateLabel}</h2>
      <button onClick={printNightlog} style={{ ...pill(color, "#fff", true), padding: ".28rem .7rem", flexShrink: 0 }}>print!</button>
    </div>
    <span style={label}>ᴍᴏʀɴɪɴɢ</span>
    <EditableBlock value={journal.morning ?? ""} onChange={(value) => updateJournal({ morning: value })} placeholder="하루를 시작하며 떠오르는 생각을 자유롭게 적어주세요." />
    <div style={divider} />
    <span style={label}>ɢʀᴀᴛɪᴛᴜᴅᴇ</span>
    {[0, 1, 2].map((index) => (
      <div key={index} style={{ display: "flex", alignItems: "center", gap: ".35rem", marginBottom: ".35rem" }}>
        <span style={{ fontSize: ".62rem", color, flexShrink: 0, fontFamily: "monospace", width: ".8rem", textAlign: "right" }}>{index + 1}.</span>
        <EditableBlock value={(daily.gratitude || [])[index] || ""} onChange={(value) => {
          const next = [...(daily.gratitude || ["", "", ""])];
          next[index] = value;
          updateDaily({ gratitude: next });
        }} placeholder={`감사한 점 ${index + 1}`} rows={1} textareaStyle={{ minHeight: "auto", resize: "none", flex: 1 }} />
      </div>
    ))}
    <div style={divider} />
    <span style={label}>ᴅɪᴀʀʏ</span>
    <EditableBlock value={daily.diary ?? ""} onChange={(value) => updateDaily({ diary: value })} placeholder="하루를 마무리하며 떠오르는 생각을 자유롭게 적어주세요." rows={6} />
    <div style={divider} />
    <span style={label}>ᴍᴏᴏᴅ</span>
    <MoodPicker value={daily.mood || []} onChange={(mood) => updateDaily({ mood })} color={color} />
    <div style={divider} />
    <span style={label}>ᴅʀᴇᴀᴍ</span>
    <EditableBlock value={daily.dream ?? ""} onChange={(value) => updateDaily({ dream: value })} placeholder="이루고 싶은 미래를 현재형으로 적어주세요. '나는 이미 ___이다.'" rows={4} textareaStyle={{ fontStyle: "italic" }} />
    {printing && <NightlogCard dateLabel={dateLabel} journal={journal} daily={daily} color={color} texture={texture} />}
  </section>;
}

function MoodPicker({ value, onChange, color }: { value: string[]; onChange: (value: string[]) => void; color: string }) {
  return <div className="mood-row">{MOODS.map((mood) => <button key={mood} style={value.includes(mood) ? { background: color, color: "#fff" } : undefined} onClick={() => onChange(value.includes(mood) ? value.filter((v) => v !== mood) : [...value, mood])}><span>{MOOD_ICONS[mood]}</span>{mood}</button>)}</div>;
}

function NightlogCard({ dateLabel, journal, daily, color, texture }: { dateLabel: string; journal: JournalEntry; daily: DailyEntry; color: string; texture: string }) {
  const gratitude = daily.gratitude || [];
  const entries = [
    journal.morning?.trim(),
    gratitude.some((entry) => entry?.trim()) ? "gratitude" : "",
    daily.diary?.trim(),
    daily.mood?.length ? "mood" : "",
    daily.dream?.trim(),
  ].filter(Boolean).length;
  const stamp = new Date().toLocaleString("sv-SE").replace("T", " ").slice(2, 16).replace(/-/g, ".");
  return <div id="bpcard" className="print-card nightlog-card">
    <div className="night-color-wash" style={{ background: color }} />
    <div className="night-texture" style={{ backgroundImage: `url("${texture}")` }} />
    <div className="print-card-body">
      <div className="print-title" style={{ color }}>nightlog</div>
      <div className="print-date">{dateLabel}</div>
      {journal.morning?.trim() && <PrintBlock label="MORNING" color={color}>{journal.morning}</PrintBlock>}
      {gratitude.some((entry) => entry?.trim()) && <PrintBlock label="GRATITUDE" color={color}>{gratitude.filter(Boolean).map((entry, index) => `${index + 1}. ${entry}`).join("\n")}</PrintBlock>}
      {daily.diary?.trim() && <PrintBlock label="DIARY" color={color}>{daily.diary}</PrintBlock>}
      {daily.mood?.length ? <PrintBlock label="MOOD" color={color}>{daily.mood.map((mood) => `${MOOD_ICONS[mood] || "•"} ${mood}`).join("   ")}</PrintBlock> : null}
      {daily.dream?.trim() && <PrintBlock label="DREAM" color={color}>{daily.dream}</PrintBlock>}
      {!entries && <div className="print-empty">─ no entries today ─</div>}
      <div className="print-total night"><span>TOTAL    ENTRIES</span><b style={{ color }}>{entries} / 5</b></div>
      <div className="print-stamp">{stamp}</div>
      <div className="print-credit">JOURNAL BY ⓒnagi</div>
    </div>
  </div>;
}

function PrintBlock({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return <section className="print-block">
    <PrintSectionHeader label={label} color={color} />
    <p>{children}</p>
  </section>;
}

function WeekView({ uid, selectedDate }: { uid: string; selectedDate: Date }) {
  const [dateColors, setDateColors] = useState<Record<string, string>>({});
  useEffect(() => subscribeDateColors(uid, setDateColors), [uid]);
  const mondayOffset = selectedDate.getDay() === 0 ? -6 : 1 - selectedDate.getDay();
  const start = addDays(selectedDate, mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return <section style={CARD}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem" }}>
      <div>
        <span style={sectionLabel({ marginBottom: ".2rem" })}>ᴡᴇᴇᴋʟʏ ʀᴇᴠɪᴇᴡ</span>
        <div style={{ fontSize: ".78rem", color: "#bbb" }}>{toDateKey(days[0])} - {toDateKey(days[6])}</div>
      </div>
    </div>
    <div style={{ borderTop: "1px solid #f0f0f0", marginBottom: "1rem" }} />
    {days.map((date) => <WeekDayMini key={toDateKey(date)} uid={uid} date={date} color={dateColors[toDateKey(date)] || "#2d2d2d"} />)}
  </section>;
}

function WeekDayMini({ uid, date, color }: { uid: string; date: Date; color: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [note, setNote] = useState("");
  const scope = useMemo<Scope>(() => ({ type: "solo", uid }), [uid]);
  const key = toDateKey(date);
  useEffect(() => subscribeTodos(scope, key, setTodos), [scope, key]);
  useEffect(() => subscribeTextDoc(["users", uid, "notes", key], "text", setNote), [uid, key]);
  const visible = todos.filter((todo) => todo.status !== "archived" && !todo.hidden);
  const done = visible.filter((todo) => (todo.state ?? 0) === 1).length;
  const pct = visible.length ? Math.round(done / visible.length * 100) : 0;
  const todayKey = toDateKey(new Date());
  const isToday = key === todayKey;
  const isFuture = key > todayKey;
  return <div style={{ padding: ".5rem .65rem", borderRadius: ".4rem", marginBottom: ".3rem", border: `1.5px solid ${isToday ? color : "transparent"}`, background: isToday ? `${color}07` : "transparent", opacity: isFuture ? 0.32 : 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: ".55rem" }}>
      <div style={{ minWidth: "4.2rem", display: "flex", gap: ".3rem", alignItems: "baseline" }}>
        <span style={{ fontSize: ".67rem", color: "#bbb" }}>{date.toLocaleString("en-US", { weekday: "short" })}</span>
        <span style={{ fontSize: ".88rem", fontWeight: isToday ? "bold" : 500, color: isToday ? color : "#333" }}>{date.getDate()}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: "2.5px", background: "#f0f0f0", borderRadius: "9999px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "9999px", transition: "width .5s" }} />
        </div>
      </div>
      <span style={{ fontSize: ".7rem", color: "#bbb", minWidth: "2rem", textAlign: "right" }}>{visible.length ? `${done}/${visible.length}` : "—"}</span>
    </div>
    {note && !isFuture && <div style={{ fontSize: ".7rem", color: "#bbb", marginTop: ".22rem", paddingLeft: "4.9rem", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>"{note}"</div>}
  </div>;
}

function SharedView({ uid, displayName, partnerName: resolvedPartnerName, dateKey, color, pair }: { uid: string; displayName: string; partnerName: string; dateKey: string; color: string; pair: Pair | null }) {
  const [shared, setShared] = useState<SharedDay | null>(null);
  const [partnerShared, setPartnerShared] = useState<SharedDay | null>(null);
  const partnerUid = pair?.members.find((member) => member !== uid) || null;
  useEffect(() => {
    setPartnerShared(null);
    return pair
      ? subscribePairSharedDay(pair.id, uid, dateKey, (value) => setShared(value))
      : subscribeSharedDay(uid, dateKey, (value) => setShared(value));
  }, [pair, uid, dateKey]);
  useEffect(() => {
    if (!pair || !partnerUid) {
      setPartnerShared(null);
      return undefined;
    }
    return subscribePairSharedDay(pair.id, partnerUid, dateKey, (value) => setPartnerShared(value));
  }, [pair, partnerUid, dateKey]);

  if (!pair) {
    return (
      <section style={{ ...CARD, textAlign: "center", padding: "3rem 1.5rem", color: "#bbb" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem", opacity: 0.45 }}>♡</div>
        <h2 style={{ fontSize: "1.05rem", color: "#999", marginBottom: ".5rem" }}>파트너가 연결되지 않았어요.</h2>
        <p style={{ fontSize: ".78rem", lineHeight: 1.8 }}>왼쪽 프로필 편집창에서 상대 ID로 연결 요청을 보낼 수 있어요.<br />혼자 사용은 계속 가능합니다.</p>
      </section>
    );
  }

  const myTodos = ((shared?.todos || []) as TodoItem[]).filter((todo) => todo.status !== "archived");
  const partnerTodos = ((partnerShared?.todos || []) as TodoItem[]).filter((todo) => todo.status !== "archived");
  const myVisibleTodos = myTodos.filter((todo) => !todo.hidden);
  const partnerVisibleTodos = partnerTodos.filter((todo) => !todo.hidden);
  const partnerColor = partnerShared?.color || "#888";
  const partnerName = partnerShared?.authorNickname || resolvedPartnerName || partnerShared?.authorName || (partnerUid ? pair.memberNicknames?.[partnerUid] : undefined) || "Twin";
  const myLabels = shared?.labels || DEFAULT_CATEGORIES;
  const partnerLabels = partnerShared?.labels || DEFAULT_CATEGORIES;
  const timeline = [
    ...(shared?.messages || []).map((message) => ({ ...message, owner: displayName || "나", color })),
    ...(partnerShared?.messages || []).map((message) => ({ ...message, owner: partnerName, color: partnerColor })),
  ].sort((a, b) => a.time - b.time);
  const dateLabel = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <section style={CARD}>
      <h2 className="shared-date">{dateLabel}</h2>
      <div className="shared-grid">
        <UserSharedCard user={{ name: displayName || "나", color, isSelf: true }} todos={myTodos} note={shared?.note || ""} labels={myLabels} notShared={!shared} />
        <UserSharedCard user={{ name: partnerName, color: partnerColor }} todos={partnerTodos} note={partnerShared?.note || ""} labels={partnerLabels} notShared={!partnerShared} />
      </div>

      <section className="shared-section">
        <h3>timestamp</h3>
        <div className="shared-timeline">
          {timeline.length ? timeline.map((message, index) => (
            <div key={`${message.time}-${index}`} className="shared-timeline-row">
              <span>{compactTime(message.time)}</span>
              <b style={{ color: message.color }}>{message.owner}</b>
              <p>{message.text}</p>
            </div>
          )) : <div className="shared-empty-line">아직 공유된 timestamp가 없어요.</div>}
        </div>
      </section>

      <section className="shared-section">
        <h3>achievement</h3>
        <div className="shared-progress-list">
          <SharedProgress name={displayName || "나" } color={color} todos={myVisibleTodos} />
          <SharedProgress name={partnerName} color={partnerColor} todos={partnerVisibleTodos} />
        </div>
      </section>
    </section>
  );
}

function UserSharedCard({ user, todos, note, labels, notShared }: { user: { name: string; color: string; isSelf?: boolean }; todos: TodoItem[]; note: string; labels: CategoryLabels; notShared: boolean }) {
  const isEmpty = !todos.length && !note.trim();
  return (
    <section
      className={`user-shared-card ${notShared || isEmpty ? "muted" : ""}`}
      style={{ borderColor: `${user.color}33` }}
    >
      <div className="user-shared-head">
        <h3 style={{ color: user.color }}>{user.name}</h3>
        {user.isSelf && <span style={{ background: `${user.color}18`, color: user.color }}>ME</span>}
      </div>
      {notShared ? (
        <div className="shared-card-empty">아직 공유되지 않았어요.</div>
      ) : isEmpty ? (
        <div className="shared-card-empty">오늘의 기록이 비어 있어요.</div>
      ) : (
        <>
          {note.trim() && <p className="shared-note" style={{ color: user.color }}>{note}</p>}
          {CATEGORY_ORDER.map((key) => {
            const items = todos.filter((todo) => todo.categoryKey === key);
            if (!items.length) return null;
            return (
              <div className="shared-category" key={key}>
                <span style={{ color: user.color }}>{labels[key]}</span>
                {items.map((todo) => (
                  <div className={`shared-todo ${todo.hidden ? "private" : ""}`} key={todo.id}>
                    <span>{BULLETS[todo.state ?? 0]}</span>
                    <p>{todo.hidden ? "비공개 일정입니다." : todo.title}</p>
                    {todo.important && !todo.hidden && <b style={{ color: user.color }}>★</b>}
                    {todo.memo && !todo.hidden && <small>{todo.memo}</small>}
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function SharedProgress({ name, color, todos }: { name: string; color: string; todos: TodoItem[] }) {
  const done = todos.filter((todo) => (todo.state ?? 0) === 1).length;
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;
  return (
    <div className="shared-progress-row">
      <span>{name}</span>
      <div><i style={{ width: `${pct}%`, background: color }} /></div>
      <b style={{ color }}>{pct}%</b>
    </div>
  );
}

function RoutineModal({ uid, labels, routines, onClose }: { uid: string; labels: CategoryLabels; routines: Routine[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [categoryKey, setCategoryKey] = useState<CategoryKey>("required");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [weekdays, setWeekdays] = useState<number[]>([new Date().getDay()]);
  async function add() {
    if (!text.trim()) return;
    await addRoutine(uid, text, categoryKey, frequency, frequency === "daily" ? [0, 1, 2, 3, 4, 5, 6] : weekdays);
    setText("");
  }
  function toggleDay(day: number) {
    setWeekdays((prev) => prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day].sort());
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="modal-card routine-modal" onClick={(e) => e.stopPropagation()}><div className="modal-head"><b>루틴</b><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>
    <div className="routine-form">
      <input className="soft-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="새 루틴" />
      <div className="routine-selects"><select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value as CategoryKey)}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{labels[k]}</option>)}</select><select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}><option value="daily">매일</option><option value="weekly">매주</option></select></div>
      {frequency === "weekly" && <div className="weekday-pills">{[1, 2, 3, 4, 5, 6, 0].map((day) => <button key={day} className={weekdays.includes(day) ? "active" : ""} onClick={() => toggleDay(day)}>{WEEK_KO[day]}</button>)}</div>}
      <button className="dark-btn" onClick={add}>루틴 추가</button>
    </div>
    <div className="routine-list">{routines.map((r) => <div className="routine-row" key={r.id}><span>{r.text}</span><small>{labels[r.categoryKey] || r.categoryKey}</small><button onClick={() => removeRoutine(uid, r.id)}>삭제</button></div>)}</div>
  </section></div>;
}

function MusicWidget({ userId, color, open, onToggle }: { userId: string; color: string; open: boolean; onToggle: () => void }) {
  const [input, setInput] = useState("");
  const [urlBar, setUrlBar] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[]>(() => {
    const saved = JSON.parse(localStorage.getItem(`ytplaylist_${userId}`) || "[]") as Array<string | MusicTrack>;
    return saved.map((track, index) => typeof track === "string" ? { url: track, title: `YouTube video ${index + 1}` } : track);
  });
  const [current, setCurrent] = useState(0);
  async function add() {
    const embed = ytEmbed(input);
    if (!embed) return;
    const title = await getYoutubeTitle(input);
    const next = [...tracks, { url: embed, title }];
    setTracks(next);
    localStorage.setItem(`ytplaylist_${userId}`, JSON.stringify(next));
    setCurrent(next.length - 1);
    setInput("");
    setUrlBar(false);
  }
  function removeTrack(index: number) {
    const next = tracks.filter((_, i) => i !== index);
    setTracks(next);
    localStorage.setItem(`ytplaylist_${userId}`, JSON.stringify(next));
    setCurrent((value) => value >= next.length ? Math.max(0, next.length - 1) : value);
  }
  const currentEmbed = tracks[current];
  return <div className={open ? "music-widget widget-open" : "music-widget"}>
    <button onClick={onToggle}>
      <span style={{ fontSize: "12px", color: currentEmbed ? color : "#ccc" }}>♪</span>
      <span style={{ fontSize: "10px", color: "#bbb", letterSpacing: ".1em" }}>ᴍᴜsɪᴄ</span>
    </button>
    <div className="music-panel" style={{ left: open ? 0 : "-9999px" }}>
      <div className="widget-head"><span>ᴍᴜsɪᴄ</span><button onClick={() => setUrlBar((v) => !v)} style={{ color }}>+ 추가</button></div>
      {urlBar && <div className="music-url"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="YouTube 영상 URL" /><button onClick={() => void add()} style={{ background: color }}>→</button></div>}
      {tracks.length > 0 ? <div className="track-list">{tracks.map((track, i) => <div key={`${track.url}-${i}`} onClick={() => setCurrent(i)} style={{ background: i === current ? `${color}18` : "transparent" }}><span style={{ color: i === current ? color : "#ddd" }}>▶</span><b className="track-title" title={track.title}><em>{track.title}</em></b><button onClick={(event) => { event.stopPropagation(); removeTrack(i); }}>✕</button></div>)}</div> : <div className="music-empty"><span>♪</span><p>YouTube URL을 추가해주세요.</p><button onClick={() => setUrlBar(true)}>+ 추가</button></div>}
      {currentEmbed && <iframe src={currentEmbed.url} width="290" height="163" title="YouTube player" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />}
    </div>
  </div>;
}

function WeatherWidget({ color, open, onToggle }: { color: string; open: boolean; onToggle: () => void }) {
  const [weather, setWeather] = useState<{ temperature: number; windspeed: number; weathercode: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function wmoEmoji(code: number) {
    if (code === 0) return "☀";
    if (code <= 2) return "☼";
    if (code <= 3) return "☁";
    if (code <= 67) return "☂";
    if (code <= 77) return "❄";
    if (code <= 99) return "⚡";
    return "°";
  }

  function wmoDesc(code: number) {
    if (code === 0) return "맑음";
    if (code <= 2) return "구름 조금";
    if (code <= 3) return "흐림";
    if (code <= 67) return "비";
    if (code <= 77) return "눈";
    if (code <= 99) return "뇌우";
    return "—";
  }

  useEffect(() => {
    async function loadWeather(latitude: number, longitude: number) {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        const data = await res.json();
        setWeather(data.current_weather);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    const saved = localStorage.getItem("twintodoWeatherCoords");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { latitude: number; longitude: number };
        void loadWeather(parsed.latitude, parsed.longitude);
        return;
      } catch {
        localStorage.removeItem("twintodoWeatherCoords");
      }
    }

    if (!navigator.geolocation) {
      setError(true);
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude, longitude } }) => {
      localStorage.setItem("twintodoWeatherCoords", JSON.stringify({ latitude, longitude }));
      await loadWeather(latitude, longitude);
    }, () => {
      setError(true);
      setLoading(false);
    });
  }, []);

  const emoji = loading ? "…" : error ? "?" : wmoEmoji(weather?.weathercode ?? 0);
  const temp = weather ? `${Math.round(weather.temperature)}°` : "";

  return <div className={open ? "weather-widget widget-open" : "weather-widget"}>
    <button onClick={onToggle}>
      <span>{emoji}</span>
      <b style={{ color: weather ? color : "#ccc" }}>{temp || "날씨"}</b>
    </button>
    {open && weather && <div className="weather-panel">
      <div>{wmoEmoji(weather.weathercode)}</div>
      <strong>{Math.round(weather.temperature)}°</strong>
      <p>{wmoDesc(weather.weathercode)}</p>
      <small>풍속 {weather.windspeed} km/h</small>
    </div>}
  </div>;
}

function PomodoroWidget({ color, open, onToggle }: { color: string; open: boolean; onToggle: () => void }) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"focus" | "short" | "long">("focus");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [minutes, setMinutes] = useState(() => {
    const saved = localStorage.getItem("pomoMinutes");
    return saved ? JSON.parse(saved) as Record<"focus" | "short" | "long", number> : { focus: 25, short: 5, long: 15 };
  });
  const [left, setLeft] = useState(minutes.focus * 60);
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  function selectMode(next: "focus" | "short" | "long") {
    setMode(next);
    setRunning(false);
    setLeft(minutes[next] * 60);
  }
  function updateMinutes(key: "focus" | "short" | "long", value: string) {
    const nextValue = Math.max(1, Math.min(120, Number.parseInt(value, 10) || 1));
    const next = { ...minutes, [key]: nextValue };
    setMinutes(next);
    localStorage.setItem("pomoMinutes", JSON.stringify(next));
    if (key === mode && !running) setLeft(nextValue * 60);
  }
  const mm = Math.floor(left / 60).toString().padStart(2, "0");
  const ss = (left % 60).toString().padStart(2, "0");
  const progress = Math.max(0, Math.min(1, 1 - left / (minutes[mode] * 60)));
  const modeLabel = mode === "focus" ? "focus" : mode === "short" ? "short rest" : "long rest";
  return <div className={open ? "pomo-widget widget-open" : "pomo-widget"}><button className={running && !open ? "pomo-live" : ""} onClick={onToggle}><span>◷</span>{running && !open && <b>{mm}:{ss}</b>}</button>{open && <div className="widget-panel pomo-panel">
    <div className="pomo-modes">{(["focus", "short", "long"] as const).map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>{item}</button>)}</div>
    <div className="pomo-dial" style={{ background: `conic-gradient(${color} ${progress * 360}deg, #f1f1f1 0deg)` }}>
      <div><b>{mm}:{ss}</b><span>{running ? "running" : modeLabel}</span></div>
    </div>
    <div className="button-row pomo-controls"><button style={{ color }} onClick={() => setRunning((v) => !v)}>{running ? <Pause size={14} /> : <Play size={14} />}</button><button style={{ color }} onClick={() => { setRunning(false); setLeft(minutes[mode] * 60); }}><RotateCcw size={14} /></button><button style={{ color }} onClick={() => setSettingsOpen((v) => !v)}>설정</button></div>
    {settingsOpen && <div className="pomo-settings">{(["focus", "short", "long"] as const).map((item) => <label key={item}><span>{item}</span><input value={minutes[item]} onChange={(event) => updateMinutes(item, event.target.value)} /></label>)}</div>}
  </div>}</div>;
}

function DemianWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [sched, setSched] = useState<Record<number, { s: number; e: number }>>(loadSched);
  const [edit, setEdit] = useState<Record<number, { s: number; e: number }>>(loadSched);
  const online = (() => {
    const now = new Date();
    const row = sched[now.getDay()];
    return Boolean(row && now.getHours() >= row.s && now.getHours() < row.e);
  })();

  useEffect(() => {
    if (!online) {
      setMessage("지금은 집중 시간이 아닙니다.");
      return;
    }
    let alive = true;
    fetch("/data/demian_focus_messages.json", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { messages?: string[] }) => {
        if (!alive) return;
        const list = data.messages || [];
        setMessage(list[Math.floor(Math.random() * list.length)] || "오늘도 조용히 해내자.");
      })
      .catch(() => alive && setMessage("메시지를 불러오지 못했습니다."));
    return () => {
      alive = false;
    };
  }, [online]);

  function save() {
    setSched(edit);
    localStorage.setItem("focusSched", JSON.stringify(edit));
    setConfigOpen(false);
  }

  function update(day: number, field: "s" | "e", value: string) {
    const next = Number.parseInt(value, 10);
    if (Number.isNaN(next) || next < 0 || next > 23) return;
    setEdit((prev) => ({ ...prev, [day]: { ...(prev[day] || { s: 0, e: 0 }), [field]: next } }));
  }

  function toggle(day: number) {
    setEdit((prev) => {
      const next = { ...prev };
      if (next[day]) delete next[day];
      else next[day] = DEF_SCHED[day] || { s: 6, e: 18 };
      return next;
    });
  }

  return <div className="demian-widget">
    <button className={online ? "online" : ""} onClick={() => { setOpen((v) => !v); if (open) setConfigOpen(false); }}>🖤</button>
    {open && <div className="widget-panel demian-panel">
      <button onClick={() => { setEdit({ ...sched }); setConfigOpen((v) => !v); }}>⚙ 설정</button>
      {configOpen ? <div>
        <b>위젯 설정</b>
        <p>요일별 집중 시간 (24시)</p>
        {[1, 2, 3, 4, 5, 6, 0].map((day) => <div className="demian-row" key={day}>
          <button className={edit[day] ? "on" : ""} onClick={() => toggle(day)}><span /></button>
          <span>{WEEK_KO[day]}</span>
          <input value={edit[day]?.s ?? 6} disabled={!edit[day]} onChange={(event) => update(day, "s", event.target.value)} />
          <span>-</span>
          <input value={edit[day]?.e ?? 18} disabled={!edit[day]} onChange={(event) => update(day, "e", event.target.value)} />
        </div>)}
        <div className="demian-actions"><button onClick={() => setConfigOpen(false)}>취소</button><button onClick={save}>저장</button></div>
      </div> : <>
        <b>ᴅᴇᴍɪᴀɴ</b>
        <p>{message}</p>
      </>}
    </div>}
  </div>;
}
