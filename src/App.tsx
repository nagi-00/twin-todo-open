import { User } from "firebase/auth";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  EyeOff,
  Link2,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { isFirebaseConfigured } from "./firebase";
import { CATEGORY_KEYS, DEFAULT_CATEGORIES } from "./lib/categories";
import { addDays, monthMatrix, toDateKey } from "./lib/date";
import { logout, signInWithGoogle, subscribeAuth } from "./services/auth";
import { saveCategories, subscribeCategories } from "./services/categories";
import { acceptPairRequest, claimNickname, createPairRequest, rejectPairRequest } from "./services/functions";
import { JournalEntry, saveJournal, subscribeJournal } from "./services/journal";
import { subscribeActivePair, subscribePairRequests } from "./services/pairs";
import { ensureUserProfile, getAvatarUrl, subscribeProfile, updateDisplayName, uploadAvatar } from "./services/profile";
import { addTodo, archiveTodo, subscribeTodos, updateTodoPatch, updateTodoTitle } from "./services/todos";
import {
  addRoutine,
  DailyEntry,
  Message,
  saveDaily,
  saveDateColor,
  saveMessages,
  saveSharedDay,
  subscribeDaily,
  subscribeDateColors,
  subscribeTextDoc,
  subscribeMessages,
  subscribeRoutines,
  subscribeSharedDay,
  saveTextDoc,
} from "./services/userData";
import type { CategoryKey, CategoryLabels, Pair, PairRequest, Routine, TodoItem, UserProfile } from "./types";

type Scope = { type: "solo"; uid: string } | { type: "pair"; pairId: string; uid: string };
type TabKey = "todo" | "journal" | "week" | "shared";

const ADMIN_EMAIL = "mx.gin.xo@gmail.com";
const BULLETS = ["☐", "☑", "☒"] as const;
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
const MOODS = ["행복", "보통", "슬픔", "화남", "설렘"];
const CATEGORY_ORDER: CategoryKey[] = ["required", "growth", "freedom"];
const CATEGORY_ACCENT: Record<CategoryKey, string> = {
  required: "#8A4545",
  growth: "",
  freedom: "#4a7c5a",
};

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

function ytEmbed(raw: string) {
  try {
    const u = new URL(raw.trim());
    const v = u.searchParams.get("v");
    const list = u.searchParams.get("list");
    const sid = u.hostname === "youtu.be" ? u.pathname.slice(1).split("?")[0] : null;
    const vid = v || sid;
    const params = "autoplay=1&rel=0&modestbranding=1&enablejsapi=1";
    if (vid && list) return `https://www.youtube.com/embed/${vid}?list=${list}&${params}`;
    if (vid) return `https://www.youtube.com/embed/${vid}?${params}`;
    if (list) return `https://www.youtube.com/embed/videoseries?list=${list}&${params}`;
    return null;
  } catch {
    return null;
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
        <p>이 ID는 @nagi처럼 표시되고, 다른 사용자가 연결 요청을 보낼 때 쓰는 고유 핸들이에요.</p>
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
  const [scopeMode, setScopeMode] = useState<"solo" | "pair">("solo");
  const [dateColors, setDateColors] = useState<Record<string, string>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => subscribeActivePair(user.uid, setPair), [user.uid]);
  useEffect(() => subscribePairRequests(user.uid, setRequests), [user.uid]);
  useEffect(() => subscribeDateColors(user.uid, setDateColors), [user.uid]);

  const dateKey = toDateKey(selectedDate);
  const color = dateColors[dateKey] || "#2d2d2d";
  const scope: Scope = useMemo(() => scopeMode === "pair" && pair ? { type: "pair", pairId: pair.id, uid: user.uid } : { type: "solo", uid: user.uid }, [scopeMode, pair, user.uid]);

  const dateLabel = selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="app" style={{ display: "flex", minHeight: "100vh" }}>
      <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
      <div className={sidebarOpen ? "sidebar-overlay open" : "sidebar-overlay"} onClick={() => setSidebarOpen(false)} />
      <aside className={sidebarOpen ? "sidebar open" : "sidebar"}>
        <div style={{ padding: "1.25rem 1rem 2rem" }}>
          <ProfilePanel user={user} profile={profile} color={color} />
          <CalendarPanel selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setSidebarOpen(false); }} colors={dateColors} accent={color} />
          <PairPanel requests={requests} pair={pair} mode={scopeMode} onMode={setScopeMode} color={color} />
        </div>
      </aside>
      <main className="main">
        <div className="tab-bar">
          {[
            ["todo", "ᴛᴏᴅᴏ"],
            ["journal", "ᴊᴏᴜʀɴᴀʟ"],
            ["week", "ᴡᴇᴇᴋ"],
            ["shared", "ᴛᴡɪɴ"],
          ].map(([key, label]) => (
            <button key={key} style={pill(tab === key ? color : "#f5f5f5", tab === key ? "#fff" : "#aaa")} onClick={() => setTab(key as TabKey)}>{label}</button>
          ))}
        </div>

        <section className="date-card" style={{ borderTop: `3px solid ${color}` }}>
          <div style={{ minWidth: 0 }}>
            <h2>{dateLabel}</h2>
            <span>{scope.type === "solo" ? "solo mode" : "pair mode"} / @{profile.nickname}</span>
          </div>
          <div className="date-actions">
            <button className="icon-btn" onClick={() => setSelectedDate((date) => addDays(date, -1))}><ChevronLeft size={15} /></button>
            <button className="icon-btn" onClick={() => setSelectedDate(new Date())}><CalendarDays size={15} /></button>
            <button className="icon-btn" onClick={() => setSelectedDate((date) => addDays(date, 1))}><ChevronRight size={15} /></button>
            <input type="color" value={color} onChange={(event) => saveDateColor(user.uid, dateKey, event.target.value)} />
          </div>
        </section>

        {tab === "todo" && <TodoView scope={scope} uid={user.uid} dateKey={dateKey} color={color} />}
        {tab === "journal" && <JournalView uid={user.uid} dateKey={dateKey} color={color} />}
        {tab === "week" && <WeekView uid={user.uid} selectedDate={selectedDate} />}
        {tab === "shared" && <SharedView uid={user.uid} dateKey={dateKey} color={color} pair={pair} />}
      </main>
      <MemoWidget />
      <MusicWidget userId={user.uid} color={color} />
      <PomodoroWidget color={color} />
      {user.email === ADMIN_EMAIL && <DemianWidget />}
    </div>
  );
}

function ProfilePanel({ user, profile, color }: { user: User; profile: UserProfile; color: string }) {
  const [name, setName] = useState(profile.displayName);
  const [editing, setEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    getAvatarUrl(profile.avatarPath).then(setAvatarUrl).catch(() => setAvatarUrl(null));
  }, [profile.avatarPath]);

  async function saveName() {
    if (!name.trim()) return;
    await updateDisplayName(user.uid, name.trim());
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
        <div style={{ display: "flex", gap: ".3rem", justifyContent: "center" }}>
          <button onClick={logout} style={pill("#f5f5f5", "#aaa", true)}><LogOut size={12} /> 로그아웃</button>
          <button onClick={editing ? saveName : () => setEditing(true)} style={pill(editing ? color : "#f5f5f5", editing ? "#fff" : "#aaa", true)}><Edit3 size={12} /> {editing ? "저장" : "편집"}</button>
        </div>
      </div>
      {editorOpen && <AvatarEditor uid={user.uid} onClose={() => setEditorOpen(false)} />}
    </section>
  );
}

function AvatarEditor({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [shape, setShape] = useState<"circle" | "square">("circle");
  const [angle, setAngle] = useState(0);
  const [scale, setScale] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      const size = Math.max(image.width, image.height);
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
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

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) return;
    await uploadAvatar(uid, new File([blob], "avatar.webp", { type: "image/webp" }));
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="avatar-editor modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head"><b>프로필 이미지 편집</b><button className="icon-btn" onClick={onClose}><X size={15} /></button></div>
        <canvas ref={canvasRef} width={256} height={256} className={shape === "circle" ? "avatar-canvas circle" : "avatar-canvas"} />
        {!src && <label className="upload-drop"><Upload size={18} />이미지 선택<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} /></label>}
        <div className="editor-grid">
          <label>회전<input type="range" min="-180" max="180" value={angle} onChange={(event) => setAngle(Number(event.target.value))} /></label>
          <label>확대<input type="range" min="0.6" max="2.4" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
          <label>좌우<input type="range" min="-80" max="80" value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
          <label>상하<input type="range" min="-80" max="80" value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
        </div>
        <div className="button-row">
          <button className="soft-btn" onClick={() => setFlipX((v) => !v)}>좌우반전</button>
          <button className="soft-btn" onClick={() => setFlipY((v) => !v)}>상하반전</button>
          <button className="soft-btn" onClick={() => setShape((v) => v === "circle" ? "square" : "circle")}>{shape === "circle" ? "정사각" : "원형"}</button>
          <button className="dark-btn inline" onClick={save} disabled={!src}>저장</button>
        </div>
      </section>
    </div>
  );
}

function CalendarPanel({ selectedDate, onSelect, colors, accent }: { selectedDate: Date; onSelect: (date: Date) => void; colors: Record<string, string>; accent: string }) {
  const [anchor, setAnchor] = useState(selectedDate);
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const selectedKey = toDateKey(selectedDate);
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
      <div className="cal-grid week">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={`${d}-${i}`}>{d}</span>)}</div>
      <div className="cal-grid">
        {cells.map((cell, i) => {
          if (!cell) return <span key={`e-${i}`} />;
          const key = toDateKey(cell);
          const isSelected = key === selectedKey;
          return <button key={key} className={isSelected ? "day selected" : "day"} style={isSelected ? { background: accent } : { color: colors[key] || undefined }} onClick={() => onSelect(cell)}>{cell.getDate()}</button>;
        })}
      </div>
    </section>
  );
}

function PairPanel({ requests, pair, mode, onMode, color }: { requests: PairRequest[]; pair: Pair | null; mode: "solo" | "pair"; onMode: (mode: "solo" | "pair") => void; color: string }) {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  async function send() {
    setMessage("");
    try {
      await createPairRequest(handle);
      setHandle("");
      setMessage("요청을 보냈습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "요청에 실패했습니다.");
    }
  }
  return (
    <section className="pair-panel">
      <div className="scope-toggle">
        <button style={mode === "solo" ? { background: color, color: "#fff" } : undefined} onClick={() => onMode("solo")}>solo</button>
        <button style={mode === "pair" ? { background: color, color: "#fff" } : undefined} disabled={!pair} onClick={() => onMode("pair")}>pair</button>
      </div>
      <span style={sectionLabel()}>ID로 연결</span>
      <div className="tiny-form"><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="상대 ID" /><button onClick={send}><Link2 size={14} /></button></div>
      {message && <p className="tiny-note">{message}</p>}
      {requests.map((req) => <div className="request" key={req.id}><span>@{req.fromNickname}</span><button onClick={() => acceptPairRequest(req.id)}>✓</button><button onClick={() => rejectPairRequest(req.id)}>×</button></div>)}
    </section>
  );
}

function TodoView({ scope, uid, dateKey, color }: { scope: Scope; uid: string; dateKey: string; color: string }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>(DEFAULT_CATEGORIES);
  const [inputs, setInputs] = useState<Record<CategoryKey, string>>({ required: "", growth: "", freedom: "" });
  const [note, setNote] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const scopeKey = scope.type === "pair" ? `pair:${scope.pairId}` : `solo:${uid}`;

  useEffect(() => subscribeTodos(scope, dateKey, setTodos), [scope, scopeKey, dateKey]);
  useEffect(() => subscribeCategories(scope, setLabels), [scope, scopeKey]);
  useEffect(() => subscribeTextDoc(["users", uid, "notes", dateKey], "text", setNote), [uid, dateKey]);
  useEffect(() => subscribeRoutines(uid, setRoutines), [uid]);

  const visible = todos.filter((todo) => todo.status !== "archived");
  const done = visible.filter((todo) => (todo.state ?? (todo.status === "done" ? 1 : 0)) === 1).length;
  const pct = visible.length ? Math.round(done / visible.length * 100) : 0;

  async function submit(key: CategoryKey) {
    const text = inputs[key].trim();
    if (!text) return;
    await addTodo(scope, dateKey, key, text);
    setInputs((prev) => ({ ...prev, [key]: "" }));
  }

  async function applyRoutines() {
    const day = new Date(`${dateKey}T00:00:00`).getDay();
    const targets = routines.filter((r) => (r.frequency || r.freq) === "daily" || (r.weekdays || [r.weekday]).includes(day));
    await Promise.all(targets.map((r) => addTodo(scope, dateKey, r.categoryKey, r.text)));
  }

  async function shareToday() {
    await saveSharedDay(uid, dateKey, { todos: visible, note, color, messages: [], updatedAt: null });
    alert("오늘의 공유 카드가 업데이트되었습니다.");
  }

  return (
    <section className="main-card">
      <div style={{ marginBottom: "1rem" }}>
        <span style={sectionLabel()}>오늘의 완료율</span>
        <div style={{ display: "flex", alignItems: "center", gap: ".7rem" }}>
          <div className="progress" style={{ flex: 1 }}><span style={{ width: `${pct}%`, background: color }} /></div>
          <span style={{ fontSize: ".82rem", color, fontWeight: "bold", fontFamily: "monospace" }}>{pct}%</span>
          <button style={pill("#f5f5f5", "#aaa", true)} onClick={() => setCatOpen(true)}><Settings size={12} /> 카테고리</button>
        </div>
      </div>
      <textarea className="note-box" value={note} onChange={(event) => { setNote(event.target.value); void saveTextDoc(["users", uid, "notes", dateKey], "text", event.target.value); }} placeholder="오늘의 한마디" />
      <div className="todo-input-grid">
        {CATEGORY_ORDER.map((key) => (
          <textarea
            key={key}
            value={inputs[key]}
            onChange={(event) => setInputs((prev) => ({ ...prev, [key]: event.target.value }))}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(key); } }}
            placeholder={labels[key]}
            rows={3}
          />
        ))}
      </div>
      <div>
        {CATEGORY_ORDER.map((key, idx) => {
          const catColor = CATEGORY_ACCENT[key] || color;
          const list = visible.filter((todo) => todo.categoryKey === key);
          return (
            <div key={key} style={{ marginBottom: ".7rem" }}>
              <span style={sectionLabel({ color: `${catColor}bb` })}>{labels[key]}</span>
              {list.map((todo) => <TodoRow key={todo.id} todo={todo} scope={scope} color={color} />)}
              {list.length === 0 && <div style={{ fontSize: ".75rem", color: "#e8e8e8", padding: ".1rem 0" }}>—</div>}
              {idx < CATEGORY_ORDER.length - 1 && <div style={{ borderTop: `1px solid ${color}22`, margin: ".6rem 0" }} />}
            </div>
          );
        })}
      </div>
      <div className="footer-actions"><button style={pill("#f0f0f0", "#888", true)} onClick={applyRoutines}>루틴 적용</button><button style={pill(color, "#fff", true)} onClick={shareToday}>Share</button><button style={pill("#f5f5f5", "#aaa", true)} onClick={() => setRoutineOpen(true)}>루틴</button></div>
      {routineOpen && <RoutineModal uid={uid} routines={routines} onClose={() => setRoutineOpen(false)} />}
      {catOpen && <CategorySettings scope={scope} labels={labels} onClose={() => setCatOpen(false)} />}
    </section>
  );
}

function TodoRow({ todo, scope, color }: { todo: TodoItem; scope: Scope; color: string }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);
  const state = todo.state ?? (todo.status === "done" ? 1 : 0);
  async function cycle() {
    const next = ((state + 1) % 3) as 0 | 1 | 2;
    await updateTodoPatch(scope, todo, { state: next, status: next === 1 ? "done" : "open" });
  }
  async function save() {
    await updateTodoTitle(scope, todo, title);
    setEditing(false);
  }
  return <div className="todo-item" style={{ opacity: todo.hidden ? 0.4 : 1 }}>
    <button className="bullet-btn" onClick={cycle} style={{ color }}>{BULLETS[state]}</button>
    {editing ? <textarea autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } }} onBlur={save} rows={2} /> : <span className={state === 1 ? "completed" : state === 2 ? "crossed" : ""} onDoubleClick={() => setEditing(true)}>{todo.hidden ? "숨긴 항목" : todo.title}</span>}
    <button className="icon-btn" onClick={() => updateTodoPatch(scope, todo, { hidden: !todo.hidden })}>{todo.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
    <button className="icon-btn" onClick={editing ? save : () => setEditing(true)}><Edit3 size={13} /></button>
    <button className="icon-btn" onClick={() => archiveTodo(scope, todo)}><X size={13} /></button>
  </div>;
}

function CategorySettings({ scope, labels, onClose }: { scope: Scope; labels: CategoryLabels; onClose: () => void }) {
  const [draft, setDraft] = useState(labels);
  async function save() {
    await saveCategories(scope, draft);
    onClose();
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-head"><b>카테고리명</b><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>{CATEGORY_KEYS.map((key) => <label className="field" key={key}><span>{key}</span><input maxLength={12} value={draft[key]} onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))} /></label>)}<button className="dark-btn" onClick={save}>저장</button></section></div>;
}

function JournalView({ uid, dateKey, color }: { uid: string; dateKey: string; color: string }) {
  const [journal, setJournal] = useState<JournalEntry>({});
  const [daily, setDaily] = useState<DailyEntry>({});
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
  return <section className="main-card journal"><span className="micro-label">ᴊᴏᴜʀɴᴀʟ</span><textarea value={journal.morning ?? ""} onChange={(e) => updateJournal({ morning: e.target.value })} placeholder="아침의 생각" /><MoodPicker value={daily.mood || []} onChange={(mood) => updateDaily({ mood })} color={color} /><textarea value={daily.diary ?? ""} onChange={(e) => updateDaily({ diary: e.target.value })} placeholder="오늘의 기록" /><textarea value={daily.dream ?? ""} onChange={(e) => updateDaily({ dream: e.target.value })} placeholder="꿈 또는 내일의 힌트" /></section>;
}

function MoodPicker({ value, onChange, color }: { value: string[]; onChange: (value: string[]) => void; color: string }) {
  return <div className="mood-row">{MOODS.map((mood) => <button key={mood} style={value.includes(mood) ? { background: color, color: "#fff" } : undefined} onClick={() => onChange(value.includes(mood) ? value.filter((v) => v !== mood) : [...value, mood])}>{mood}</button>)}</div>;
}

function WeekView({ uid, selectedDate }: { uid: string; selectedDate: Date }) {
  const start = addDays(selectedDate, -selectedDate.getDay());
  return <section className="main-card"><span className="micro-label">ᴡᴇᴇᴋ</span><div className="week-list">{Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((date) => <WeekDayMini key={toDateKey(date)} uid={uid} date={date} />)}</div></section>;
}

function WeekDayMini({ uid, date }: { uid: string; date: Date }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const scope = useMemo<Scope>(() => ({ type: "solo", uid }), [uid]);
  const key = toDateKey(date);
  useEffect(() => subscribeTodos(scope, key, setTodos), [scope, key]);
  return <div className="week-mini"><b>{WEEK_KO[date.getDay()]} {date.getDate()}</b><span>{todos.filter((t) => t.status !== "archived").length} items</span></div>;
}

function SharedView({ uid, dateKey, color, pair }: { uid: string; dateKey: string; color: string; pair: Pair | null }) {
  const [shared, setShared] = useState<ReturnType<typeof Object> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => subscribeSharedDay(uid, dateKey, (value) => setShared(value as never)), [uid, dateKey]);
  useEffect(() => subscribeMessages(uid, dateKey, setMessages), [uid, dateKey]);
  async function send() {
    if (!input.trim()) return;
    const next = [...messages, { text: input.trim(), time: Date.now() }];
    setInput("");
    await saveMessages(uid, dateKey, next);
  }
  if (!pair) return <section className="main-card empty-twin"><h2>아직 연결된 Twin이 없어요.</h2><p>왼쪽 패널에서 상대 ID로 연결 요청을 보낼 수 있습니다. 혼자 사용은 계속 가능합니다.</p></section>;
  return <section className="main-card"><span className="micro-label">ᴛᴡɪɴ</span><div className="shared-card" style={{ borderColor: color }}><b>내 공유 카드</b><p>{shared ? "오늘 공유가 준비되었습니다." : "todo 탭에서 오늘 공유하기를 눌러주세요."}</p></div><div className="message-box">{messages.map((m) => <p key={m.time}>{m.text}</p>)}<div className="tiny-form"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="한마디" /><button onClick={send}>→</button></div></div></section>;
}

function RoutineModal({ uid, routines, onClose }: { uid: string; routines: Routine[]; onClose: () => void }) {
  const [text, setText] = useState("");
  const [categoryKey, setCategoryKey] = useState<CategoryKey>("required");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  async function add() {
    if (!text.trim()) return;
    await addRoutine(uid, text, categoryKey, frequency, [new Date().getDay()]);
    setText("");
  }
  return <div className="modal-backdrop" onClick={onClose}><section className="modal-card" onClick={(e) => e.stopPropagation()}><div className="modal-head"><b>루틴</b><button className="icon-btn" onClick={onClose}><X size={14} /></button></div>{routines.map((r) => <div className="routine-row" key={r.id}><span>{r.text}</span><small>{r.categoryKey}</small></div>)}<input className="soft-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="새 루틴" /><div className="button-row"><select value={categoryKey} onChange={(e) => setCategoryKey(e.target.value as CategoryKey)}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{DEFAULT_CATEGORIES[k]}</option>)}</select><select value={frequency} onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}><option value="daily">매일</option><option value="weekly">매주</option></select></div><button className="dark-btn" onClick={add}>추가</button></section></div>;
}

function MemoWidget() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<string[]>(() => JSON.parse(localStorage.getItem("stickies") || "[]"));
  const [input, setInput] = useState("");
  function add() {
    if (!input.trim()) return;
    const next = [input.trim(), ...notes];
    setNotes(next);
    localStorage.setItem("stickies", JSON.stringify(next));
    setInput("");
  }
  return <div className="memo-widget"><button onClick={() => setOpen((v) => !v)}>✎ ᴍᴇᴍᴏ</button>{open && <div className="widget-panel"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } }} placeholder="메모" /><button onClick={add}>추가</button>{notes.map((n, i) => <p key={`${n}-${i}`}>{n}</p>)}</div>}</div>;
}

function MusicWidget({ userId, color }: { userId: string; color: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [urlBar, setUrlBar] = useState(false);
  const [tracks, setTracks] = useState<string[]>(() => JSON.parse(localStorage.getItem(`ytplaylist_${userId}`) || "[]"));
  const [current, setCurrent] = useState(0);
  function add() {
    const embed = ytEmbed(input);
    if (!embed) return;
    const next = [...tracks, embed];
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
  return <div className="music-widget">
    <button onClick={() => setOpen((v) => !v)}>
      <span style={{ fontSize: "12px", color: currentEmbed ? color : "#ccc" }}>♪</span>
      <span style={{ fontSize: "10px", color: "#bbb", letterSpacing: ".1em" }}>ᴍᴜsɪᴄ</span>
    </button>
    <div className="music-panel" style={{ left: open ? 0 : "-9999px" }}>
      <div className="widget-head"><span>ᴍᴜsɪᴄ</span><button onClick={() => setUrlBar((v) => !v)} style={{ color }}>+ 추가</button></div>
      {urlBar && <div className="music-url"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="YouTube URL (영상·플레이리스트 모두 가능)" /><button onClick={add} style={{ background: color }}>→</button></div>}
      {tracks.length > 0 ? <div className="track-list">{tracks.map((track, i) => <div key={`${track}-${i}`} onClick={() => setCurrent(i)} style={{ background: i === current ? `${color}18` : "transparent" }}><span style={{ color: i === current ? color : "#ddd" }}>▶</span><b>Track {i + 1}</b><button onClick={(event) => { event.stopPropagation(); removeTrack(i); }}>✕</button></div>)}</div> : <div className="music-empty"><span>♪</span><p>YouTube URL을 추가해주세요.<br />음악도, 플레이리스트도 가능합니다.</p><button onClick={() => setUrlBar(true)}>+ 추가</button></div>}
      {currentEmbed && <iframe src={currentEmbed} width="290" height="163" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />}
    </div>
  </div>;
}

function PomodoroWidget({ color }: { color: string }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(25 * 60);
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const mm = Math.floor(left / 60).toString().padStart(2, "0");
  const ss = (left % 60).toString().padStart(2, "0");
  return <div className="pomo-widget"><button onClick={() => setOpen((v) => !v)}>◷</button>{open && <div className="widget-panel"><b>{mm}:{ss}</b><div className="button-row"><button style={{ background: color }} onClick={() => setRunning((v) => !v)}>{running ? <Pause size={14} /> : <Play size={14} />}</button><button onClick={() => setLeft(25 * 60)}><RotateCcw size={14} /></button></div></div>}</div>;
}

function DemianWidget() {
  const [open, setOpen] = useState(false);
  return <div className="demian-widget"><button onClick={() => setOpen((v) => !v)}>🖤</button>{open && <div className="widget-panel demian-panel"><button>⚙ 설정</button><b>ᴅᴇᴍɪᴀɴ</b><p>관리자 전용 위젯입니다. 집중 시간 설정과 메시지 기능은 기존 흐름을 유지해 확장할 예정입니다.</p></div>}</div>;
}
