import { analyzeLead } from "./ai.js";
import { createContact } from "./crm.js";
import { sendEmail, sendSms } from "./notify.js";
import { scheduleFollowUp } from "./scheduler.js";
import type { LeadSubmission, WorkflowResult } from "./types.js";

/**
 * The full lead capture & follow-up workflow:
 *
 *   1. Customer submits a website form   -> `lead` (validated by the route)
 *   2. AI summarizes their inquiry       -> analyzeLead()
 *   3. Create a contact in the CRM       -> createContact()
 *   4. Send a personalized email + text  -> sendEmail() / sendSms()
 *   5. Schedule a follow-up reminder     -> scheduleFollowUp()
 */
export async function runLeadWorkflow(
  lead: LeadSubmission,
): Promise<WorkflowResult> {
  // 2. AI: summary, lead score, drafted outreach, follow-up recommendation
  const analysis = await analyzeLead(lead);

  // 3. CRM contact (HubSpot or local)
  const contact = await createContact(lead, analysis);

  // 4. Personalized outreach — email always; SMS only when we have a phone number
  const email = await sendEmail(
    lead.email,
    analysis.email.subject,
    analysis.email.body,
  );
  const sms = lead.phone
    ? await sendSms(lead.phone, analysis.sms)
    : { sent: false, detail: "skipped (no phone number provided)" };

  // 5. Follow-up reminder for the agent
  const reminder = scheduleFollowUp(contact, analysis);

  return { lead, analysis, contact, outreach: { email, sms }, reminder };
}
