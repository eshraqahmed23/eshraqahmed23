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

  // Email via SendGrid — leave unset for dry-run mode (messages are logged,
  // not sent).
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? "",
  fromEmail: process.env.FROM_EMAIL ?? "",

  // SMS via Twilio — leave unset for dry-run mode.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",

  // Where local state lives (local CRM, reminders, outbox)
  dataDir: process.env.DATA_DIR ?? "data",
};
