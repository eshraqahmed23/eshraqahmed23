import nodemailer from "nodemailer";
import { config } from "./config.js";
import { newId, readJson, writeJson } from "./store.js";

// Reuse one Gmail transport across sends (created lazily on first use).
let gmailTransport: nodemailer.Transporter | null = null;
function getGmailTransport(): nodemailer.Transporter {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: config.gmailUser, pass: config.gmailAppPassword },
    });
  }
  return gmailTransport;
}

interface OutboxEntry {
  id: string;
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  sent: boolean; // false = dry-run (no provider configured)
  at: string;
}

function recordOutbox(entry: Omit<OutboxEntry, "id" | "at">): void {
  const outbox = readJson<OutboxEntry[]>("outbox.json", []);
  outbox.push({ ...entry, id: newId("msg"), at: new Date().toISOString() });
  writeJson("outbox.json", outbox);
}

/**
 * Step 4a: send the personalized email. Prefers Gmail when configured, then
 * SendGrid; otherwise logs the message to data/outbox.json (dry-run).
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<{ sent: boolean; detail: string }> {
  // Preferred: send through the user's own Gmail account.
  if (config.gmailUser && config.gmailAppPassword) {
    await getGmailTransport().sendMail({
      from: `${config.businessName} <${config.gmailUser}>`,
      to,
      subject,
      text: body,
    });
    recordOutbox({ channel: "email", to, subject, body, sent: true });
    return { sent: true, detail: "sent via Gmail" };
  }

  // Fallback: SendGrid, if configured.
  if (!config.sendgridApiKey || !config.fromEmail) {
    console.log(`[dry-run email] to=${to} subject="${subject}"\n${body}\n`);
    recordOutbox({ channel: "email", to, subject, body, sent: false });
    return {
      sent: false,
      detail: "dry-run (set GMAIL_USER/GMAIL_APP_PASSWORD or SENDGRID_API_KEY/FROM_EMAIL)",
    };
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.sendgridApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: config.fromEmail, name: config.businessName },
      subject,
      content: [{ type: "text/plain", value: body }],
    }),
  });
  if (!res.ok) {
    throw new Error(`SendGrid send failed: ${res.status} ${await res.text()}`);
  }
  recordOutbox({ channel: "email", to, subject, body, sent: true });
  return { sent: true, detail: "sent via SendGrid" };
}

/**
 * Step 4b: send the personalized text message. Uses Twilio when configured,
 * otherwise dry-run.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<{ sent: boolean; detail: string }> {
  const { twilioAccountSid, twilioAuthToken, twilioFromNumber } = config;
  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
    console.log(`[dry-run sms] to=${to}\n${body}\n`);
    recordOutbox({ channel: "sms", to, body, sent: false });
    return { sent: false, detail: "dry-run (Twilio credentials not set)" };
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: twilioFromNumber, Body: body }),
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
  recordOutbox({ channel: "sms", to, body, sent: true });
  return { sent: true, detail: "sent via Twilio" };
}
