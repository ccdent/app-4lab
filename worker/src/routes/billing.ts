import { Hono } from "hono";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { clinic, doctor, orderItem, orders } from "../db/schema";
import { apiError, now, parseBody } from "../lib/http";
import { requireLead, type AppContext } from "../auth";

// =============================================================================
// Fakturační podklad — měsíční přehled dokončených zakázek po klinikách +
// hromadné označení „vyfakturováno" (is_billed + billed_at). Žádné billing
// batch tabulky (vědomé zjednodušení): podklad se počítá živě, zámek
// vyfakturované zakázky (done ↔ storno only) už vynucuje orders.ts.
// =============================================================================

/**
 * Hranice měsíce v Praze jako unix ms. `YYYY-MM-01T00:00` pražského času
 * je UTC-1h (CET) nebo UTC-2h (CEST) — zkusí oba offsety a vybere ten,
 * který se zpětně formátuje na půlnoc prvního dne.
 */
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
    const ms = baseUtc - offsetH * 3600_000; // pražská půlnoc = UTC − offset
    const formatted = fmt.format(ms).replace(",", "");
    if (formatted.startsWith(`${month}-01 00:00`)) return ms;
  }
  // fallback: UTC půlnoc (odchylka max 2 h na hranici měsíce)
  return baseUtc;
}

function monthRangePrague(month: string): { start: number; end: number } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: pragueMonthStartMs(month), end: pragueMonthStartMs(next) };
}

const app = new Hono<AppContext>();

// Fakturační podklad je admin agenda — celý jen pro vedoucí.
app.use("*", async (c, next) => {
  const err = requireLead(c.get("me"));
  if (err) return apiError(c, 403, err.code, err.message);
  await next();
});

/** Dokončené zakázky v měsíci (dle done_at, Praha) — podklad pro fakturaci. */
app.get("/", async (c) => {
  const month = c.req.query("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return apiError(c, 400, "VALIDATION", "Parametr month musí být YYYY-MM.");
  }
  const { start, end } = monthRangePrague(month);
  const db = drizzle(c.env.DB);

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      patientName: orders.patientName,
      clinicId: orders.clinicId,
      clinicName: clinic.companyName,
      doctorTitlePrefix: doctor.titlePrefix,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      doneAt: orders.doneAt,
      isBilled: orders.isBilled,
      billedAt: orders.billedAt,
      priceAdjustmentAmount: orders.priceAdjustmentAmount,
      priceAdjustmentReason: orders.priceAdjustmentReason,
      shippingPrice: orders.shippingPrice,
      shippingCharged: orders.shippingCharged,
      itemsTotal: sql<number>`(SELECT COALESCE(SUM(unit_price * quantity), 0) FROM order_item WHERE order_item.order_id = orders.id)`,
    })
    .from(orders)
    .innerJoin(clinic, eq(orders.clinicId, clinic.id))
    .innerJoin(doctor, eq(orders.doctorId, doctor.id))
    .where(
      and(
        eq(orders.state, "done"),
        gte(orders.doneAt, start),
        lt(orders.doneAt, end),
      ),
    )
    .orderBy(asc(clinic.companyName), asc(orders.orderNumber));

  // Položky v plném rozsahu (název + lokalizace + cena) — ať je z podkladu
  // zřejmé, CO se fakturuje.
  const itemsByOrder = new Map<string, unknown[]>();
  if (rows.length) {
    const items = await db
      .select({
        orderId: orderItem.orderId,
        name: orderItem.name,
        localization: orderItem.localization,
        quantity: orderItem.quantity,
        unitPrice: orderItem.unitPrice,
      })
      .from(orderItem)
      .where(inArray(orderItem.orderId, rows.map((r) => r.id)))
      .orderBy(asc(orderItem.createdAt));
    for (const i of items) {
      if (!itemsByOrder.has(i.orderId)) itemsByOrder.set(i.orderId, []);
      itemsByOrder.get(i.orderId)!.push({
        name: i.name,
        localization: i.localization,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      });
    }
  }

  return c.json(
    rows.map((r) => ({
      ...r,
      items: itemsByOrder.get(r.id) ?? [],
      billableTotal:
        r.itemsTotal + r.priceAdjustmentAmount + (r.shippingCharged ? r.shippingPrice : 0),
    })),
  );
});

const idsBody = z.object({
  orderIds: z.array(z.string().min(1)).min(1, "Vyber aspoň jednu zakázku").max(500),
});

/** Hromadné označení „vyfakturováno" — jen dokončené a nevyfakturované. */
app.post("/mark", async (c) => {
  const body = await parseBody(c, idsBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);

  const found = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, state: orders.state, isBilled: orders.isBilled })
    .from(orders)
    .where(inArray(orders.id, body.orderIds));
  if (found.length !== body.orderIds.length) {
    return apiError(c, 400, "VALIDATION", "Některá zakázka neexistuje — obnov stránku.");
  }
  const invalid = found.filter((o) => o.state !== "done" || o.isBilled);
  if (invalid.length) {
    return apiError(
      c,
      409,
      "INVALID_STATE",
      `Nelze fakturovat (nejsou dokončené nebo už jsou vyfakturované): ${invalid.map((o) => o.orderNumber).join(", ")}`,
    );
  }

  const ts = now();
  await db
    .update(orders)
    .set({ isBilled: true, billedAt: ts, updatedAt: ts })
    .where(inArray(orders.id, body.orderIds));
  return c.json({ updated: body.orderIds.length });
});

/** Zrušení označení (překlep/oprava) — zakázka se zase odemkne. */
app.post("/unmark", async (c) => {
  const body = await parseBody(c, idsBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);

  const found = await db
    .select({ id: orders.id, orderNumber: orders.orderNumber, isBilled: orders.isBilled })
    .from(orders)
    .where(inArray(orders.id, body.orderIds));
  const invalid = found.filter((o) => !o.isBilled);
  if (found.length !== body.orderIds.length || invalid.length) {
    return apiError(c, 409, "INVALID_STATE", "Některá zakázka není vyfakturovaná — obnov stránku.");
  }

  const ts = now();
  await db
    .update(orders)
    .set({ isBilled: false, billedAt: null, updatedAt: ts })
    .where(inArray(orders.id, body.orderIds));
  return c.json({ updated: body.orderIds.length });
});

export default app;
