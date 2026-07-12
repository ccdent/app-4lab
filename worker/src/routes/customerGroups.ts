import { Hono } from "hono";
import { asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { clinicCustomerGroup, customerGroup, priceListItem } from "../db/schema";
import { apiError, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

const groupBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  note: z.string().trim().nullish(),
  /** Výchozí skupina — vždy max jedna (nastavení odškrtne ostatní). */
  isDefault: z.boolean().default(false),
});

const app = new Hono<AppContext>();

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
      id: customerGroup.id,
      name: customerGroup.name,
      note: customerGroup.note,
      isDefault: customerGroup.isDefault,
      itemCount: sql<number>`(SELECT COUNT(*) FROM price_list_item WHERE price_list_item.group_id = customer_group.id)`,
    })
    .from(customerGroup)
    .orderBy(asc(customerGroup.name));
  return c.json(rows);
});

app.post("/", async (c) => {
  const body = await parseBody(c, groupBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  const statements = [
    ...(body.isDefault
      ? [db.update(customerGroup).set({ isDefault: false })]
      : []),
    db.insert(customerGroup).values({ id, ...body }),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, groupBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const existing = await db
    .select({ id: customerGroup.id })
    .from(customerGroup)
    .where(eq(customerGroup.id, id))
    .limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Skupina nenalezena.");

  const statements = [
    ...(body.isDefault
      ? [db.update(customerGroup).set({ isDefault: false }).where(ne(customerGroup.id, id))]
      : []),
    db.update(customerGroup).set(body).where(eq(customerGroup.id, id)),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);
  return c.json({ id });
});

/** DELETE — jen pokud ji nepoužívá žádná položka ceníku (pravidlo z crm-mvp). */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const used = await db
    .select({ id: priceListItem.id })
    .from(priceListItem)
    .where(eq(priceListItem.groupId, id))
    .limit(1);
  if (used[0]) {
    return apiError(c, 409, "IN_USE", "Skupinu používají položky ceníku — nelze smazat.");
  }
  // Kaskáda by klinikám tiše vyprázdnila picker položek.
  const usedByClinic = await db
    .select({ clinicId: clinicCustomerGroup.clinicId })
    .from(clinicCustomerGroup)
    .where(eq(clinicCustomerGroup.groupId, id))
    .limit(1);
  if (usedByClinic[0]) {
    return apiError(c, 409, "IN_USE", "Skupinu mají přiřazenou kliniky — nejdřív ji u nich odeber.");
  }

  const res = await db.delete(customerGroup).where(eq(customerGroup.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Skupina nenalezena.");
  return c.body(null, 204);
});

export default app;
