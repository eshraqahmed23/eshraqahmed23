import { config } from "./config.js";
import { newId, readJson, writeJson } from "./store.js";
import type { CrmContact, LeadAnalysis, LeadSubmission } from "./types.js";

/**
 * Step 3 of the workflow: create a contact in the CRM.
 * Uses HubSpot when HUBSPOT_ACCESS_TOKEN is set; otherwise falls back to a
 * local JSON CRM at data/crm.json so the workflow runs out of the box.
 */
export async function createContact(
  lead: LeadSubmission,
  analysis: LeadAnalysis,
): Promise<CrmContact> {
  if (config.hubspotToken) {
    return createHubspotContact(lead, analysis);
  }
  return createLocalContact(lead, analysis);
}

async function createHubspotContact(
  lead: LeadSubmission,
  analysis: LeadAnalysis,
): Promise<CrmContact> {
  const [firstname, ...rest] = lead.name.trim().split(/\s+/);
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.hubspotToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        firstname,
        lastname: rest.join(" "),
        email: lead.email,
        phone: lead.phone ?? "",
        hs_lead_status: "NEW",
        lifecyclestage: "lead",
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`HubSpot contact creation failed: ${res.status} ${await res.text()}`);
  }
  const created = (await res.json()) as { id: string };

  // Attach the AI summary as a note on the contact
  await fetch("https://api.hubapi.com/crm/v3/objects/notes", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.hubspotToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: [
          `AI lead summary (${analysis.lead_quality.toUpperCase()}):`,
          analysis.summary,
          "",
          ...analysis.key_details.map((d) => `• ${d}`),
        ].join("\n"),
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        {
          to: { id: created.id },
          types: [
            { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 },
          ],
        },
      ],
    }),
  });

  return {
    id: created.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    lead_quality: analysis.lead_quality,
    summary: analysis.summary,
    created_at: new Date().toISOString(),
    crm: "hubspot",
  };
}

function createLocalContact(
  lead: LeadSubmission,
  analysis: LeadAnalysis,
): CrmContact {
  const contacts = readJson<CrmContact[]>("crm.json", []);
  const contact: CrmContact = {
    id: newId("contact"),
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    lead_quality: analysis.lead_quality,
    summary: analysis.summary,
    created_at: new Date().toISOString(),
    crm: "local",
  };
  contacts.push(contact);
  writeJson("crm.json", contacts);
  return contact;
}

export function listContacts(): CrmContact[] {
  return readJson<CrmContact[]>("crm.json", []);
}
