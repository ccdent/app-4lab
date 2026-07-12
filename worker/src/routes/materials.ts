import { Hono, type Context, type Next } from "hono";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { manufacturer, materialCatalog, stockItem } from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

// =============================================================================
// Materiály — výrobci, katalog (PREFIX-NNNN), sklad šarží (short_code).
// Model 1:1 z crm-full (material-tracking-mvp.md). Bez mazání — jen deaktivace
// / lifecycle stavy; auditní pravda o použití je v order_material_usage.
// =============================================================================

type Db = ReturnType<typeof drizzle>;

/** Abeceda short_code — bez I/L/O/0/1 (záměna při čtení štítku). */
const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SHORT_CODE_LENGTH = 4;
/** Sdílený sentinel pro jednorázové šarže (nezabírá prostor unikátních kódů). */
export const ONE_TIME_SHORT_CODE = "XXXX";

export function normalizeShortCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase().slice(0, SHORT_CODE_LENGTH + 1);
}

function randomShortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHORT_CODE_LENGTH));
  let out = "";
  for (const b of bytes) out += SHORT_CODE_ALPHABET[b % SHORT_CODE_ALPHABET.length];
  return out;
}

/** Kalendářní validita ISO datumu (regex pustí i 2026-99-99). */
export function isValidISODate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Dnešní datum v Praze (expirace se porovnává lokálně, ne UTC). */
export function todayPrague(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

/** Dostupná šarže = active/used a neexpirovaná (used ≠ nedostupná!). */
export function isStockAvailable(row: { status: string; expirationDate: string }): boolean {
  return (
    (row.status === "active" || row.status === "used") && row.expirationDate >= todayPrague()
  );
}

/**
 * Založení skladové položky — jediná legální cesta (generuje short_code
 * s retry na UNIQUE kolizi; one_time dostává sentinel XXXX).
 */
export async function createStockItemRow(
  db: Db,
  input: {
    materialCatalogId: string;
    lotNumber: string;
    expirationDate: string;
    consumptionMode: "reusable_lot" | "one_time";
    status?: "active" | "consumed";
    firstUsedAt?: number | null;
  },
): Promise<{ id: string; shortCode: string }> {
  const id = uuid();
  const base = {
    id,
    materialCatalogId: input.materialCatalogId,
    lotNumber: input.lotNumber,
    expirationDate: input.expirationDate,
    receivedAt: now(),
    status: input.status ?? "active",
    consumptionMode: input.consumptionMode,
    firstUsedAt: input.firstUsedAt ?? null,
  } as const;

  if (input.consumptionMode === "one_time") {
    // Sentinel není unikátní — partial unique v crm-full; tady prostý insert,
    // unique index na short_code v D1 neexistuje pro XXXX? Existuje (unique) —
    // proto one_time kód doplňujeme o sufix id, viditelně ale řešíme jako XXXX.
    await db.insert(stockItem).values({ ...base, shortCode: `${ONE_TIME_SHORT_CODE}-${id.slice(0, 8)}` });
    return { id, shortCode: ONE_TIME_SHORT_CODE };
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const shortCode = randomShortCode();
    try {
      await db.insert(stockItem).values({ ...base, shortCode });
      return { id, shortCode };
    } catch (e) {
      if (e instanceof Error && e.message.includes("UNIQUE") && e.message.includes("short_code")) {
        continue; // kolize kódu → nový pokus
      }
      throw e;
    }
  }
  throw new Error("SHORT_CODE_EXHAUSTED: nepodařilo se vygenerovat unikátní kód");
}

const app = new Hono<AppContext>();

// Mutace jen s oprávněním (GET zůstává pro všechny).
// POZOR: router je mountnutý na "/" — wildcard "*" by v Hono prosákl na
// VŠECHNY routery registrované po něm (payroll, orderMaterials…). Guard
// proto míří jen na vlastní cesty tohoto routeru.
const materialsGuard = async (c: Context<AppContext>, next: Next) => {
  if (c.req.method !== "GET") {
    // Naskladnění nové šarže NENÍ editace — smí každý technik (potřebuje ho
    // i zápis materiálu na zakázku). Oprávnění chrání úpravy/mazání/statusy,
    // katalog, výrobce a recepty — tam se dá nadělat škoda.
    const isStockCreate =
      c.req.method === "POST" && c.req.path.replace(/^\/api/, "") === "/stock-items";
    if (!isStockCreate) {
      const err = requirePerm(c.get("me"), "materialsEdit", "úpravy materiálů");
      if (err) return apiError(c, 403, err.code, err.message);
    }
  }
  await next();
};
app.use("/manufacturers", materialsGuard);
app.use("/manufacturers/*", materialsGuard);
app.use("/material-catalog", materialsGuard);
app.use("/material-catalog/*", materialsGuard);
app.use("/stock-items", materialsGuard);
app.use("/stock-items/*", materialsGuard);

/* ------------------------------------------------------------------ */
/*  Výrobci                                                             */
/* ------------------------------------------------------------------ */

const manufacturerBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "Prefix: 2–10 velkých písmen/číslic"),
  isActive: z.boolean().default(true),
});

app.get("/manufacturers", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: manufacturer.id,
      name: manufacturer.name,
      codePrefix: manufacturer.codePrefix,
      isActive: manufacturer.isActive,
      catalogCount: sql<number>`(SELECT COUNT(*) FROM material_catalog WHERE material_catalog.manufacturer_id = manufacturer.id)`,
    })
    .from(manufacturer)
    .orderBy(asc(manufacturer.name));
  return c.json(rows);
});

app.post("/manufacturers", async (c) => {
  const body = await parseBody(c, manufacturerBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  try {
    await db.insert(manufacturer).values({ id, ...body });
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "PREFIX_TAKEN", `Prefix „${body.codePrefix}" už používá jiný výrobce.`);
    }
    throw e;
  }
  return c.json({ id }, 201);
});

app.put("/manufacturers/:id", async (c) => {
  // Prefix je neměnný — vygenerované kódy katalogu ho nesou navždy.
  const body = await parseBody(
    c,
    z.object({ name: z.string().trim().min(1, "Název je povinný"), isActive: z.boolean().default(true) }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db.update(manufacturer).set(body).where(eq(manufacturer.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Výrobce nenalezen.");
  return c.json({ id });
});

/* ------------------------------------------------------------------ */
/*  Katalog materiálů                                                   */
/* ------------------------------------------------------------------ */

const catalogBody = z.object({
  manufacturerId: z.string().min(1, "Výrobce je povinný"),
  canonicalName: z.string().trim().min(1, "Název je povinný"),
  isOrderUsageEligible: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

/** `PREFIX-NNNN` — sekvence per výrobce (MAX+1, retry na UNIQUE kolizi). */
async function nextCatalogCode(db: Db, prefix: string): Promise<string> {
  const last = await db
    .select({
      maxSeq: sql<number | null>`MAX(CAST(substr(code, ${prefix.length + 2}) AS INTEGER))`,
    })
    .from(materialCatalog)
    .where(like(materialCatalog.code, `${prefix}-%`));
  return `${prefix}-${String((last[0]?.maxSeq ?? 0) + 1).padStart(4, "0")}`;
}

app.get("/material-catalog", async (c) => {
  const db = drizzle(c.env.DB);
  const includeInactive = c.req.query("includeInactive") === "1";
  const eligibleOnly = c.req.query("eligibleOnly") === "1";
  const today = todayPrague();

  const rows = await db
    .select({
      id: materialCatalog.id,
      code: materialCatalog.code,
      canonicalName: materialCatalog.canonicalName,
      manufacturerId: materialCatalog.manufacturerId,
      manufacturerName: manufacturer.name,
      isOrderUsageEligible: materialCatalog.isOrderUsageEligible,
      isActive: materialCatalog.isActive,
      /** Počet dostupných šarží (active/used, neexpirované). */
      activeLotCount: sql<number>`(SELECT COUNT(*) FROM stock_item WHERE stock_item.material_catalog_id = material_catalog.id AND stock_item.status IN ('active','used') AND stock_item.expiration_date >= ${today})`,
    })
    .from(materialCatalog)
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .where(
      and(
        includeInactive ? undefined : eq(materialCatalog.isActive, true),
        eligibleOnly ? eq(materialCatalog.isOrderUsageEligible, true) : undefined,
      ),
    )
    .orderBy(asc(materialCatalog.code));
  return c.json(rows);
});

app.post("/material-catalog", async (c) => {
  const body = await parseBody(c, catalogBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);

  const mfr = await db
    .select({ codePrefix: manufacturer.codePrefix })
    .from(manufacturer)
    .where(eq(manufacturer.id, body.manufacturerId))
    .limit(1);
  if (!mfr[0]) return apiError(c, 400, "VALIDATION", "Výrobce neexistuje.");

  const id = uuid();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await nextCatalogCode(db, mfr[0].codePrefix);
    try {
      await db.insert(materialCatalog).values({ id, code, ...body, createdAt: now() });
      return c.json({ id, code }, 201);
    } catch (e) {
      if (e instanceof Error && e.message.includes("UNIQUE")) continue;
      throw e;
    }
  }
  return apiError(c, 409, "CODE_RACE", "Nepodařilo se přidělit kód, zkus znovu.");
});

app.put("/material-catalog/:id", async (c) => {
  // Kód i výrobce jsou neměnné (kód nese prefix výrobce).
  const body = await parseBody(
    c,
    z.object({
      canonicalName: z.string().trim().min(1, "Název je povinný"),
      isOrderUsageEligible: z.boolean().default(true),
      isActive: z.boolean().default(true),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db.update(materialCatalog).set(body).where(eq(materialCatalog.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Položka nenalezena.");
  return c.json({ id });
});

/** Dostupné šarže materiálu — FEFO: active před used, nejbližší expirace. */
app.get("/material-catalog/:id/lots", async (c) => {
  const db = drizzle(c.env.DB);
  const catalogId = c.req.param("id");
  const today = todayPrague();
  const rows = await db
    .select({
      stockItemId: stockItem.id,
      shortCode: stockItem.shortCode,
      lotNumber: stockItem.lotNumber,
      expirationDate: stockItem.expirationDate,
      status: stockItem.status,
      consumptionMode: stockItem.consumptionMode,
      firstUsedAt: stockItem.firstUsedAt,
      receivedAt: stockItem.receivedAt,
    })
    .from(stockItem)
    .where(
      and(
        eq(stockItem.materialCatalogId, catalogId),
        inArray(stockItem.status, ["active", "used"]),
        sql`${stockItem.expirationDate} >= ${today}`,
        eq(stockItem.consumptionMode, "reusable_lot"),
      ),
    )
    .orderBy(
      sql`CASE ${stockItem.status} WHEN 'active' THEN 0 ELSE 1 END`,
      asc(stockItem.expirationDate),
      asc(stockItem.lotNumber),
      asc(stockItem.receivedAt),
    );
  return c.json(rows);
});

/* ------------------------------------------------------------------ */
/*  Sklad šarží                                                         */
/* ------------------------------------------------------------------ */

app.get("/stock-items", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: stockItem.id,
      shortCode: stockItem.shortCode,
      lotNumber: stockItem.lotNumber,
      expirationDate: stockItem.expirationDate,
      status: stockItem.status,
      consumptionMode: stockItem.consumptionMode,
      receivedAt: stockItem.receivedAt,
      firstUsedAt: stockItem.firstUsedAt,
      materialCatalogId: stockItem.materialCatalogId,
      materialCode: materialCatalog.code,
      canonicalName: materialCatalog.canonicalName,
      manufacturerName: manufacturer.name,
    })
    .from(stockItem)
    .innerJoin(materialCatalog, eq(stockItem.materialCatalogId, materialCatalog.id))
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .orderBy(desc(stockItem.receivedAt));
  return c.json(rows);
});

const stockBody = z.object({
  materialCatalogId: z.string().min(1, "Materiál je povinný"),
  lotNumber: z.string().trim().min(1, "Šarže (LOT) je povinná"),
  expirationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expirace musí být ISO datum")
    .refine(isValidISODate, "Neplatné datum expirace"),
});

/** Ruční naskladnění — vždy reusable_lot (one_time vzniká jen ze zakázky). */
app.post("/stock-items", async (c) => {
  const body = await parseBody(c, stockBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);

  const cat = await db
    .select({ isActive: materialCatalog.isActive })
    .from(materialCatalog)
    .where(eq(materialCatalog.id, body.materialCatalogId))
    .limit(1);
  if (!cat[0]) return apiError(c, 400, "VALIDATION", "Materiál v katalogu neexistuje.");
  if (!cat[0].isActive) return apiError(c, 400, "VALIDATION", "Materiál je deaktivovaný.");

  const created = await createStockItemRow(db, { ...body, consumptionMode: "reusable_lot" });
  return c.json(created, 201);
});

/** Editace metadat šarže (LOT + expirace); kód/status/režim neměnné tudy. */
app.put("/stock-items/:id", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      lotNumber: z.string().trim().min(1, "Šarže (LOT) je povinná"),
      expirationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isValidISODate, "Neplatné datum expirace"),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  // Jednorázová sentinel šarže existuje jen jako artefakt použití —
  // editace by rozjela skladový řádek proti neměnnému auditnímu snapshotu.
  const existing = await db
    .select({ consumptionMode: stockItem.consumptionMode })
    .from(stockItem)
    .where(eq(stockItem.id, id))
    .limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Šarže nenalezena.");
  if (existing[0].consumptionMode === "one_time") {
    return apiError(c, 409, "ONE_TIME_LOCKED", "Jednorázovou šarži nelze upravovat.");
  }
  await db.update(stockItem).set(body).where(eq(stockItem.id, id));
  return c.json({ id });
});

/** Admin override statusu (obchází workflow — v UI se žlutým varováním). */
app.post("/stock-items/:id/status", async (c) => {
  const body = await parseBody(
    c,
    z.object({ status: z.enum(["active", "used", "consumed", "discarded"]) }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db.update(stockItem).set({ status: body.status }).where(eq(stockItem.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Šarže nenalezena.");
  return c.json({ id });
});

/** Historie použití šarže na zakázkách (inspektor ze skladu). */
app.get("/stock-items/:id/usages", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.display_name AS displayName, u.manufacturer_name AS manufacturerName,
            u.lot_number AS lotNumber, u.expiration_date AS expirationDate,
            u.source_type AS sourceType, u.used_at AS usedAt,
            o.order_number AS orderNumber,
            t.first_name AS usedByFirstName, t.last_name AS usedByLastName
     FROM order_material_usage u
     JOIN orders o ON o.id = u.order_id
     LEFT JOIN technician t ON t.id = u.used_by
     WHERE u.stock_item_id = ?
     ORDER BY u.used_at DESC`,
  )
    .bind(id)
    .all();
  return c.json(rows.results);
});

/** Dohledání šarže podle 4-znakového kódu (XXXX sentinel se nevrací). */
app.get("/stock-items/by-short-code/:code", async (c) => {
  const db = drizzle(c.env.DB);
  const code = normalizeShortCode(c.req.param("code"));
  if (!code || code === ONE_TIME_SHORT_CODE) {
    return apiError(c, 404, "NOT_FOUND", "Kód nenalezen.");
  }
  const rows = await db
    .select({
      id: stockItem.id,
      shortCode: stockItem.shortCode,
      lotNumber: stockItem.lotNumber,
      expirationDate: stockItem.expirationDate,
      status: stockItem.status,
      consumptionMode: stockItem.consumptionMode,
      materialCatalogId: stockItem.materialCatalogId,
      materialCode: materialCatalog.code,
      canonicalName: materialCatalog.canonicalName,
      manufacturerName: manufacturer.name,
      isOrderUsageEligible: materialCatalog.isOrderUsageEligible,
    })
    .from(stockItem)
    .innerJoin(materialCatalog, eq(stockItem.materialCatalogId, materialCatalog.id))
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .where(eq(stockItem.shortCode, code))
    .limit(1);
  const row = rows[0];
  if (!row) return apiError(c, 404, "NOT_FOUND", "Kód nenalezen.");
  return c.json({
    ...row,
    isAvailableForUsage:
      isStockAvailable(row) && row.consumptionMode === "reusable_lot" && row.isOrderUsageEligible,
  });
});

export default app;
