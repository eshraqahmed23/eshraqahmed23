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
    "Hi! My husband and I are relocating to Austin in August for work. " +
    "We're pre-approved for $650k and looking for a 3-4 bedroom home with a " +
    "yard, ideally in the Round Rock or Cedar Park school districts. " +
    "We'd love to schedule some viewings in the next couple of weeks.",
  source: "website-contact-form",
  extras: { budget: "$650,000", timeline: "next 60 days" },
};

const res = await fetch(`${BASE}/api/leads`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(sampleLead),
});

console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
