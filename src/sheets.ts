import { config } from "./config.js";
import type { LeadAnalysis, LeadSubmission } from "./types.js";

/**
 * Append a lead as a row to a Google Sheet, if a Sheets webhook is configured.
 * Uses a Google Apps Script web app URL (SHEETS_WEBHOOK_URL) — see the README
 * for the one-time setup. Fire-and-forget: never blocks or fails the workflow.
 */
export async function appendLeadToSheet(
  lead: LeadSubmission,
  analysis: LeadAnalysis,
  status: string,
): Promise<void> {
  if (!config.sheetsWebhookUrl) return;

  const row = {
    timestamp: new Date().toISOString(),
    name: lead.name,
    email: lead.email,
    phone: lead.phone ?? "",
    source: lead.source ?? "",
    lead_quality: analysis.lead_quality,
    service: analysis.service_requested,
    summary: analysis.summary,
    status,
  };

  try {
    await fetch(config.sheetsWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
  } catch (err) {
    console.error("Failed to log lead to Google Sheet:", err);
  }
}
