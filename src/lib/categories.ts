import type { CategoryLabels } from "../types";

export const DEFAULT_CATEGORIES: CategoryLabels = {
  required: "필연",
  growth: "성장",
  freedom: "자유",
};

export const CATEGORY_COLORS = {
  required: "#8a4545",
  growth: "#43518e",
  freedom: "#4a7c5a",
};

export const CATEGORY_KEYS = ["required", "growth", "freedom"] as const;
