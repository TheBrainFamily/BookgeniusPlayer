import fs from "fs";
import path from "path";
import { z } from "zod";
import type { GraphicalStyle } from "../../src/tools/new-tooling/create-graphical-style";

export const StyleSelectionStatusEnum = z.enum([
  "awaiting_input",
  "generating_auto_style",
  "generating_user_style",
  "generating_previews",
  "awaiting_choice",
  "complete",
  "timed_out",
]);

export type StyleSelectionStatus = z.infer<typeof StyleSelectionStatusEnum>;

export const StyleSelectionStateSchema = z.object({
  status: StyleSelectionStatusEnum,
  autoStyle: z.object({ backgroundStyle: z.string(), periodStyle: z.string(), avatarStyle: z.string() }).nullable(),
  userPrompt: z.string().nullable(),
  userStyle: z.object({ backgroundStyle: z.string(), periodStyle: z.string(), avatarStyle: z.string() }).nullable(),
  previews: z
    .object({ autoPreviewPath: z.string().nullable(), userPreviewPath: z.string().nullable(), autoAvatarPath: z.string().nullable(), userAvatarPath: z.string().nullable() })
    .nullable(),
  selected: z.enum(["auto", "user"]).nullable(),
  timeoutAt: z.number().nullable(),
  startedAt: z.number(),
  updatedAt: z.number(),
  error: z.string().nullable(),
});

export type StyleSelectionState = z.infer<typeof StyleSelectionStateSchema>;

const STYLE_SELECTION_FILE = "style-selection.json";

function getStyleSelectionPath(bookRoot: string): string {
  return path.join(bookRoot, "temporary-output", STYLE_SELECTION_FILE);
}

export function initStyleSelection(bookRoot: string): StyleSelectionState {
  const now = Date.now();
  const state: StyleSelectionState = {
    status: "generating_auto_style",
    autoStyle: null,
    userPrompt: null,
    userStyle: null,
    previews: null,
    selected: null,
    timeoutAt: null,
    startedAt: now,
    updatedAt: now,
    error: null,
  };

  const filePath = getStyleSelectionPath(bookRoot);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  return state;
}

export function readStyleSelection(bookRoot: string): StyleSelectionState | null {
  const filePath = getStyleSelectionPath(bookRoot);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return StyleSelectionStateSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

export function updateStyleSelection(bookRoot: string, updates: Partial<StyleSelectionState>): StyleSelectionState {
  const current = readStyleSelection(bookRoot);
  if (!current) {
    throw new Error("Style selection state not initialized");
  }

  const updated: StyleSelectionState = { ...current, ...updates, updatedAt: Date.now() };

  const filePath = getStyleSelectionPath(bookRoot);
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  return updated;
}

export function setAutoStyleComplete(bookRoot: string, autoStyle: GraphicalStyle): StyleSelectionState {
  const current = readStyleSelection(bookRoot);
  if (current?.status === "generating_auto_style") {
    return updateStyleSelection(bookRoot, { autoStyle, status: "awaiting_input" });
  }
  return updateStyleSelection(bookRoot, { autoStyle });
}

export function setUserStyleDescription(bookRoot: string, userPrompt: string | null): StyleSelectionState {
  if (userPrompt === null) {
    return updateStyleSelection(bookRoot, { userPrompt: null, userStyle: null, status: "generating_previews" });
  }

  return updateStyleSelection(bookRoot, { userPrompt, status: "generating_user_style" });
}

export function setUserStyleExpanded(bookRoot: string, userStyle: GraphicalStyle): StyleSelectionState {
  return updateStyleSelection(bookRoot, { userStyle, status: "generating_previews" });
}

export function setPreviewsGenerated(
  bookRoot: string,
  autoPreviewPath: string | null,
  userPreviewPath: string | null,
  autoAvatarPath: string | null = null,
  userAvatarPath: string | null = null,
): StyleSelectionState {
  return updateStyleSelection(bookRoot, { previews: { autoPreviewPath, userPreviewPath, autoAvatarPath, userAvatarPath }, status: "awaiting_choice" });
}

export function setStyleChoice(bookRoot: string, choice: "auto" | "user"): StyleSelectionState {
  return updateStyleSelection(bookRoot, { selected: choice, status: "complete" });
}

export function setTimedOut(bookRoot: string): StyleSelectionState {
  return updateStyleSelection(bookRoot, { status: "timed_out", selected: "auto" });
}

export function setError(bookRoot: string, error: string): StyleSelectionState {
  return updateStyleSelection(bookRoot, { error });
}

export function isTimedOut(state: StyleSelectionState): boolean {
  if (!state.timeoutAt) return false;
  return Date.now() > state.timeoutAt;
}

export function getRemainingTimeMs(state: StyleSelectionState): number {
  if (!state.timeoutAt) return 0;
  return Math.max(0, state.timeoutAt - Date.now());
}

export function getSelectedStyle(state: StyleSelectionState): GraphicalStyle | null {
  if (state.selected === "user" && state.userStyle) {
    return state.userStyle;
  }
  return state.autoStyle;
}
