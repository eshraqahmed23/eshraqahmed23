import { config } from "./config.js";
import { readJson, writeJson } from "./store.js";
import type { FollowUpReminder } from "./types.js";

/** The editable follow-up email the agent writes in the editor page. */
export interface FollowUpTemplate {
  subject: string;
  body: string;
}

const TEMPLATE_FILE = "followup-template.json";

/** Placeholders the agent can drop into their template; filled in per lead. */
export const PLACEHOLDERS = [
  { token: "{{first_name}}", desc: "The lead's first name" },
  { token: "{{name}}", desc: "The lead's full name" },
  { token: "{{email}}", desc: "The lead's email address" },
  { token: "{{service}}", desc: "What they asked about (e.g. kitchen remodel)" },
  { token: "{{business}}", desc: "Your business name" },
  { token: "{{agent}}", desc: "Your agent name" },
];

export const DEFAULT_TEMPLATE: FollowUpTemplate = {
  subject: "Still need help with your {{service}}? — {{business}}",
  body: [
    "Hi {{first_name}},",
    "",
    "A week ago you reached out to {{business}} about your {{service}}, and I wanted to check back in — we'd still love to help.",
    "",
    "If it's still on your list, just reply to this email or give us a call and we'll get you scheduled at a time that works for you. No pressure either way.",
    "",
    "Warm regards,",
    "{{agent}}",
    "{{business}}",
  ].join("\n"),
};

export function getFollowUpTemplate(): FollowUpTemplate {
  return readJson<FollowUpTemplate>(TEMPLATE_FILE, DEFAULT_TEMPLATE);
}

export function saveFollowUpTemplate(t: FollowUpTemplate): void {
  writeJson(TEMPLATE_FILE, { subject: t.subject, body: t.body });
}

/** Replace {{placeholders}} in a template with this lead's real values. */
export function renderTemplate(
  template: FollowUpTemplate,
  reminder: FollowUpReminder,
): { subject: string; body: string } {
  const firstName =
    reminder.lead_name.trim().split(/\s+/)[0] || reminder.lead_name;
  const vars: Record<string, string> = {
    first_name: firstName,
    name: reminder.lead_name,
    email: reminder.lead_email,
    service: reminder.service_requested,
    business: config.businessName,
    agent: config.agentName,
  };
  const fill = (s: string) =>
    s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
  return { subject: fill(template.subject), body: fill(template.body) };
}
