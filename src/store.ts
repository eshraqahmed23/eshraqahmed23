import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/** Tiny JSON-file persistence used by the local CRM, reminders, and outbox. */
export function readJson<T>(file: string, fallback: T): T {
  const p = path.join(config.dataDir, file);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const p = path.join(config.dataDir, file);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
