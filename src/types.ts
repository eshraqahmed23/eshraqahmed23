/** A raw lead as submitted from a website form. */
export interface LeadSubmission {
  name: string;
  email: string;
  phone?: string;
  message: string;
  /** Where the lead came from, e.g. "website-contact-form", "landing-page" */
  source?: string;
  /** Optional structured extras the form may collect (budget, address, timeline, ...) */
  extras?: Record<string, string>;
}

/** What the AI produces for each lead. */
export interface LeadAnalysis {
  summary: string;
  lead_quality: "hot" | "warm" | "cold";
  service_requested: string;
  key_details: string[];
  email: { subject: string; body: string };
  sms: string;
  follow_up: { delay_hours: number; reason: string };
}

/** A contact record stored in the CRM. */
export interface CrmContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  source?: string;
  lead_quality: string;
  summary: string;
  created_at: string;
  crm: "hubspot" | "local";
}

/** A scheduled follow-up. */
export interface FollowUpReminder {
  id: string;
  contact_id: string;
  lead_name: string;
  lead_email: string;
  service_requested: string;
  due_at: string; // ISO timestamp
  reason: string;
  status: "pending" | "sent" | "failed";
  /** How many times we've tried (and failed) to send this follow-up. */
  attempts?: number;
}

/** Full result of running the workflow for one lead. */
export interface WorkflowResult {
  lead: LeadSubmission;
  analysis: LeadAnalysis;
  contact: CrmContact;
  outreach: {
    email: { sent: boolean; detail: string };
    sms: { sent: boolean; detail: string };
  };
  reminder: FollowUpReminder | null;
  /** True when this lead was skipped because they were already contacted. */
  duplicate: boolean;
}
