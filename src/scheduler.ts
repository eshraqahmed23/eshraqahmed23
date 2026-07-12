import { config } from "./config.js";
import { sendEmail } from "./notify.js";
import { newId, readJson, writeJson } from "./store.js";
import type { CrmContact, FollowUpReminder, LeadAnalysis } from "./types.js";

const REMINDERS_FILE = "reminders.json";
const CHECK_INTERVAL_MS = 30_000;

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

/** Compose the follow-up email that gets sent to the lead. */
function followUpEmail(reminder: FollowUpReminder): { subject: string; body: string } {
  const firstName = reminder.lead_name.trim().split(/\s+/)[0];
  return {
    subject: `Following up on your inquiry with ${config.businessName}`,
    body: [
      `Hi ${firstName},`,
      "",
      `I wanted to follow up on your recent inquiry with ${config.businessName}` +
        (reminder.service_requested && reminder.service_requested !== "general inquiry"
          ? ` about ${reminder.service_requested}.`
          : "."),
      "",
      `I'd still love to help. Are you available for a quick call this week? ` +
        `Just reply to this email and let me know what works for you.`,
      "",
      "Best,",
      config.agentName,
      config.businessName,
    ].join("\n"),
  };
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

      // Optionally also notify the agent that a follow-up went out.
      const agentTo = config.agentEmail;
      if (agentTo && agentTo !== reminder.lead_email) {
        await sendEmail(
          agentTo,
          `Follow-up sent to ${reminder.lead_name}`,
          `A follow-up was just sent to ${reminder.lead_name} (${reminder.lead_email}).\n\nReason: ${reminder.reason}`,
        );
      }

      reminder.status = "sent";
      sent += 1;
    } catch (err) {
      console.error(`Failed to send follow-up ${reminder.id}:`, err);
    }
  }

  if (sent > 0) writeJson(REMINDERS_FILE, reminders);
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
