import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CategoryKey, TodoItem, TodoState, TodoStatus } from "../types";

type TodoScope =
  | { type: "solo"; uid: string }
  | { type: "pair"; pairId: string; uid: string };

function todosCollection(scope: TodoScope) {
  if (!db) throw new Error("Firestore is not configured.");
  if (scope.type === "solo") return collection(db, "users", scope.uid, "todos");
  return collection(db, "pairs", scope.pairId, "todos");
}

function todoDoc(scope: TodoScope, id: string) {
  if (!db) throw new Error("Firestore is not configured.");
  if (scope.type === "solo") return doc(db, "users", scope.uid, "todos", id);
  return doc(db, "pairs", scope.pairId, "todos", id);
}

export function subscribeTodos(scope: TodoScope, date: string, callback: (todos: TodoItem[]) => void) {
  const q = query(todosCollection(scope), where("date", "==", date), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TodoItem).sort(sortTodos));
  });
}

function sortTodos(a: TodoItem, b: TodoItem) {
  const aPos = typeof a.position === "number" ? a.position : Number.POSITIVE_INFINITY;
  const bPos = typeof b.position === "number" ? b.position : Number.POSITIVE_INFINITY;
  if (aPos !== bPos) return aPos - bPos;
  return 0;
}

export async function addTodo(scope: TodoScope, date: string, categoryKey: CategoryKey, title: string) {
  const ownerUid = scope.uid;
  const ref = await addDoc(todosCollection(scope), {
    ownerUid,
    categoryKey,
    title: title.trim(),
    status: "open" satisfies TodoStatus,
    state: 0 satisfies TodoState,
    hidden: false,
    important: false,
    memo: "",
    position: Date.now(),
    date,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTodoStatus(scope: TodoScope, todo: TodoItem, status: TodoStatus) {
  await updateDoc(todoDoc(scope, todo.id), {
    ownerUid: todo.ownerUid,
    categoryKey: todo.categoryKey,
    title: todo.title,
    status,
    state: status === "done" ? 1 : 0,
    hidden: todo.hidden ?? false,
    important: todo.important ?? false,
    memo: todo.memo ?? "",
    position: todo.position ?? Date.now(),
    date: todo.date,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTodoTitle(scope: TodoScope, todo: TodoItem, title: string) {
  await updateDoc(todoDoc(scope, todo.id), {
    ownerUid: todo.ownerUid,
    categoryKey: todo.categoryKey,
    title: title.trim(),
    status: todo.status,
    state: todo.state ?? 0,
    hidden: todo.hidden ?? false,
    important: todo.important ?? false,
    memo: todo.memo ?? "",
    position: todo.position ?? Date.now(),
    date: todo.date,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveTodo(scope: TodoScope, todo: TodoItem) {
  await updateTodoStatus(scope, todo, "archived");
}

export async function updateTodoPatch(scope: TodoScope, todo: TodoItem, patch: Partial<TodoItem>) {
  await updateDoc(todoDoc(scope, todo.id), {
    ownerUid: todo.ownerUid,
    categoryKey: patch.categoryKey ?? todo.categoryKey,
    title: patch.title ?? todo.title,
    status: patch.status ?? todo.status,
    state: patch.state ?? todo.state ?? 0,
    hidden: patch.hidden ?? todo.hidden ?? false,
    important: patch.important ?? todo.important ?? false,
    memo: patch.memo ?? todo.memo ?? "",
    position: patch.position ?? todo.position ?? Date.now(),
    date: todo.date,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRoutineUnsafe(scope: TodoScope, id: string) {
  await deleteDoc(todoDoc(scope, id));
}

export async function reorderTodos(scope: TodoScope, todos: TodoItem[]) {
  await Promise.all(todos.map((todo, index) => updateTodoPatch(scope, todo, { position: index + 1 })));
}

export async function getTodosForDate(scope: TodoScope, date: string) {
  const q = query(todosCollection(scope), where("date", "==", date), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TodoItem).sort(sortTodos);
}
