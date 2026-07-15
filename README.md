# AI Lead Capture & Follow-Up Workflow

An AI-powered lead intake pipeline for **real estate agents, contractors, and homebuilders**. When a customer submits your website form, the workflow:

1. **Captures the lead** — `POST /api/leads` receives the form submission
2. **AI summarizes the inquiry** — Claude reads the message, writes a CRM summary, scores the lead (hot/warm/cold), and extracts key details (budget, timeline, location...)
3. **Creates a contact in the CRM** — HubSpot (with the AI summary attached as a note), or a built-in local CRM if you haven't connected one
4. **Sends a personalized email and text** — Claude drafts a first-touch email + SMS that reference the specifics of the inquiry; delivered via SendGrid/Twilio
5. **Schedules a follow-up reminder** — at the time the AI recommends (hot leads within hours, cold leads in a few days), the agent gets a reminder email

```
Website form ──▶ POST /api/leads ──▶ Claude (summary + score + drafts)
                                        │
                        ┌───────────────┼────────────────┐
                        ▼               ▼                ▼
                   CRM contact    email + SMS to    follow-up reminder
                 (HubSpot/local)     the lead        (emailed to agent)
```

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
    "message": "Looking for a 3BR home in Austin under $650k, moving in August.",
    "source": "website-contact-form"
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
| `GET`/`POST` | `/api/followup-template` | Read / save the editable follow-up email |
| `GET` | `/` | Demo lead-capture form |
| `GET` | `/editor.html` | Editor page where the agent writes their follow-up email |

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
- `follow_up.delay_hours` — recommended follow-up timing with a reason

Each lead gets **one** welcome email and **one** follow-up (sent once at the
scheduled time, then never again). Repeat submissions from the same email
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
public/         Demo lead-capture form
scripts/demo.ts Posts a sample lead to a running server
```
