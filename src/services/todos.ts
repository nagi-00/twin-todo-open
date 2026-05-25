import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { CategoryKey, TodoItem, TodoStatus } from "../types";

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
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as TodoItem));
  });
}

export async function addTodo(scope: TodoScope, date: string, categoryKey: CategoryKey, title: string) {
  const ownerUid = scope.uid;
  await addDoc(todosCollection(scope), {
    ownerUid,
    categoryKey,
    title: title.trim(),
    status: "open" satisfies TodoStatus,
    date,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTodoStatus(scope: TodoScope, todo: TodoItem, status: TodoStatus) {
  await updateDoc(todoDoc(scope, todo.id), {
    ownerUid: todo.ownerUid,
    categoryKey: todo.categoryKey,
    title: todo.title,
    status,
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
    date: todo.date,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveTodo(scope: TodoScope, todo: TodoItem) {
  await updateTodoStatus(scope, todo, "archived");
}

export async function deleteRoutineUnsafe(scope: TodoScope, id: string) {
  await deleteDoc(todoDoc(scope, id));
}
