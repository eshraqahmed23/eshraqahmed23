import { config } from "./config.js";
import { sendEmail } from "./notify.js";
import { newId, readJson, writeJson } from "./store.js";
import type { CrmContact, FollowUpReminder, LeadAnalysis } from "./types.js";

const REMINDERS_FILE = "reminders.json";
const CHECK_INTERVAL_MS = 30_000;

/**
 * Step 5 of the workflow: schedule a follow-up reminder for the agent at the
 * time the AI recommended. Reminders persist to data/reminders.json so they
 * survive restarts.
 */
export function scheduleFollowUp(
  contact: CrmContact,
  analysis: LeadAnalysis,
): FollowUpReminder {
  const reminders = readJson<FollowUpReminder[]>(REMINDERS_FILE, []);
  const reminder: FollowUpReminder = {
    id: newId("rem"),
    contact_id: contact.id,
    lead_name: contact.name,
    lead_email: contact.email,
    due_at: new Date(
      Date.now() + analysis.follow_up.delay_hours * 3600_000,
    ).toISOString(),
    reason: analysis.follow_up.reason,
    status: "pending",
  };
  reminders.push(reminder);
  writeJson(REMINDERS_FILE, reminders);
  return reminder;
}

export function listReminders(): FollowUpReminder[] {
  return readJson<FollowUpReminder[]>(REMINDERS_FILE, []);
}

async function deliverDueReminders(): Promise<void> {
  const reminders = readJson<FollowUpReminder[]>(REMINDERS_FILE, []);
  const now = Date.now();
  let changed = false;

  for (const reminder of reminders) {
    if (reminder.status !== "pending" || Date.parse(reminder.due_at) > now) continue;

    const to = config.agentEmail || config.fromEmail;
    const subject = `Follow up with ${reminder.lead_name}`;
    const body = [
      `Time to follow up with ${reminder.lead_name} (${reminder.lead_email}).`,
      "",
      `Why now: ${reminder.reason}`,
      `Contact ID: ${reminder.contact_id}`,
    ].join("\n");

    try {
      if (to) {
        await sendEmail(to, subject, body);
      } else {
        console.log(`[follow-up due] ${subject} — ${reminder.reason}`);
      }
      reminder.status = "sent";
      changed = true;
    } catch (err) {
      console.error(`Failed to deliver reminder ${reminder.id}:`, err);
    }
  }

  if (changed) writeJson(REMINDERS_FILE, reminders);
}

/** Start the background loop that fires due reminders. Returns a stop function. */
export function startScheduler(): () => void {
  const timer = setInterval(() => {
    void deliverDueReminders();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log("Follow-up scheduler running (checks every 30s)");
  return () => clearInterval(timer);
}
