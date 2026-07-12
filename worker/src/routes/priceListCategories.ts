import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { instruction, priceListCategory, priceListItem } from "../db/schema";
import { apiError, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

const categoryBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  /** Návod k použití tištěný v prohlášení (null = kategorie bez návodu). */
  instructionId: z.string().nullish().transform((v) => v ?? null),
});

const app = new Hono<AppContext>();

/** 400 pokud návod neexistuje nebo je archivovaný (FK by dal nečitelnou 500). */
async function validateInstruction(
  db: ReturnType<typeof drizzle>,
  instructionId: string | null,
): Promise<string | null> {
  if (!instructionId) return null;
  const rows = await db
    .select({ archived: instruction.archived })
    .from(instruction)
    .where(eq(instruction.id, instructionId))
    .limit(1);
  if (!rows[0]) return "Vybraný návod neexistuje — obnov stránku.";
  if (rows[0].archived) return "Vybraný návod je archivovaný — nejdřív ho aktivuj v Admin → Návody.";
  return null;
}

// Mutace jen s oprávněním (GET zůstává pro všechny).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requirePerm(c.get("me"), "priceListEdit", "úpravy ceníku");
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: priceListCategory.id,
      name: priceListCategory.name,
      instructionId: priceListCategory.instructionId,
      instructionName: instruction.name,
      itemCount: sql<number>`(SELECT COUNT(*) FROM price_list_item WHERE price_list_item.category_id = price_list_category.id)`,
    })
    .from(priceListCategory)
    .leftJoin(instruction, eq(instruction.id, priceListCategory.instructionId))
    .orderBy(asc(priceListCategory.name));
  return c.json(rows);
});

app.post("/", async (c) => {
  const body = await parseBody(c, categoryBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const err = await validateInstruction(db, body.instructionId);
  if (err) return apiError(c, 400, "VALIDATION", err);
  const id = uuid();
  await db.insert(priceListCategory).values({ id, ...body });
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, categoryBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const err = await validateInstruction(db, body.instructionId);
  if (err) return apiError(c, 400, "VALIDATION", err);
  const id = c.req.param("id");
  const res = await db.update(priceListCategory).set(body).where(eq(priceListCategory.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Kategorie nenalezena.");
  return c.json({ id });
});

/** DELETE — jen nepoužitá (pravidlo z crm-mvp price-list-module.md). */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const used = await db
    .select({ id: priceListItem.id })
    .from(priceListItem)
    .where(eq(priceListItem.categoryId, id))
    .limit(1);
  if (used[0]) {
    return apiError(c, 409, "IN_USE", "Kategorii používají položky ceníku — nelze smazat.");
  }

  const res = await db.delete(priceListCategory).where(eq(priceListCategory.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Kategorie nenalezena.");
  return c.body(null, 204);
});

export default app;
