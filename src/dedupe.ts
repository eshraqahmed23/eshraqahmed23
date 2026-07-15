import { config } from "./config.js";
import { readJson, writeJson } from "./store.js";

interface ContactLogEntry {
  email: string;
  at: string;
}

const FILE = "contacted.json";

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Has this email address already been emailed within the de-dupe window?
 * Guarantees a lead can't be contacted repeatedly by submitting the form
 * multiple times. Set DEDUPE_DAYS=0 to disable.
 */
export function alreadyContacted(email: string): boolean {
  if (config.dedupeDays <= 0) return false;
  const log = readJson<ContactLogEntry[]>(FILE, []);
  const cutoff = Date.now() - config.dedupeDays * 86_400_000;
  const key = normalize(email);
  return log.some((c) => c.email === key && Date.parse(c.at) >= cutoff);
}

/** Record that we've emailed this address (called after the welcome goes out). */
export function markContacted(email: string): void {
  const log = readJson<ContactLogEntry[]>(FILE, []);
  log.push({ email: normalize(email), at: new Date().toISOString() });
  writeJson(FILE, log);
}
