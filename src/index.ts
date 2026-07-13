import express from "express";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.js";
import { listContacts } from "./crm.js";
import {
  deliverDueReminders,
  listReminders,
  startScheduler,
} from "./scheduler.js";
import {
  DEFAULT_TEMPLATE,
  PLACEHOLDERS,
  getFollowUpTemplate,
  saveFollowUpTemplate,
} from "./settings.js";
import { runLeadWorkflow } from "./workflow.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve("public")));

const LeadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(1),
  source: z.string().optional(),
  extras: z.record(z.string(), z.string()).optional(),
});

/**
 * Step 1 of the workflow: the website form posts here.
 * Point any form (or a Zapier/webflow/wordpress webhook) at this endpoint.
 */
app.post("/api/leads", async (req, res) => {
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid lead submission",
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await runLeadWorkflow(parsed.data);
    console.log(
      `Lead processed: ${result.contact.name} [${result.analysis.lead_quality}] — follow-up at ${result.reminder.due_at}`,
    );
    return res.status(201).json(result);
  } catch (err) {
    console.error("Workflow failed:", err);
    return res.status(500).json({
      error: "Workflow failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// Follow-up email template — read and edit from the editor page (/editor).
app.get("/api/followup-template", (_req, res) => {
  res.json({
    template: getFollowUpTemplate(),
    defaults: DEFAULT_TEMPLATE,
    placeholders: PLACEHOLDERS,
  });
});

const TemplateSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

app.post("/api/followup-template", (req, res) => {
  const parsed = TemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Subject and body are required", issues: parsed.error.issues });
  }
  saveFollowUpTemplate(parsed.data);
  res.json({ saved: true, template: parsed.data });
});

// Inspection endpoints (local CRM + scheduled reminders)
app.get("/api/contacts", (_req, res) => res.json(listContacts()));
app.get("/api/reminders", (_req, res) => res.json(listReminders()));

// Testing helper: send all pending follow-ups right now instead of waiting
// for their scheduled time.
app.post("/api/reminders/send-now", async (_req, res) => {
  try {
    const sent = await deliverDueReminders(true);
    res.json({ sent });
  } catch (err) {
    res.status(500).json({
      error: "Failed to send follow-ups",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mockAi: config.mockAi,
    crm: config.hubspotToken ? "hubspot" : "local",
    email: config.gmailUser
      ? "gmail"
      : config.sendgridApiKey
        ? "sendgrid"
        : "dry-run",
    sms: config.twilioAccountSid ? "twilio" : "dry-run",
  }),
);

app.listen(config.port, () => {
  console.log(`Lead capture workflow listening on http://localhost:${config.port}`);
  console.log(`Demo form:      http://localhost:${config.port}/`);
  console.log(`Email editor:   http://localhost:${config.port}/editor.html`);
  startScheduler();
});
