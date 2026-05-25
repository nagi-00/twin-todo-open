export type CategoryKey = "required" | "growth" | "freedom";
export type TodoStatus = "open" | "done" | "archived";
export type TodoState = 0 | 1 | 2;

export type CategoryLabels = Record<CategoryKey, string>;

export type UserProfile = {
  email: string;
  emailVerified: boolean;
  displayName: string;
  nickname: string | null;
  nicknameNormalized: string | null;
  avatarPath: string | null;
  backgroundPath?: string | null;
  backgroundOpacity?: number;
  defaultThemeColor?: string;
  role: "user";
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type TodoItem = {
  id: string;
  ownerUid: string;
  categoryKey: CategoryKey;
  title: string;
  status: TodoStatus;
  state?: TodoState;
  hidden?: boolean;
  important?: boolean;
  memo?: string;
  position?: number;
  date: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type Routine = {
  id: string;
  text: string;
  categoryKey: CategoryKey;
  frequency?: "daily" | "weekly";
  freq?: "daily" | "weekly";
  weekdays: number[];
  weekday?: number;
  createdAt?: unknown;
};

export type PairRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  fromNickname?: string;
  toNickname?: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type Pair = {
  id: string;
  members: string[];
  memberMap: Record<string, boolean>;
  memberNicknames?: Record<string, string>;
  status: "active" | "blocked" | "deleted";
  createdAt?: unknown;
  updatedAt?: unknown;
};
