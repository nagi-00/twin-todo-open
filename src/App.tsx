import { User } from "firebase/auth";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Image,
  Link2,
  LogOut,
  Plus,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { isFirebaseConfigured } from "./firebase";
import { CATEGORY_COLORS, CATEGORY_KEYS, DEFAULT_CATEGORIES } from "./lib/categories";
import { addDays, formatLongDate, monthMatrix, toDateKey } from "./lib/date";
import { logout, signInWithGoogle, subscribeAuth } from "./services/auth";
import { saveCategories, subscribeCategories } from "./services/categories";
import { claimNickname, createPairRequest, acceptPairRequest, rejectPairRequest } from "./services/functions";
import { JournalEntry, saveJournal, subscribeJournal } from "./services/journal";
import { subscribeActivePair, subscribePairRequests } from "./services/pairs";
import { ensureUserProfile, subscribeProfile, updateDisplayName, uploadAvatar } from "./services/profile";
import { addTodo, archiveTodo, subscribeTodos, updateTodoStatus, updateTodoTitle } from "./services/todos";
import type { CategoryKey, CategoryLabels, Pair, PairRequest, TodoItem, UserProfile } from "./types";

type Scope = { type: "solo"; uid: string } | { type: "pair"; pairId: string; uid: string };

function getErrorMessage(err: unknown) {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: unknown }).code);
    if (code === "auth/popup-blocked") return "팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단을 허용해주세요.";
    if (code === "auth/popup-closed-by-user") return "로그인 창이 닫혔습니다. 다시 시도해주세요.";
    if (code === "auth/unauthorized-domain") return "현재 도메인이 Firebase Authentication 승인된 도메인에 없습니다.";
    if (code === "auth/operation-not-allowed") return "Firebase Authentication에서 Google 로그인이 아직 사용 설정되지 않았습니다.";
    if (code === "auth/network-request-failed") return "네트워크 요청이 차단되었습니다. App Check, CSP, 브라우저 확장 설정을 확인해주세요.";
    return `${code}: ${err instanceof Error ? err.message : "Firebase 오류가 발생했습니다."}`;
  }
  return err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return subscribeAuth(async (nextUser) => {
      setUser(nextUser);
      setLoading(false);
      if (nextUser) await ensureUserProfile(nextUser);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return undefined;
    }
    return subscribeProfile(user.uid, setProfile);
  }, [user]);

  if (!isFirebaseConfigured) return <SetupRequired />;
  if (loading) return <ShellMessage title="TwinTodo" body="불러오는 중입니다." />;
  if (!user) return <LoginScreen />;
  if (!profile) return <ShellMessage title="TwinTodo" body="프로필을 준비하는 중입니다." />;
  if (!profile.nickname) return <NicknameOnboarding displayName={profile.displayName} />;

  return <Workspace user={user} profile={profile} />;
}

function SetupRequired() {
  return (
    <ShellMessage
      title="Firebase 설정 필요"
      body=".env.example을 복사해 .env.local을 만들고 Firebase 웹 앱 설정값을 채워주세요."
    />
  );
}

function ShellMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="center-screen">
      <section className="auth-card">
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
      <section className="auth-card">
        <p className="eyebrow">secure twin todo</p>
        <h1>TwinTodo Open</h1>
        <p>혼자 시작하고, 원하면 닉네임으로 연결해 함께 사용할 수 있어요.</p>
        <button className="primary-btn" onClick={handleLogin} disabled={busy}>
          <UserRound size={17} />
          {busy ? "연결 중..." : "Google로 시작하기"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

function NicknameOnboarding({ displayName }: { displayName: string }) {
  const [nickname, setNickname] = useState(displayName.replace(/\s/g, "").slice(0, 12));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await claimNickname(nickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : "닉네임 등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-screen">
      <section className="auth-card">
        <p className="eyebrow">first setup</p>
        <h1>닉네임 만들기</h1>
        <p>닉네임은 연결 요청에 쓰이므로 중복 없이 안전하게 등록됩니다.</p>
        <input
          className="text-input"
          value={nickname}
          maxLength={20}
          onChange={(event) => setNickname(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && submit()}
        />
        <button className="primary-btn" onClick={submit} disabled={busy || nickname.trim().length < 2}>
          <Check size={17} />
          {busy ? "확인 중..." : "시작하기"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  );
}

function Workspace({ user, profile }: { user: User; profile: UserProfile }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activePair, setActivePair] = useState<Pair | null>(null);
  const [requests, setRequests] = useState<PairRequest[]>([]);
  const [mode, setMode] = useState<"solo" | "pair">("solo");

  useEffect(() => subscribeActivePair(user.uid, setActivePair), [user.uid]);
  useEffect(() => subscribePairRequests(user.uid, setRequests), [user.uid]);

  const scope: Scope = useMemo(
    () => mode === "pair" && activePair
      ? { type: "pair", pairId: activePair.id, uid: user.uid }
      : { type: "solo", uid: user.uid },
    [activePair, mode, user.uid],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <ProfileCard user={user} profile={profile} />
        <CalendarPanel selectedDate={selectedDate} onSelect={setSelectedDate} />
        <PairPanel
          mode={mode}
          hasPair={Boolean(activePair)}
          requests={requests}
          onModeChange={setMode}
        />
      </aside>
      <main className="main-panel">
        <TopBar
          date={selectedDate}
          mode={scope.type}
          pairAvailable={Boolean(activePair)}
          onPrev={() => setSelectedDate((value) => addDays(value, -1))}
          onNext={() => setSelectedDate((value) => addDays(value, 1))}
          onToday={() => setSelectedDate(new Date())}
        />
        <TodoBoard scope={scope} selectedDate={selectedDate} />
        <JournalPanel uid={user.uid} selectedDate={selectedDate} />
      </main>
    </div>
  );
}

function ProfileCard({ user, profile }: { user: User; profile: UserProfile }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    if (!name.trim()) return;
    setBusy(true);
    await updateDisplayName(user.uid, name.trim());
    setBusy(false);
    setEditing(false);
  }

  async function handleAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    await uploadAvatar(user.uid, file);
    setBusy(false);
  }

  return (
    <section className="profile-card">
      <div className="avatar">{profile.displayName.slice(0, 1).toUpperCase()}</div>
      <div className="profile-body">
        {editing ? (
          <input className="compact-input" value={name} onChange={(event) => setName(event.target.value)} />
        ) : (
          <strong>{profile.displayName}</strong>
        )}
        <span>@{profile.nickname}</span>
      </div>
      <div className="icon-row">
        <label className="icon-btn" title="프로필 이미지">
          <Image size={15} />
          <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleAvatar(event.target.files?.[0])} />
        </label>
        <button className="icon-btn" title="이름 편집" disabled={busy} onClick={editing ? saveName : () => setEditing(true)}>
          <Edit3 size={15} />
        </button>
        <button className="icon-btn" title="로그아웃" onClick={logout}>
          <LogOut size={15} />
        </button>
      </div>
    </section>
  );
}

function CalendarPanel({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => void }) {
  const [anchor, setAnchor] = useState(selectedDate);
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const selectedKey = toDateKey(selectedDate);

  return (
    <section className="panel">
      <div className="panel-heading">
        <button className="icon-btn" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>
          <ChevronLeft size={16} />
        </button>
        <div>
          <b>{anchor.toLocaleDateString("en-US", { month: "long" })}</b>
          <span>{anchor.getFullYear()}</span>
        </div>
        <button className="icon-btn" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="calendar-grid weekdays">
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell) return <span key={`empty-${index}`} />;
          const key = toDateKey(cell);
          return (
            <button key={key} className={key === selectedKey ? "day selected" : "day"} onClick={() => onSelect(cell)}>
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PairPanel({
  mode,
  hasPair,
  requests,
  onModeChange,
}: {
  mode: "solo" | "pair";
  hasPair: boolean;
  requests: PairRequest[];
  onModeChange: (mode: "solo" | "pair") => void;
}) {
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");

  async function sendRequest() {
    setMessage("");
    try {
      await createPairRequest(nickname);
      setNickname("");
      setMessage("요청을 보냈습니다.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "요청에 실패했습니다.");
    }
  }

  return (
    <section className="panel">
      <div className="scope-toggle">
        <button className={mode === "solo" ? "active" : ""} onClick={() => onModeChange("solo")}>solo</button>
        <button className={mode === "pair" ? "active" : ""} disabled={!hasPair} onClick={() => onModeChange("pair")}>pair</button>
      </div>
      <div className="pair-form">
        <label>닉네임으로 연결</label>
        <div className="inline-form">
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="상대 닉네임" />
          <button onClick={sendRequest} disabled={nickname.trim().length < 2}>
            <Link2 size={15} />
          </button>
        </div>
        {message && <p>{message}</p>}
      </div>
      {requests.length > 0 && (
        <div className="request-list">
          <label>받은 요청</label>
          {requests.map((request) => (
            <div className="request-item" key={request.id}>
              <span>{request.fromNickname ?? "사용자"}님의 요청</span>
              <button className="icon-btn" onClick={() => acceptPairRequest(request.id)}><Check size={14} /></button>
              <button className="icon-btn" onClick={() => rejectPairRequest(request.id)}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TopBar({
  date,
  mode,
  pairAvailable,
  onPrev,
  onNext,
  onToday,
}: {
  date: Date;
  mode: "solo" | "pair";
  pairAvailable: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">{mode === "solo" ? "solo workspace" : "pair workspace"}</p>
        <h1>{formatLongDate(date)}</h1>
        {!pairAvailable && <span>혼자 사용 중입니다. pair 연결은 언제든 선택할 수 있어요.</span>}
      </div>
      <div className="top-actions">
        <button className="ghost-btn" onClick={onPrev}><ChevronLeft size={16} /></button>
        <button className="ghost-btn" onClick={onToday}><CalendarDays size={16} />오늘</button>
        <button className="ghost-btn" onClick={onNext}><ChevronRight size={16} /></button>
      </div>
    </header>
  );
}

function TodoBoard({ scope, selectedDate }: { scope: Scope; selectedDate: Date }) {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [labels, setLabels] = useState<CategoryLabels>(DEFAULT_CATEGORIES);
  const [inputs, setInputs] = useState<Record<CategoryKey, string>>({ required: "", growth: "", freedom: "" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dateKey = toDateKey(selectedDate);
  const scopeKey = scope.type === "solo" ? `solo:${scope.uid}` : `pair:${scope.pairId}:${scope.uid}`;

  useEffect(() => subscribeTodos(scope, dateKey, setTodos), [scope, scopeKey, dateKey]);
  useEffect(() => subscribeCategories(scope, setLabels), [scope, scopeKey]);

  const visibleTodos = todos.filter((todo) => todo.status !== "archived");
  const doneCount = visibleTodos.filter((todo) => todo.status === "done").length;
  const progress = visibleTodos.length ? Math.round((doneCount / visibleTodos.length) * 100) : 0;

  async function submit(categoryKey: CategoryKey) {
    const title = inputs[categoryKey].trim();
    if (!title) return;
    await addTodo(scope, dateKey, categoryKey, title);
    setInputs((value) => ({ ...value, [categoryKey]: "" }));
  }

  return (
    <section className="todo-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">today's todo</p>
          <h2>{progress}%</h2>
        </div>
        <button className="ghost-btn" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} />
          카테고리
        </button>
      </div>
      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      <div className="category-grid">
        {CATEGORY_KEYS.map((key) => (
          <section className="category-column" key={key}>
            <h3 style={{ color: CATEGORY_COLORS[key] }}>{labels[key]}</h3>
            <div className="inline-form">
              <input
                value={inputs[key]}
                onChange={(event) => setInputs((value) => ({ ...value, [key]: event.target.value }))}
                onKeyDown={(event) => event.key === "Enter" && submit(key)}
                placeholder={`${labels[key]} 추가`}
              />
              <button onClick={() => submit(key)}><Plus size={15} /></button>
            </div>
            <div className="todo-list">
              {visibleTodos.filter((todo) => todo.categoryKey === key).map((todo) => (
                <TodoRow key={todo.id} todo={todo} scope={scope} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {settingsOpen && <CategorySettings scope={scope} labels={labels} onClose={() => setSettingsOpen(false)} />}
    </section>
  );
}

function TodoRow({ todo, scope }: { todo: TodoItem; scope: Scope }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(todo.title);

  const nextStatus = todo.status === "done" ? "open" : "done";

  async function save() {
    await updateTodoTitle(scope, todo, title);
    setEditing(false);
  }

  return (
    <div className={todo.status === "done" ? "todo-row done" : "todo-row"}>
      <button className="check-btn" onClick={() => updateTodoStatus(scope, todo, nextStatus)}>
        {todo.status === "done" ? "☑" : "☐"}
      </button>
      {editing ? (
        <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && save()} />
      ) : (
        <span>{todo.title}</span>
      )}
      <button className="icon-btn" onClick={editing ? save : () => setEditing(true)}><Edit3 size={13} /></button>
      <button className="icon-btn" onClick={() => archiveTodo(scope, todo)}><X size={13} /></button>
    </div>
  );
}

function CategorySettings({ scope, labels, onClose }: { scope: Scope; labels: CategoryLabels; onClose: () => void }) {
  const [draft, setDraft] = useState(labels);

  async function submit() {
    await saveCategories(scope, draft);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="card-heading">
          <h2>카테고리 편집</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {CATEGORY_KEYS.map((key) => (
          <label className="field" key={key}>
            <span>{key}</span>
            <input
              value={draft[key]}
              maxLength={12}
              onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button className="primary-btn" onClick={submit}><Check size={16} />저장</button>
      </section>
    </div>
  );
}

function JournalPanel({ uid, selectedDate }: { uid: string; selectedDate: Date }) {
  const dateKey = toDateKey(selectedDate);
  const [entry, setEntry] = useState<JournalEntry>({});

  useEffect(() => subscribeJournal(uid, dateKey, setEntry), [uid, dateKey]);

  function update(patch: JournalEntry) {
    const next = { ...entry, ...patch };
    setEntry(next);
    void saveJournal(uid, dateKey, next);
  }

  return (
    <section className="journal-card">
      <p className="eyebrow">journal</p>
      <textarea
        value={entry.morning ?? ""}
        onChange={(event) => update({ morning: event.target.value })}
        placeholder="오늘의 시작을 적어두세요."
      />
      <textarea
        value={entry.evening ?? ""}
        onChange={(event) => update({ evening: event.target.value })}
        placeholder="오늘의 끝에 남기고 싶은 말을 적어두세요."
      />
    </section>
  );
}
