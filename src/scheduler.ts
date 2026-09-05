import { config } from "./config.js";
import { sendEmail } from "./notify.js";
import { getFollowUpTemplate, renderTemplate } from "./settings.js";
import { newId, readJson, writeJson } from "./store.js";
import type { CrmContact, FollowUpReminder, LeadAnalysis } from "./types.js";

const REMINDERS_FILE = "reminders.json";
const CHECK_INTERVAL_MS = 30_000;
// Give up on a follow-up after this many failed send attempts, so a broken
// email configuration can never retry (and possibly re-send) indefinitely.
const MAX_SEND_ATTEMPTS = 3;

/**
 * Step 5 of the workflow: schedule an automatic follow-up to the lead at the
 * time the AI recommended (or FOLLOWUP_MINUTES, if set, for quick testing).
 * Follow-ups persist to data/reminders.json so they survive restarts.
 */
export function scheduleFollowUp(
  contact: CrmContact,
  analysis: LeadAnalysis,
): FollowUpReminder {
  const reminders = readJson<FollowUpReminder[]>(REMINDERS_FILE, []);
  const delayMs =
    config.followupMinutes != null
      ? config.followupMinutes * 60_000
      : analysis.follow_up.delay_hours * 3600_000;

  const reminder: FollowUpReminder = {
    id: newId("rem"),
    contact_id: contact.id,
    lead_name: contact.name,
    lead_email: contact.email,
    service_requested: analysis.service_requested,
    due_at: new Date(Date.now() + delayMs).toISOString(),
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

/** Compose the follow-up email using the agent's editable template. */
function followUpEmail(reminder: FollowUpReminder): { subject: string; body: string } {
  return renderTemplate(getFollowUpTemplate(), reminder);
}

/**
 * Send any follow-ups whose time has come. If `force` is true, send all
 * pending follow-ups immediately regardless of their scheduled time
 * (used by the "send now" test endpoint). Returns how many were sent.
 */
export async function deliverDueReminders(force = false): Promise<number> {
  const reminders = readJson<FollowUpReminder[]>(REMINDERS_FILE, []);
  const now = Date.now();
  let sent = 0;

  for (const reminder of reminders) {
    if (reminder.status !== "pending") continue;
    if (!force && Date.parse(reminder.due_at) > now) continue;

    const { subject, body } = followUpEmail(reminder);
    try {
      // The automatic follow-up goes to the lead (the customer).
      await sendEmail(reminder.lead_email, subject, body);
    } catch (err) {
      // Sending genuinely failed. Count the attempt and give up after a few
      // tries so a broken email setup can't retry forever every 30 seconds.
      reminder.attempts = (reminder.attempts ?? 0) + 1;
      if (reminder.attempts >= MAX_SEND_ATTEMPTS) {
        reminder.status = "failed";
        console.error(
          `Giving up on follow-up ${reminder.id} after ${reminder.attempts} attempts.`,
        );
      } else {
        console.error(
          `Failed to send follow-up ${reminder.id} (attempt ${reminder.attempts}):`,
          err,
        );
      }
      writeJson(REMINDERS_FILE, reminders);
      continue;
    }

    // The lead's follow-up went out — mark it sent AND persist immediately, so
    // it can never be sent a second time, no matter what happens after this.
    reminder.status = "sent";
    sent += 1;
    writeJson(REMINDERS_FILE, reminders);

    // Optionally notify the agent that a follow-up went out. This is a
    // secondary courtesy email: if it fails, it must NOT affect the lead's
    // follow-up (already sent and marked), so it gets its own try/catch.
    const agentTo = config.agentEmail;
    if (agentTo && agentTo !== reminder.lead_email) {
      try {
        await sendEmail(
          agentTo,
          `Follow-up sent to ${reminder.lead_name}`,
          `A follow-up was just sent to ${reminder.lead_name} (${reminder.lead_email}).\n\nReason: ${reminder.reason}`,
        );
      } catch (err) {
        console.error(`Failed to notify agent about follow-up ${reminder.id}:`, err);
      }
    }
  }

  return sent;
}

/** Start the background loop that fires due follow-ups. Returns a stop function. */
export function startScheduler(): () => void {
  const timer = setInterval(() => {
    void deliverDueReminders();
  }, CHECK_INTERVAL_MS);
  timer.unref?.();
  console.log("Follow-up scheduler running (checks every 30s)");
  return () => clearInterval(timer);
}
