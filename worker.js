 // Two Stops — Products API
// Bind a D1 database named "DB" and a secret named "ADMIN_KEY" to this Worker.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isAuthed(request, env) {
  const key = request.headers.get("X-Admin-Key") || "";
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}

function genId() {
  return crypto.randomUUID().slice(0, 8);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ---- Public: list products ----
    if (path === "/api/products" && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM products ORDER BY gender, sort_order, created_at"
      ).all();
      return json(results);
    }

    // ---- Admin: login check (used by admin.html to validate the password) ----
    if (path === "/api/login" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const ok = env.ADMIN_KEY && body.password === env.ADMIN_KEY;
      return json({ ok });
    }

    // ---- Admin: create product ----
    if (path === "/api/products" && method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "Unauthorized" }, 401);
      const b = await request.json().catch(() => ({}));
      if (!b.name || !b.gender || !["men", "women"].includes(b.gender)) {
        return json({ error: "name and gender (men/women) are required" }, 400);
      }
      const id = b.id || genId();
      await env.DB.prepare(
        `INSERT INTO products (id, gender, name, description, price_inr, price_idr, icon, image_url, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          id,
          b.gender,
          b.name,
          b.description || "",
          b.price_inr || "",
          b.price_idr || "",
          b.icon || "gem",
          b.image_url || "",
          b.sort_order || 0
        )
        .run();
      return json({ ok: true, id });
    }

    // ---- Admin: update product ----
    const updateMatch = path.match(/^\/api\/products\/([A-Za-z0-9_-]+)$/);
    if (updateMatch && method === "PUT") {
      if (!isAuthed(request, env)) return json({ error: "Unauthorized" }, 401);
      const id = updateMatch[1];
      const b = await request.json().catch(() => ({}));
      await env.DB.prepare(
        `UPDATE products SET gender=?, name=?, description=?, price_inr=?, price_idr=?, icon=?, image_url=?, sort_order=?
         WHERE id=?`
      )
        .bind(
          b.gender,
          b.name,
          b.description || "",
          b.price_inr || "",
          b.price_idr || "",
          b.icon || "gem",
          b.image_url || "",
          b.sort_order || 0,
          id
        )
        .run();
      return json({ ok: true });
    }

    // ---- Admin: delete product ----
    if (updateMatch && method === "DELETE") {
      if (!isAuthed(request, env)) return json({ error: "Unauthorized" }, 401);
      const id = updateMatch[1];
      await env.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run();
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
};
