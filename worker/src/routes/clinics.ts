import { Hono } from "hono";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { clinic, clinicCustomerGroup } from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

const clinicBody = z.object({
  companyName: z.string().trim().min(1, "Název je povinný"),
  street: z.string().trim().default(""),
  city: z.string().trim().default(""),
  zip: z.string().trim().default(""),
  ico: z.string().trim().default(""),
  dic: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().toLowerCase().nullish(),
  contactPersonName: z.string().trim().nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Barva musí být hex").default("#4FB6B2"),
  note: z.string().trim().nullish(),
  groupIds: z.array(z.string()).default([]),
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

/** LIST — s počtem doktorů; default jen aktivní. */
app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const includeInactive = c.req.query("includeInactive") === "1";

  const rows = await db
    .select({
      id: clinic.id,
      companyName: clinic.companyName,
      city: clinic.city,
      ico: clinic.ico,
      phone: clinic.phone,
      email: clinic.email,
      color: clinic.color,
      isActive: clinic.isActive,
      doctorCount: sql<number>`(SELECT COUNT(*) FROM doctor WHERE doctor.clinic_id = clinic.id)`,
    })
    .from(clinic)
    .where(includeInactive ? undefined : eq(clinic.isActive, true))
    .orderBy(asc(clinic.companyName));

  return c.json(rows);
});

/** DETAIL — včetně přiřazených skupin ceníku. */
app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const rows = await db.select().from(clinic).where(eq(clinic.id, id)).limit(1);
  const row = rows[0];
  if (!row) return apiError(c, 404, "NOT_FOUND", "Klinika nenalezena.");

  const groups = await db
    .select({ groupId: clinicCustomerGroup.groupId })
    .from(clinicCustomerGroup)
    .where(eq(clinicCustomerGroup.clinicId, id));

  return c.json({ ...row, groupIds: groups.map((g) => g.groupId) });
});

/** CREATE */
app.post("/", async (c) => {
  const body = await parseBody(c, clinicBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = uuid();
  const ts = now();
  const { groupIds, ...fields } = body;

  const statements = [
    db.insert(clinic).values({ id, ...fields, createdAt: ts, updatedAt: ts }),
    ...groupIds.map((groupId) =>
      db.insert(clinicCustomerGroup).values({ clinicId: id, groupId }),
    ),
  ];
  // D1 nemá interaktivní transakce — atomicita přes batch.
  await db.batch(statements as [typeof statements[0], ...typeof statements]);

  return c.json({ id }, 201);
});

/** UPDATE (vč. isActive a diff skupin) */
app.put("/:id", async (c) => {
  const body = await parseBody(c, clinicBody.extend({ isActive: z.boolean().default(true) }));
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const existing = await db
    .select({ id: clinic.id })
    .from(clinic)
    .where(eq(clinic.id, id))
    .limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Klinika nenalezena.");

  const current = await db
    .select({ groupId: clinicCustomerGroup.groupId })
    .from(clinicCustomerGroup)
    .where(eq(clinicCustomerGroup.clinicId, id));
  const currentIds = new Set(current.map((g) => g.groupId));
  const nextIds = new Set(body.groupIds);
  const toAdd = body.groupIds.filter((g) => !currentIds.has(g));
  const toRemove = [...currentIds].filter((g) => !nextIds.has(g));

  const { groupIds: _groupIds, ...fields } = body;
  const statements = [
    db.update(clinic).set({ ...fields, updatedAt: now() }).where(eq(clinic.id, id)),
    ...toAdd.map((groupId) =>
      db.insert(clinicCustomerGroup).values({ clinicId: id, groupId }),
    ),
    ...(toRemove.length
      ? [
          db
            .delete(clinicCustomerGroup)
            .where(
              and(
                eq(clinicCustomerGroup.clinicId, id),
                inArray(clinicCustomerGroup.groupId, toRemove),
              ),
            ),
        ]
      : []),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);

  return c.json({ id });
});

export default app;
