import { config } from "./config.js";
import { newId, readJson, writeJson } from "./store.js";

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
 * Step 4a: send the personalized email. Uses SendGrid when configured,
 * otherwise logs the message and records it in data/outbox.json (dry-run).
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<{ sent: boolean; detail: string }> {
  if (!config.sendgridApiKey || !config.fromEmail) {
    console.log(`[dry-run email] to=${to} subject="${subject}"\n${body}\n`);
    recordOutbox({ channel: "email", to, subject, body, sent: false });
    return { sent: false, detail: "dry-run (SENDGRID_API_KEY/FROM_EMAIL not set)" };
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
