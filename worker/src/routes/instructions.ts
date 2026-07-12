// =============================================================================
// Návody k použití ZP (model 1:1 z crm-mvp).
// Čtení pro všechny (kategorie ceníku zobrazují název návodu), mutace jen
// vedoucí — administrace je v Admin sekci. HTML se ukládá tak, jak přijde
// z Tiptap editoru; sanitizace probíhá při tisku (DOMPurify na klientu).
// =============================================================================

import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { instruction, priceListCategory } from "../db/schema";
import { apiError, parseBody, uuid } from "../lib/http";
import { requireLead, type AppContext } from "../auth";

const instructionBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  htmlContent: z.string().max(200_000, "Obsah návodu je příliš velký.").default(""),
  archived: z.boolean().default(false),
});

const app = new Hono<AppContext>();

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
      id: instruction.id,
      name: instruction.name,
      archived: instruction.archived,
      updatedAt: instruction.updatedAt,
      categoryCount: sql<number>`(SELECT COUNT(*) FROM price_list_category WHERE price_list_category.instruction_id = instruction.id)`,
    })
    .from(instruction)
    .orderBy(asc(instruction.name));
  return c.json(rows);
});

app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(instruction)
    .where(eq(instruction.id, c.req.param("id")))
    .limit(1);
  if (!rows[0]) return apiError(c, 404, "NOT_FOUND", "Návod nenalezen.");
  return c.json(rows[0]);
});

app.post("/", async (c) => {
  const body = await parseBody(c, instructionBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  const now = Date.now();
  await db.insert(instruction).values({ id, ...body, createdAt: now, updatedAt: now });
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, instructionBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db
    .update(instruction)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(instruction.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Návod nenalezen.");
  return c.json({ id });
});

/** Samostatný přepínač archivace — bez read-modify-write celého obsahu. */
app.patch("/:id/archived", async (c) => {
  const body = await parseBody(c, z.object({ archived: z.boolean() }));
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db
    .update(instruction)
    .set({ archived: body.archived, updatedAt: Date.now() })
    .where(eq(instruction.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Návod nenalezen.");
  return c.json({ id });
});

/** DELETE — jen nepřiřazený ke kategorii (jinak archivovat). */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const used = await db
    .select({ id: priceListCategory.id })
    .from(priceListCategory)
    .where(eq(priceListCategory.instructionId, id))
    .limit(1);
  if (used[0]) {
    return apiError(c, 409, "IN_USE", "Návod je přiřazen ke kategorii ceníku — nelze smazat.");
  }

  const res = await db.delete(instruction).where(eq(instruction.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Návod nenalezen.");
  return c.body(null, 204);
});

export default app;
