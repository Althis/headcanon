/** The onboarding's choices (DEC-025): the mode, Guided or Full-Auto, and an optional cap; kept beside the ops log. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gitDirOf } from "./ops.js";

export interface Settings { mode: "guided" | "full-auto"; cap?: string | undefined; at?: string | undefined }

export function readSettings(canonDir: string): Settings {
  const git = gitDirOf(resolve(canonDir));
  const file = git ? join(git, "headcanon", "settings.json") : undefined;
  if (file && existsSync(file)) { try { const s = JSON.parse(readFileSync(file, "utf8")) as Settings; if (s.mode === "guided" || s.mode === "full-auto") return s; } catch { /* fall through */ } }
  return { mode: "full-auto" };
}

export function writeSettings(canonDir: string, s: Settings): boolean {
  const git = gitDirOf(resolve(canonDir));
  if (!git) return false;
  mkdirSync(join(git, "headcanon"), { recursive: true });
  writeFileSync(join(git, "headcanon", "settings.json"), JSON.stringify(s, null, 1));
  return true;
}
