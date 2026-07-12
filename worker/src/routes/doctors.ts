import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { clinic, doctor, doctorPreference, preferenceOption } from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

const doctorBody = z.object({
  clinicId: z.string().min(1, "Klinika je povinná"),
  titlePrefix: z.string().trim().nullish(),
  firstName: z.string().trim().min(1, "Jméno je povinné"),
  lastName: z.string().trim().min(1, "Příjmení je povinné"),
  email: z.string().trim().toLowerCase().nullish(),
  phone: z.string().trim().nullish(),
  note: z.string().trim().nullish(),
  preferenceOptionIds: z.array(z.string()).default([]),
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

/** LIST — se jménem kliniky; default jen aktivní. */
app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const includeInactive = c.req.query("includeInactive") === "1";

  const rows = await db
    .select({
      id: doctor.id,
      titlePrefix: doctor.titlePrefix,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      email: doctor.email,
      phone: doctor.phone,
      isActive: doctor.isActive,
      clinicId: doctor.clinicId,
      clinicName: clinic.companyName,
      clinicColor: clinic.color,
    })
    .from(doctor)
    .innerJoin(clinic, eq(doctor.clinicId, clinic.id))
    .where(includeInactive ? undefined : eq(doctor.isActive, true))
    .orderBy(asc(doctor.lastName), asc(doctor.firstName));

  return c.json(rows);
});

/** DETAIL — včetně preferencí (chips). */
app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const rows = await db.select().from(doctor).where(eq(doctor.id, id)).limit(1);
  const row = rows[0];
  if (!row) return apiError(c, 404, "NOT_FOUND", "Doktor nenalezen.");

  const prefs = await db
    .select({ optionId: doctorPreference.optionId, label: preferenceOption.label })
    .from(doctorPreference)
    .innerJoin(preferenceOption, eq(doctorPreference.optionId, preferenceOption.id))
    .where(eq(doctorPreference.doctorId, id));

  return c.json({
    ...row,
    preferenceOptionIds: prefs.map((p) => p.optionId),
    preferenceLabels: prefs.map((p) => p.label),
  });
});

/** CREATE */
app.post("/", async (c) => {
  const body = await parseBody(c, doctorBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = uuid();
  const ts = now();
  const { preferenceOptionIds, ...fields } = body;

  const statements = [
    db.insert(doctor).values({ id, ...fields, createdAt: ts, updatedAt: ts }),
    ...preferenceOptionIds.map((optionId) =>
      db.insert(doctorPreference).values({ doctorId: id, optionId }),
    ),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);

  return c.json({ id }, 201);
});

/** UPDATE — preference se přepíší celé (malý číselník, diff netřeba). */
app.put("/:id", async (c) => {
  const body = await parseBody(c, doctorBody.extend({ isActive: z.boolean().default(true) }));
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const existing = await db
    .select({ id: doctor.id })
    .from(doctor)
    .where(eq(doctor.id, id))
    .limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Doktor nenalezen.");

  const { preferenceOptionIds, ...fields } = body;
  const statements = [
    db.update(doctor).set({ ...fields, updatedAt: now() }).where(eq(doctor.id, id)),
    db.delete(doctorPreference).where(eq(doctorPreference.doctorId, id)),
    ...preferenceOptionIds.map((optionId) =>
      db.insert(doctorPreference).values({ doctorId: id, optionId }),
    ),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);

  return c.json({ id });
});

export default app;
