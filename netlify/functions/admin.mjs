import { getStore } from "@netlify/blobs";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function authenticate(body) {
  const adminPassword = Netlify.env.get("ADMIN_PASSWORD");
  if (!adminPassword || adminPassword.length < 8 || adminPassword === "changeme") {
    return false;
  }
  const input = String(body.password || "");
  if (input.length !== adminPassword.length) return false;
  return timingSafeEqual(Buffer.from(input), Buffer.from(adminPassword));
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    if (!authenticate(body)) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const store = getStore("rsvps");
    const action = body.action || "list";

    // ---------- List ----------
    if (action === "list") {
      let index = [];
      try {
        index = await store.get("_index", { type: "json" });
        if (!Array.isArray(index)) index = [];
      } catch {
        index = [];
      }

      const rsvps = [];
      for (const id of index) {
        try {
          const rsvp = await store.get(id, { type: "json" });
          if (rsvp) rsvps.push(rsvp);
        } catch {
          // Skip missing
        }
      }

      rsvps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const adminEmail = Netlify.env.get("NOTIFICATION_EMAIL") || "";

      return new Response(JSON.stringify({ rsvps, adminEmail }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---------- Update ----------
    if (action === "update") {
      const { id, fields } = body;
      if (!id || !UUID_RE.test(id) || !fields) {
        return new Response(JSON.stringify({ error: "Missing or invalid id/fields" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const rsvp = await store.get(id, { type: "json" });
      if (!rsvp) {
        return new Response(JSON.stringify({ error: "RSVP not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (fields.name !== undefined) rsvp.name = String(fields.name).trim().slice(0, 200);
      if (fields.email !== undefined) rsvp.email = String(fields.email).trim().slice(0, 200);
      if (fields.phone !== undefined) rsvp.phone = String(fields.phone).trim().slice(0, 200);
      if (fields.attending !== undefined) rsvp.attending = fields.attending === true || fields.attending === "true";
      if (fields.plusOnes !== undefined) rsvp.plusOnes = Math.max(0, Math.min(10, parseInt(fields.plusOnes) || 0));

      await store.setJSON(id, rsvp);

      return new Response(JSON.stringify({ success: true, rsvp }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---------- Create ----------
    if (action === "create") {
      const { fields } = body;
      if (!fields || !fields.name) {
        return new Response(JSON.stringify({ error: "Name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const id = crypto.randomUUID();
      const rsvp = {
        id,
        name: String(fields.name).trim().slice(0, 200),
        email: String(fields.email || "").trim().slice(0, 200),
        phone: String(fields.phone || "").trim().slice(0, 200),
        attending: fields.attending === true || fields.attending === "true",
        plusOnes: Math.max(0, Math.min(10, parseInt(fields.plusOnes) || 0)),
        createdAt: new Date().toISOString(),
      };

      await store.setJSON(id, rsvp);

      let index = [];
      try {
        index = await store.get("_index", { type: "json" });
        if (!Array.isArray(index)) index = [];
      } catch {
        index = [];
      }
      index.push(id);
      await store.setJSON("_index", index);

      return new Response(JSON.stringify({ success: true, rsvp }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ---------- Delete ----------
    if (action === "delete") {
      const { id } = body;
      if (!id || !UUID_RE.test(id)) {
        return new Response(JSON.stringify({ error: "Invalid id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await store.delete(id);

      let index = [];
      try {
        index = await store.get("_index", { type: "json" });
        if (!Array.isArray(index)) index = [];
      } catch {
        index = [];
      }
      index = index.filter((i) => i !== id);
      await store.setJSON("_index", index);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
