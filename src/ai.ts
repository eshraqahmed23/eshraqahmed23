import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "./config.js";
import type { LeadAnalysis, LeadSubmission } from "./types.js";

const LeadAnalysisSchema = z.object({
  summary: z
    .string()
    .describe("2-3 sentence summary of the inquiry for the CRM record"),
  lead_quality: z
    .enum(["hot", "warm", "cold"])
    .describe(
      "hot = ready to transact soon, warm = actively exploring, cold = early research",
    ),
  service_requested: z
    .string()
    .describe("Short label for what the customer wants, e.g. 'kitchen remodel'"),
  key_details: z
    .array(z.string())
    .describe("Bullet points: budget, location, timeline, property details, etc."),
  email: z.object({
    subject: z.string().describe("Personalized email subject line"),
    body: z
      .string()
      .describe(
        "Personalized plain-text email body, warm and specific to their inquiry, signed by the agent",
      ),
  }),
  sms: z
    .string()
    .describe("Personalized text message under 300 characters"),
  follow_up: z.object({
    delay_hours: z
      .number()
      .describe(
        "Hours until the agent should follow up: hot leads 2-4, warm 24-48, cold 72+",
      ),
    reason: z.string().describe("One line telling the agent why/when to follow up"),
  }),
});

function buildSystemPrompt(): string {
  return `You are the lead-intake assistant for ${config.businessName}, a ${config.businessType}. The agent handling leads is ${config.agentName}.

A customer just submitted an inquiry through the website. Analyze it and produce:
- a concise summary for the CRM
- a lead-quality score based on urgency, specificity, and buying signals
- a personalized first-touch email and text message that reference the specifics of their inquiry (never generic boilerplate), written in a warm professional tone, and inviting a next step such as a call or appointment
- a recommended follow-up time for the agent

Do not invent details the customer didn't provide. If information is missing (budget, timeline), the email may naturally ask about it.`;
}

function leadToPrompt(lead: LeadSubmission): string {
  const extras = lead.extras
    ? Object.entries(lead.extras)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "";
  return [
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.source ? `Source: ${lead.source}` : "",
    extras ? `Additional form fields:\n${extras}` : "",
    `Message:\n${lead.message}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Deterministic fallback used when MOCK_AI=true (local dev without an API key). */
function mockAnalysis(lead: LeadSubmission): LeadAnalysis {
  const service = lead.extras?.service ?? "general inquiry";
  const urgency = lead.extras?.urgency ?? "";
  const isUrgent = /emergency|urgent|no heat|no ac|no cooling/i.test(
    `${urgency} ${lead.message}`,
  );
  return {
    summary: `${lead.name} requested ${service}${urgency ? ` (${urgency})` : ""} via ${lead.source ?? "the website"}: ${lead.message.slice(0, 140)}`,
    lead_quality: isUrgent ? "hot" : "warm",
    service_requested: service,
    key_details: [urgency, lead.message.slice(0, 100)].filter(Boolean),
    email: {
      subject: `Thanks for reaching out to ${config.businessName}, ${lead.name.split(" ")[0]}!`,
      body: `Hi ${lead.name.split(" ")[0]},\n\nThanks for contacting ${config.businessName}. I saw your note and would love to help. Do you have time for a quick call this week?\n\nBest,\n${config.agentName}`,
    },
    sms: `Hi ${lead.name.split(" ")[0]}, this is ${config.agentName} from ${config.businessName} — thanks for reaching out! When's a good time for a quick call?`,
    follow_up: { delay_hours: 24, reason: "Standard next-day follow-up (mock mode)" },
  };
}

/**
 * Step 2 of the workflow: Claude reads the inquiry and returns a summary,
 * a lead score, drafted outreach messages, and a follow-up recommendation —
 * all in one structured-output call.
 */
export async function analyzeLead(lead: LeadSubmission): Promise<LeadAnalysis> {
  if (config.mockAi) return mockAnalysis(lead);

  const client = new Anthropic();

  const response = await client.messages.parse({
    model: config.model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: leadToPrompt(lead) }],
    output_config: { format: zodOutputFormat(LeadAnalysisSchema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(
      `AI analysis did not produce a result (stop_reason: ${response.stop_reason})`,
    );
  }
  return response.parsed_output;
}
