import { Hono } from "hono";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { doctorPreference, preferenceOption } from "../db/schema";
import { apiError, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

const optionBody = z.object({
  label: z.string().trim().min(1, "Text je povinný"),
});

const app = new Hono<AppContext>();

// Mutace jen s oprávněním (GET zůstává pro všechny).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requirePerm(c.get("me"), "doctorsEdit", "úpravy adresáře (doktoři/kliniky/preference)");
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: preferenceOption.id,
      label: preferenceOption.label,
      isActive: preferenceOption.isActive,
      usageCount: sql<number>`(SELECT COUNT(*) FROM doctor_preference WHERE doctor_preference.option_id = preference_option.id)`,
    })
    .from(preferenceOption)
    .orderBy(asc(preferenceOption.label));
  return c.json(rows);
});

app.post("/", async (c) => {
  const body = await parseBody(c, optionBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = uuid();
  await db.insert(preferenceOption).values({ id, label: body.label });
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, optionBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db
    .update(preferenceOption)
    .set({ label: body.label })
    .where(eq(preferenceOption.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Možnost nenalezena.");
  return c.json({ id });
});

/** DELETE — jen nepoužitá (vědomé rozhodnutí u doktorů nesmí tiše zmizet). */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const used = await db
    .select({ optionId: doctorPreference.optionId })
    .from(doctorPreference)
    .where(eq(doctorPreference.optionId, id))
    .limit(1);
  if (used[0]) {
    return apiError(
      c,
      409,
      "IN_USE",
      "Možnost je přiřazená doktorům — nejdřív ji odeber z jejich preferencí.",
    );
  }

  const res = await db.delete(preferenceOption).where(eq(preferenceOption.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Možnost nenalezena.");
  return c.body(null, 204);
});

export default app;
