import { Hono } from "hono";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { technician } from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requireLead, type AppContext } from "../auth";
import { syncAccessPolicy, type AccessSyncResult } from "../lib/accessSync";

const technicianBody = z.object({
  email: z.string().trim().toLowerCase().email("Neplatný e-mail"),
  firstName: z.string().trim().min(1, "Jméno je povinné"),
  lastName: z.string().trim().min(1, "Příjmení je povinné"),
  phone: z.string().trim().nullish(),
  role: z.enum(['technician', 'lead']).default('technician'),
  permOrdersViewAll: z.boolean().default(true),
  permOrdersCreateForOthers: z.boolean().default(true),
  permDoctorsEdit: z.boolean().default(true),
  permPriceListEdit: z.boolean().default(true),
  permMaterialsEdit: z.boolean().default(true),
});

/** Access policy = e-maily všech aktivních techniků. */
async function syncAccess(c: { env: Parameters<typeof syncAccessPolicy>[0] }, db: ReturnType<typeof drizzle>): Promise<AccessSyncResult> {
  const rows = await db
    .select({ email: technician.email })
    .from(technician)
    .where(eq(technician.isActive, true));
  return syncAccessPolicy(c.env, rows.map((r) => r.email));
}

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
  const includeInactive = c.req.query("includeInactive") === "1";
  const isLead = c.get("me").role === "lead";
  const rows = await db
    .select({
      id: technician.id,
      email: technician.email,
      firstName: technician.firstName,
      lastName: technician.lastName,
      phone: technician.phone,
      role: technician.role,
      hasPayrollPassword: sql<number>`CASE WHEN payroll_password_hash IS NOT NULL THEN 1 ELSE 0 END`,
      permOrdersViewAll: technician.permOrdersViewAll,
      permOrdersCreateForOthers: technician.permOrdersCreateForOthers,
      permDoctorsEdit: technician.permDoctorsEdit,
      permPriceListEdit: technician.permPriceListEdit,
      permMaterialsEdit: technician.permMaterialsEdit,
      isActive: technician.isActive,
    })
    .from(technician)
    .where(includeInactive ? undefined : eq(technician.isActive, true))
    .orderBy(asc(technician.lastName));
  if (isLead) return c.json(rows);
  // Technikům stačí výběrová data (jméno) — perms a stav hesla jsou admin info.
  return c.json(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: null,
      role: r.role,
      hasPayrollPassword: 0,
      permOrdersViewAll: true,
      permOrdersCreateForOthers: true,
      permDoctorsEdit: true,
      permPriceListEdit: true,
      permMaterialsEdit: true,
      isActive: r.isActive,
    })),
  );
});

app.post("/", async (c) => {
  const body = await parseBody(c, technicianBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  const ts = now();
  try {
    await db.insert(technician).values({ id, ...body, createdAt: ts, updatedAt: ts });
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "EMAIL_TAKEN", "Technik s tímto e-mailem už existuje.");
    }
    throw e;
  }
  const accessSync = await syncAccess(c, db);
  return c.json({ id, accessSync }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(
    c,
    technicianBody.extend({
      isActive: z.boolean(),
      role: z.enum(["technician", "lead"]),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const me = c.get("me");

  // Změnu role smí jen vedoucí (jinak by si ji technik nastavil sám).
  const existing = await db
    .select({ role: technician.role })
    .from(technician)
    .where(eq(technician.id, id))
    .limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Technik nenalezen.");
  if (existing[0].role !== body.role && me.role !== "lead") {
    return apiError(c, 403, "FORBIDDEN", "Roli může měnit jen vedoucí.");
  }
  // Pojistka posledního vedoucího: demote/deaktivace posledního aktivního
  // leada by zamkla správu (a přes Access sync i celou aplikaci).
  if (existing[0].role === "lead" && (body.role !== "lead" || !body.isActive)) {
    const otherLeads = await db
      .select({ n: sql`COUNT(*)` })
      .from(technician)
      .where(
        and(
          eq(technician.role, "lead"),
          eq(technician.isActive, true),
          ne(technician.id, id),
        ),
      );
    if (Number((otherLeads[0] as { n: number } | undefined)?.n ?? 0) === 0) {
      return apiError(c, 409, "LAST_LEAD", "Poslední aktivní vedoucí — nejdřív jmenuj jiného vedoucího.");
    }
  }
  try {
    const res = await db
      .update(technician)
      .set({ ...body, updatedAt: now() })
      .where(eq(technician.id, id));
    if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Technik nenalezen.");
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "EMAIL_TAKEN", "Technik s tímto e-mailem už existuje.");
    }
    throw e;
  }
  const accessSync = await syncAccess(c, db);
  return c.json({ id, accessSync });
});

/** Reset zámku Vyúčtování — technik si pak heslo zvolí znovu. Jen vedoucí. */
app.delete("/:id/payroll-password", async (c) => {
  const db = drizzle(c.env.DB);
  if (c.get("me").role !== "lead") {
    return apiError(c, 403, "FORBIDDEN", "Heslo může smazat jen vedoucí.");
  }
  const res = await db
    .update(technician)
    .set({ payrollPasswordHash: null, updatedAt: now() })
    .where(eq(technician.id, c.req.param("id")));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Technik nenalezen.");
  return c.json({ ok: true });
});

export default app;
