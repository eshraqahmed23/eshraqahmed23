/**
 * Posts a sample lead to a running server (npm start in another terminal),
 * then prints the workflow result. Usage: npm run demo
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const sampleLead = {
  name: "Sarah Mitchell",
  email: "sarah.mitchell@example.com",
  phone: "+15125550142",
  message:
    "Hi! Our central AC stopped cooling last night and the house is getting " +
    "hot fast — we have a toddler at home. The unit is about 12 years old and " +
    "was making a rattling noise before it quit. We'd love to get someone out " +
    "as soon as possible for a repair or a quote on a replacement.",
  source: "website-signup-form",
  extras: {
    service: "AC repair",
    urgency: "Emergency — no cooling",
    address: "Cedar Park, TX 78613",
  },
};

const res = await fetch(`${BASE}/api/leads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sampleLead),
});

console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
