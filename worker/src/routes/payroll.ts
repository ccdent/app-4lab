import { Hono } from "hono";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { orderItem, orders, technician, type OrderState } from "../db/schema";
import { apiError, now, parseBody } from "../lib/http";
import type { AppContext } from "../auth";

// =============================================================================
// Vyúčtování (Odmakáno z crm-full) — podíl technika z obratu.
// NENÍ to mzdový systém: podíl = order_item.technician_fee × quantity
// (snapshot z ceníku), jen fee > 0, zakázka není storno, přiřazený technik.
//  - Aktuální měsíc = PŘEDPOKLAD: dokončené (done_at v měsíci) + rozpracované
//    (otevřené stavy bez date filtru).
//  - Výkaz za období = jen done + VYFAKTUROVANÉ (pojistka), done_at v měsíci.
// Role: technik vidí jen sebe, vedoucí všechny. Každé zobrazení vyžaduje
// heslo (salt:sha256) — vědomě ŽÁDNÁ session, jen zámek proti pohledu
// přes rameno, ne security.
// =============================================================================

type Db = ReturnType<typeof drizzle>;

const OPEN_STATES: OrderState[] = ["new", "accepted", "in_progress", "try_in"];

/* ---------------- Heslo (WebCrypto SHA-256, salt:hash hex) ---------------- */

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...saltBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${await sha256Hex(salt + password)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return (await sha256Hex(salt + password)) === hash;
}

/* ---------------- Měsíční rozsah (Praha) ---------------------------------- */

function pragueMonthStartMs(month: string): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const baseUtc = Date.parse(`${month}-01T00:00:00Z`);
  for (const offsetH of [1, 2]) {
    const ms = baseUtc - offsetH * 3600_000;
    if (fmt.format(ms).replace(",", "").startsWith(`${month}-01 00:00`)) return ms;
  }
  return baseUtc;
}

function monthRangePrague(month: string): { start: number; end: number } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: pragueMonthStartMs(month), end: pragueMonthStartMs(next) };
}

function currentMonthPrague(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

/* ---------------- Výpočty -------------------------------------------------- */

/** Podíl řádku: SUM(fee × qty) jen pro fee > 0, qty > 0. */
const SHARE_SQL = sql<number>`COALESCE(SUM(CASE WHEN order_item.technician_fee > 0 AND order_item.quantity > 0 THEN order_item.technician_fee * order_item.quantity ELSE 0 END), 0)`;

async function currentEstimate(db: Db, technicianIds: string[]) {
  const month = currentMonthPrague();
  const { start, end } = monthRangePrague(month);

  const doneRows = await db
    .select({ technicianId: orders.assignedTechnicianId, share: SHARE_SQL })
    .from(orders)
    .innerJoin(orderItem, eq(orderItem.orderId, orders.id))
    .where(
      and(
        inArray(orders.assignedTechnicianId, technicianIds),
        eq(orders.state, "done"),
        gte(orders.doneAt, start),
        lt(orders.doneAt, end),
      ),
    )
    .groupBy(orders.assignedTechnicianId);

  const openRows = await db
    .select({ technicianId: orders.assignedTechnicianId, share: SHARE_SQL })
    .from(orders)
    .innerJoin(orderItem, eq(orderItem.orderId, orders.id))
    .where(
      and(
        inArray(orders.assignedTechnicianId, technicianIds),
        inArray(orders.state, OPEN_STATES),
      ),
    )
    .groupBy(orders.assignedTechnicianId);

  const done = new Map(doneRows.map((r) => [r.technicianId, r.share]));
  const open = new Map(openRows.map((r) => [r.technicianId, r.share]));
  return { done, open, month };
}

async function periodReport(db: Db, technicianIds: string[], month: string) {
  const { start, end } = monthRangePrague(month);
  // Pojistka: jen done + vyfakturované (uzavřená čísla, retroaktivně neměnná).
  const rows = await db
    .select({
      technicianId: orders.assignedTechnicianId,
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      patientName: orders.patientName,
      doneAt: orders.doneAt,
      share: SHARE_SQL,
    })
    .from(orders)
    .innerJoin(orderItem, eq(orderItem.orderId, orders.id))
    .where(
      and(
        inArray(orders.assignedTechnicianId, technicianIds),
        eq(orders.state, "done"),
        eq(orders.isBilled, true),
        gte(orders.doneAt, start),
        lt(orders.doneAt, end),
      ),
    )
    .groupBy(orders.id)
    .orderBy(asc(orders.orderNumber));
  return rows;
}

/* ---------------- Routes --------------------------------------------------- */

const app = new Hono<AppContext>();

/** Stav zámku pro aktuálního uživatele (má nastavené heslo?). */
app.get("/status", async (c) => {
  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const rows = await db
    .select({ hash: technician.payrollPasswordHash })
    .from(technician)
    .where(eq(technician.id, me.id))
    .limit(1);
  // Demo: sdílená identita nemůže mít osobní heslo — brána je průchozí.
  if (c.env.DEMO_MODE === "1") return c.json({ hasPassword: true, role: me.role });
  return c.json({ hasPassword: Boolean(rows[0]?.hash), role: me.role });
});

/** První nastavení hesla — jde jen když žádné není (reset dělá vedoucí). */
app.post("/password", async (c) => {
  const body = await parseBody(
    c,
    z.object({ password: z.string().min(4, "Heslo musí mít aspoň 4 znaky").max(72) }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const me = c.get("me");

  const rows = await db
    .select({ hash: technician.payrollPasswordHash })
    .from(technician)
    .where(eq(technician.id, me.id))
    .limit(1);
  if (rows[0]?.hash) {
    return apiError(c, 409, "PASSWORD_SET", "Heslo už je nastavené. Reset ti udělá vedoucí.");
  }
  await db
    .update(technician)
    .set({ payrollPasswordHash: await hashPassword(body.password), updatedAt: now() })
    .where(eq(technician.id, me.id));
  return c.json({ ok: true });
});

/** Zobrazení podílů — VŽDY s heslem (žádná session, vědomě). */
app.post("/view", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      password: z.string().min(1, "Zadej heslo"),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Měsíc musí být YYYY-MM"),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const me = c.get("me");

  const meRow = await db
    .select({ hash: technician.payrollPasswordHash })
    .from(technician)
    .where(eq(technician.id, me.id))
    .limit(1);
  // Demo: heslo se neověřuje (sdílená identita, žádná citlivá data).
  if (c.env.DEMO_MODE !== "1") {
    if (!meRow[0]?.hash) {
      return apiError(c, 409, "PASSWORD_NOT_SET", "Nejdřív si nastav heslo pro Vyúčtování.");
    }
    if (!(await verifyPassword(body.password, meRow[0].hash))) {
      return apiError(c, 403, "WRONG_PASSWORD", "Nesprávné heslo.");
    }
  }

  // Technik vidí jen sebe (server-side, žádný parametr z klienta);
  // vedoucí všechny aktivní techniky.
  const techs =
    me.role === "lead"
      ? await db
          .select({ id: technician.id, firstName: technician.firstName, lastName: technician.lastName })
          .from(technician)
          .where(eq(technician.isActive, true))
          .orderBy(asc(technician.lastName))
      : await db
          .select({ id: technician.id, firstName: technician.firstName, lastName: technician.lastName })
          .from(technician)
          .where(eq(technician.id, me.id));
  const ids = techs.map((t) => t.id);
  if (ids.length === 0) return c.json({ role: me.role, currentMonth: currentMonthPrague(), technicians: [] });

  const [estimate, period] = await Promise.all([
    currentEstimate(db, ids),
    periodReport(db, ids, body.month),
  ]);

  const periodByTech = new Map<string, typeof period>();
  for (const r of period) {
    if (!r.technicianId) continue;
    if (!periodByTech.has(r.technicianId)) periodByTech.set(r.technicianId, []);
    periodByTech.get(r.technicianId)!.push(r);
  }

  return c.json({
    role: me.role,
    currentMonth: estimate.month,
    technicians: techs.map((t) => {
      const done = estimate.done.get(t.id) ?? 0;
      const open = estimate.open.get(t.id) ?? 0;
      const orderRows = periodByTech.get(t.id) ?? [];
      return {
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        current: { done, open, total: done + open },
        period: {
          total: orderRows.reduce((s, r) => s + r.share, 0),
          orders: orderRows.map((r) => ({
            orderNumber: r.orderNumber,
            patientName: r.patientName,
            doneAt: r.doneAt,
            share: r.share,
          })),
        },
      };
    }),
  });
});

export default app;
