# Northline Heating & Air — HVAC Website + Lead Follow-Up

A complete **HVAC company website** with an AI-powered lead capture and follow-up
engine behind it. It ships as three parts:

- **`/`** — a real, polished marketing **website** with a free-estimate sign-up form
- **`/dashboard.html`** — a separate internal **lead & follow-up dashboard** for your team
- **A backend workflow** that turns every sign-up into a tracked, followed-up lead

When a customer submits the sign-up form, the workflow:

1. **Captures the lead** — `POST /api/leads` receives the form submission
2. **AI summarizes the inquiry** — Claude reads the message, writes a CRM summary, scores the lead (hot/warm/cold), and extracts key details (system, urgency, location...)
3. **Creates a contact in the CRM** — HubSpot (with the AI summary attached as a note), or a built-in local CRM if you haven't connected one
4. **Sends an instant confirmation email and text** — Claude drafts a first-touch email + SMS that reference the specifics of the inquiry; delivered via Gmail/SendGrid/Twilio
5. **Sends one follow-up a week later** — exactly one automatic follow-up email goes to the customer one week after the confirmation (change the timing with `FOLLOWUP_DAYS`)

```
Website sign-up form ──▶ POST /api/leads ──▶ Claude (summary + score + drafts)
                                               │
                        ┌──────────────────────┼────────────────────┐
                        ▼                       ▼                    ▼
                   CRM contact        instant email + SMS      7-day follow-up
                 (HubSpot/local)         to the customer      email to customer
                        │
                        ▼
              Team dashboard (/dashboard.html) — live pipeline & follow-up status
```

> This is the same generic engine rebranded for an HVAC company via environment
> variables (`BUSINESS_NAME`, `BUSINESS_TYPE`, `AGENT_NAME`, `BUSINESS_PHONE`).
> Change those to run it for any service business.

## Quick start

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY (or set MOCK_AI=true)
npm start
```

Then open **http://localhost:3000** and submit the demo form, or run `npm run demo` in another terminal to post a realistic sample lead.

Everything works out of the box with just an Anthropic API key: without HubSpot/SendGrid/Twilio credentials the workflow uses a local JSON CRM (`data/crm.json`) and logs outgoing messages instead of sending them (`data/outbox.json`), so you can see exactly what the AI drafted before connecting real providers.

## Connecting your website

Point your existing website form (or a Webflow/WordPress/Zapier webhook) at the endpoint:

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sarah Mitchell",
    "email": "sarah@example.com",
    "phone": "+15125550142",
    "message": "Central AC stopped cooling, unit is ~12 years old and rattling.",
    "source": "website-signup-form",
    "extras": { "service": "AC repair", "urgency": "Emergency — no cooling" }
  }'
```

The response includes the AI analysis, the CRM contact, the outreach status, and the scheduled reminder.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Purpose | If unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API access for the AI step | required (or `MOCK_AI=true`) |
| `BUSINESS_NAME`, `BUSINESS_TYPE`, `AGENT_NAME`, `AGENT_EMAIL` | Personalizes AI drafts and reminder delivery | generic defaults |
| `HUBSPOT_ACCESS_TOKEN` | Create contacts + notes in HubSpot | local JSON CRM |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Send real emails through your Gmail | dry-run (logged) |
| `SENDGRID_API_KEY`, `FROM_EMAIL` | Send real emails via SendGrid (alt to Gmail) | dry-run (logged) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Send real SMS | dry-run (logged) |
| `CLAUDE_MODEL` | Model for the AI step | `claude-opus-4-8` |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/leads` | Submit a lead (runs the full workflow) |
| `GET` | `/api/contacts` | List contacts in the local CRM |
| `GET` | `/api/reminders` | List scheduled/sent follow-ups |
| `POST` | `/api/reminders/send-now` | Send all pending follow-ups immediately (for testing) |
| `GET` | `/api/health` | Shows which integrations are active vs dry-run |
| `GET` | `/api/leads.csv` | Download all leads as a spreadsheet (Excel / Google Sheets) |
| `GET`/`POST` | `/api/followup-template` | Read / save the editable follow-up email |
| `GET` | `/` | The HVAC website with the sign-up form |
| `GET` | `/dashboard.html` | Team dashboard — live leads + follow-up status |
| `GET` | `/editor.html` | Editor page where the team writes their follow-up email |

## Leads in a spreadsheet

Two ways to get your leads into a spreadsheet:

**1. Download (no setup).** Open **`/api/leads.csv`** any time to download all leads
as a CSV — double-click to open it in Excel or import into Google Sheets.

**2. Live Google Sheet (real-time).** Every new lead appears as a row in a Google
Sheet automatically. One-time setup:

1. Create a new Google Sheet.
2. In it, go to **Extensions → Apps Script**, delete anything there, and paste:
   ```js
   function doPost(e) {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
     const d = JSON.parse(e.postData.contents);
     sheet.appendRow([d.timestamp, d.name, d.email, d.phone, d.source,
                      d.lead_quality, d.service, d.summary, d.status]);
     return ContentService.createTextOutput("ok");
   }
   ```
3. Click **Deploy → New deployment → Web app**. Set **Execute as: Me** and
   **Who has access: Anyone**, then **Deploy** and copy the web-app URL.
4. Set that URL as the `SHEETS_WEBHOOK_URL` environment variable (in `.env` or in
   Render's Environment tab) and restart.

Now every lead is logged to your Google Sheet in real time — share it with your team.

## Editing the follow-up email

Open **http://localhost:3000/editor.html** to write the follow-up message that
gets sent to every new lead — no code required. Use placeholders like
`{{first_name}}`, `{{service}}`, `{{business}}`, and `{{agent}}` (click them to
insert) and they're replaced with each lead's real details. A live preview shows
how it'll look, and changes take effect immediately (no restart).

## How the AI step works

`src/ai.ts` makes a single structured-output call to Claude (`client.messages.parse` with a Zod schema), so the response is always valid, typed JSON containing:

- `summary` — 2–3 sentences for the CRM record
- `lead_quality` — `hot` / `warm` / `cold`
- `key_details` — extracted budget, location, timeline, etc.
- `email` / `sms` — personalized first-touch messages signed by your agent
- `follow_up.reason` — a short reason shown on the scheduled follow-up

Each lead gets **one** welcome email immediately and **one** follow-up email
one week later (sent once, then never again). Repeat submissions from the same email
address are ignored for `DEDUPE_DAYS` days (default 30), so a lead is never
emailed repeatedly. Follow-ups persist to `data/reminders.json` and survive
restarts; a background loop checks every 30 seconds and sends one when it's due.

## Project layout

```
src/
  index.ts      Express server + lead intake endpoint (step 1)
  ai.ts         Claude structured-output analysis (step 2)
  crm.ts        HubSpot / local CRM adapter (step 3)
  notify.ts     SendGrid email + Twilio SMS adapters (step 4)
  scheduler.ts  Persistent follow-up reminders (step 5)
  workflow.ts   Orchestrates steps 2–5
public/
  index.html      The HVAC marketing website + sign-up form
  dashboard.html  Internal lead & follow-up dashboard (separate page)
  editor.html     Follow-up email template editor
scripts/demo.ts   Posts a sample lead to a running server
```

## Deploying as a real website

The site needs the Node backend running (to send emails and the 7-day
follow-up), so it deploys as a small web service, not a static host.

**Railway (recommended):**

1. Go to **railway.app** and sign in with GitHub.
2. **New Project → Deploy from GitHub repo → `eshraqahmed23/eshraqahmed23`**.
3. In the service **Settings**, set the deploy **Branch** to
   `claude/business-ideas-claude-code-eupmsi`.
4. Under **Settings → Networking**, click **Generate Domain** to get a public URL.
5. It deploys with no secrets (auto demo mode — emails are logged, not sent).

To switch on **real emails + AI**, add these under the service **Variables** tab
and redeploy: `ANTHROPIC_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`
(a 16-char Google App Password). Setting `ANTHROPIC_API_KEY` automatically turns
off demo mode. `PORT` is provided by Railway automatically — don't set it.

`railway.json` pins the start command; the app needs no build step (it runs
TypeScript directly via `tsx`).

Other hosts work too — **Render** (via the included `render.yaml`), Fly, or any
Node host (`npm install && npm start`).

> **Note on GitHub Pages:** Pages only serves static files, so it can't run this
> backend. `docs/index.html` is a separate, browser-only *demo* of the site that
> Pages can host, but the real emailing app must run on Railway/Render.
