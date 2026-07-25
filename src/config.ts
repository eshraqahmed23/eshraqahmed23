import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),

  // Business identity — used to personalize AI-drafted messages
  businessName: process.env.BUSINESS_NAME ?? "Acme Realty",
  businessType: process.env.BUSINESS_TYPE ?? "real estate agency",
  agentName: process.env.AGENT_NAME ?? "your agent",
  agentEmail: process.env.AGENT_EMAIL ?? "",

  // AI — the Anthropic SDK reads ANTHROPIC_API_KEY (or an `ant auth login`
  // profile) from the environment on its own. MOCK_AI=true skips the API
  // for local development without credentials.
  mockAi: process.env.MOCK_AI === "true",
  model: process.env.CLAUDE_MODEL ?? "claude-opus-4-8",

  // CRM — set HUBSPOT_ACCESS_TOKEN to use HubSpot; otherwise a local JSON
  // CRM at data/crm.json is used.
  hubspotToken: process.env.HUBSPOT_ACCESS_TOKEN ?? "",

  // Email via Gmail — set GMAIL_USER (your address) and GMAIL_APP_PASSWORD
  // (a 16-char Google App Password) to send through your own Gmail account.
  gmailUser: process.env.GMAIL_USER ?? "",
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? "",

  // Email via SendGrid — alternative to Gmail. Leave both unset for dry-run
  // mode (messages are logged, not sent).
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  fromEmail: process.env.FROM_EMAIL ?? "",

  // SMS via Twilio — leave unset for dry-run mode.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",

  // When set, overrides the AI's recommended follow-up delay with this many
  // minutes. Handy for testing: FOLLOWUP_MINUTES=1 fires follow-ups a minute
  // after the lead is submitted instead of hours later.
  followupMinutes: process.env.FOLLOWUP_MINUTES
    ? Number(process.env.FOLLOWUP_MINUTES)
    : null,

  // A lead with the same email address won't be emailed again within this
  // many days — prevents repeat form submissions from re-triggering the
  // welcome + follow-up. Default 30 days; set 0 to disable de-duplication.
  dedupeDays: process.env.DEDUPE_DAYS ? Number(process.env.DEDUPE_DAYS) : 30,

  // Optional: a Google Sheets webhook URL (from a Google Apps Script web app).
  // When set, every lead is appended as a row to your Google Sheet in real time.
  sheetsWebhookUrl: process.env.SHEETS_WEBHOOK_URL ?? "",

  // Where local state lives (local CRM, reminders, outbox)
  dataDir: process.env.DATA_DIR ?? "data",
};
