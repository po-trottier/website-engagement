import { getStore } from "@netlify/blobs";

const MAX_LENGTH = 200;
const RSVP_DEADLINE = new Date("2026-06-02T00:00:00-07:00");

function sanitize(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_LENGTH);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (new Date() >= RSVP_DEADLINE) {
    return new Response(
      JSON.stringify({ error: "The RSVP deadline has passed." }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const name = sanitize(body.name);
    const email = sanitize(body.email);
    const phone = sanitize(body.phone);
    const attending = body.attending === true;
    const plusOnes = attending ? Math.max(0, Math.min(10, parseInt(body.plusOnes) || 0)) : 0;

    if (!name) {
      return new Response(
        JSON.stringify({ error: "Name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const store = getStore("rsvps");
    const id = crypto.randomUUID();
    const rsvp = {
      id,
      name,
      email,
      phone,
      attending,
      plusOnes,
      createdAt: new Date().toISOString(),
    };

    // Save the RSVP
    await store.setJSON(id, rsvp);

    // Update index with retry for concurrent writes
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let index = [];
        try {
          index = await store.get("_index", { type: "json" });
          if (!Array.isArray(index)) index = [];
        } catch {
          index = [];
        }
        index.push(id);
        await store.setJSON("_index", index);
        break;
      } catch {
        if (attempt === 2) throw new Error("Failed to update index");
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
