import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { shippingMethod } from "../db/schema";
import { apiError, parseBody, uuid } from "../lib/http";
import { requireLead, type AppContext } from "../auth";

// Číselník způsobů dopravy (jen evidenční — cena se zadává na zakázce).

const bodySchema = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
});

const app = new Hono<AppContext>();

// Mutace jen pro vedoucí (admin sekce); GET zůstává (výběry ve formulářích).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requireLead(c.get("me"));
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: shippingMethod.id,
      name: shippingMethod.name,
      orderCount: sql<number>`(SELECT COUNT(*) FROM orders WHERE orders.shipping_method_id = shipping_method.id)`,
    })
    .from(shippingMethod)
    .where(eq(shippingMethod.isActive, true))
    .orderBy(asc(shippingMethod.name));
  return c.json(rows);
});

app.post("/", async (c) => {
  const body = await parseBody(c, bodySchema);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  await db.insert(shippingMethod).values({ id, name: body.name });
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, bodySchema);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db.update(shippingMethod).set({ name: body.name }).where(eq(shippingMethod.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Záznam nenalezen.");
  return c.json({ id });
});

/** DELETE jen nepoužité; použité by utrhly název z historických zakázek. */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT 1 FROM orders WHERE shipping_method_id = ? LIMIT 1")
    .bind(id)
    .first();
  if (used) {
    return apiError(c, 409, "IN_USE", "Způsob dopravy používají zakázky — nelze smazat.");
  }
  const res = await db.delete(shippingMethod).where(eq(shippingMethod.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Záznam nenalezen.");
  return c.body(null, 204);
});

export default app;
