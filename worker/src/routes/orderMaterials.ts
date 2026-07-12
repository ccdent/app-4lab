import { Hono } from "hono";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import {
  manufacturer,
  materialCatalog,
  orderMaterialProposal,
  orderMaterialUsage,
  orders,
  recipe,
  recipeItem,
  recipePriceListItem,
  stockItem,
  technician,
} from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { isStockAvailable, isValidISODate, ONE_TIME_SHORT_CODE, todayPrague } from "./materials";
import { canAccessOrder, type AppContext, type Me } from "../auth";

// =============================================================================
// Materiály na zakázce (MDR audit) + checklist návrhů z receptů.
// order_material_usage = jediná auditní pravda (snapshoty z reálných řádků DB).
// Návrhy (proposal) jsou staging: pending/resolved/discarded/obsolete;
// discarded = lidské rozhodnutí (neobnovuje se), obsolete = systémový úklid
// (při návratu položky se reaktivuje). Algoritmus 1:1 dle crm-full §6.
// =============================================================================

type Db = ReturnType<typeof drizzle>;

async function loadOrderLock(db: Db, orderId: string) {
  const rows = await db
    .select({
      id: orders.id,
      state: orders.state,
      isBilled: orders.isBilled,
      assignedTechnicianId: orders.assignedTechnicianId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Zámek zápisů materiálů: vyfakturovaná NEBO dokončená zakázka (parita s FE —
 * dřív hlídal server jen billed a done bylo obejitelné přes API).
 */
function materialLockError(
  order: { state: string; isBilled: boolean; assignedTechnicianId?: string | null } | null,
  me?: Me,
): {
  code: string;
  message: string;
} | null {
  if (!order) return null;
  if (me && order.assignedTechnicianId !== undefined && !canAccessOrder(me, order.assignedTechnicianId)) {
    return { code: "FORBIDDEN", message: "Tahle zakázka patří jinému technikovi." };
  }
  if (order.isBilled) return { code: "BILLED_ORDER", message: "Vyfakturovaná zakázka je zamčená." };
  if (order.state === "done") {
    return { code: "ORDER_LOCKED", message: "Dokončená zakázka je zamčená — vrať ji do rozpracovaného stavu." };
  }
  return null;
}

/** Zápis použití šarže — flipne active→used a nastaví first_used_at. */
/**
 * Validace šarže + příprava atomických statementů (usage insert + flip
 * active→used). Volající je spustí v db.batch — případně spolu s dalšími
 * statementy (claim návrhu), aby souběh nemohl zdvojit auditní záznam.
 */
async function prepareStockUsage(
  db: Db,
  orderId: string,
  stockItemId: string,
  usedBy: string,
  usageId: string,
): Promise<{ statements: Parameters<Db["batch"]>[0] } | { error: string }> {
  const rows = await db
    .select({
      id: stockItem.id,
      status: stockItem.status,
      consumptionMode: stockItem.consumptionMode,
      lotNumber: stockItem.lotNumber,
      expirationDate: stockItem.expirationDate,
      firstUsedAt: stockItem.firstUsedAt,
      canonicalName: materialCatalog.canonicalName,
      materialCatalogId: materialCatalog.id,
      isOrderUsageEligible: materialCatalog.isOrderUsageEligible,
      manufacturerName: manufacturer.name,
    })
    .from(stockItem)
    .innerJoin(materialCatalog, eq(stockItem.materialCatalogId, materialCatalog.id))
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .where(eq(stockItem.id, stockItemId))
    .limit(1);
  const s = rows[0];
  if (!s) return { error: "STOCK_NOT_AVAILABLE" };
  if (s.consumptionMode !== "reusable_lot") return { error: "STOCK_NOT_AVAILABLE" };
  if (!isStockAvailable(s)) return { error: "STOCK_NOT_AVAILABLE" };
  if (!s.isOrderUsageEligible) return { error: "MATERIAL_NOT_ELIGIBLE" };

  const ts = now();
  const statements = [
    db.insert(orderMaterialUsage).values({
      id: usageId,
      orderId,
      materialCatalogId: s.materialCatalogId,
      stockItemId: s.id,
      displayName: s.canonicalName,
      manufacturerName: s.manufacturerName,
      lotNumber: s.lotNumber,
      expirationDate: s.expirationDate,
      sourceType: "stock",
      usedAt: ts,
      usedBy,
    }),
    // První použití: active→used + first_used_at (edge repair, když chybí).
    db
      .update(stockItem)
      .set({
        status: "used",
        firstUsedAt: sql`COALESCE(${stockItem.firstUsedAt}, ${ts})`,
      })
      .where(eq(stockItem.id, s.id)),
  ] as unknown as Parameters<Db["batch"]>[0];
  return { statements };
}

/**
 * Jednorázová cesta jako atomické statementy: consumed sentinel stock item
 * + auditní usage v JEDNOM batchi (sentinel kód je unikátní konstrukcí —
 * žádný retry není potřeba).
 */
function buildOneTimeStatements(
  db: Db,
  p: {
    orderId: string;
    materialCatalogId: string;
    canonicalName: string;
    manufacturerName: string;
    lotNumber: string;
    expirationDate: string;
    usedBy: string;
    usageId: string;
    ts: number;
  },
): Parameters<Db["batch"]>[0] {
  const stockId = uuid();
  return [
    db.insert(stockItem).values({
      id: stockId,
      materialCatalogId: p.materialCatalogId,
      shortCode: `${ONE_TIME_SHORT_CODE}-${stockId.slice(0, 8)}`,
      lotNumber: p.lotNumber,
      expirationDate: p.expirationDate,
      receivedAt: p.ts,
      status: "consumed",
      consumptionMode: "one_time",
      firstUsedAt: p.ts,
    }),
    db.insert(orderMaterialUsage).values({
      id: p.usageId,
      orderId: p.orderId,
      materialCatalogId: p.materialCatalogId,
      stockItemId: stockId,
      displayName: p.canonicalName,
      manufacturerName: p.manufacturerName,
      lotNumber: p.lotNumber,
      expirationDate: p.expirationDate,
      sourceType: "one_time",
      usedAt: p.ts,
      usedBy: p.usedBy,
    }),
  ] as unknown as Parameters<Db["batch"]>[0];
}

/* ------------------------------------------------------------------ */
/*  Lazy sync návrhů (crm-full sync_material_proposals_for_order)       */
/* ------------------------------------------------------------------ */

export interface SyncResult {
  inserted: number;
  obsoleted: number;
  reactivated: number;
}

/**
 * Tři sekvenční kroky (každý vidí zápisy předchozího):
 *  (a) osiřelé pending → obsolete (match scope BEZ filtru archivace —
 *      archivace receptu nesmí zneaktuálnit existující návrhy)
 *  (b) obsolete, jejichž řádek se vrátil → pending (jen pokud materiál
 *      nemá jiný ne-obsolete návrh — dedup na materiál)
 *  (c) insert chybějících z NEarchivovaných receptů; dedup na materiál
 *      v dávce i proti existujícím; FEFO návrh šarže; ON CONFLICT IGNORE
 * Na billed/done zakázce NO-OP (nikdy nehází — volá se z view).
 */
export async function syncProposalsForOrder(db: Db, orderId: string, meId: string | null): Promise<SyncResult> {
  const order = await loadOrderLock(db, orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.isBilled || order.state === "done") {
    return { inserted: 0, obsoleted: 0, reactivated: 0 };
  }

  // match scope: recipe_item dosažitelné z položek zakázky (bez filtru archivace)
  const matchScope = sql`(
    SELECT DISTINCT ri.id FROM recipe_item ri
    JOIN recipe_price_list_item rpli ON rpli.recipe_id = ri.recipe_id
    JOIN order_item oi ON oi.price_list_item_id = rpli.price_list_item_id
    WHERE oi.order_id = ${orderId}
  )`;

  // (a) obsolete orphans
  const obs = await db
    .update(orderMaterialProposal)
    .set({ status: "obsolete" })
    .where(
      and(
        eq(orderMaterialProposal.orderId, orderId),
        eq(orderMaterialProposal.status, "pending"),
        sql`${orderMaterialProposal.sourceRecipeItemIdSnapshot} NOT IN ${matchScope}`,
      ),
    );

  // (b) reactivate — jen když materiál nemá jiný ne-obsolete návrh na zakázce
  const react = await db
    .update(orderMaterialProposal)
    .set({ status: "pending" })
    .where(
      and(
        eq(orderMaterialProposal.orderId, orderId),
        eq(orderMaterialProposal.status, "obsolete"),
        sql`${orderMaterialProposal.sourceRecipeItemIdSnapshot} IN ${matchScope}`,
        sql`(
          order_material_proposal.material_catalog_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM order_material_proposal p2
            WHERE p2.order_id = ${orderId}
              AND p2.id != order_material_proposal.id
              AND p2.status != 'obsolete'
              AND p2.material_catalog_id = order_material_proposal.material_catalog_id
          )
        )`,
      ),
    );

  // (c) insert missing — kandidáti z NEarchivovaných receptů
  const candidates = await db
    .select({
      recipeItemId: recipeItem.id,
      recipeId: recipe.id,
      recipeName: recipe.name,
      lineType: recipeItem.lineType,
      materialCatalogId: recipeItem.materialCatalogId,
      placeholderText: recipeItem.placeholderText,
      materialCode: materialCatalog.code,
      materialName: materialCatalog.canonicalName,
      manufacturerName: manufacturer.name,
    })
    .from(recipeItem)
    .innerJoin(recipe, and(eq(recipeItem.recipeId, recipe.id), eq(recipe.archived, false)))
    .innerJoin(recipePriceListItem, eq(recipePriceListItem.recipeId, recipe.id))
    .innerJoin(
      sql`order_item oi`,
      sql`oi.price_list_item_id = ${recipePriceListItem.priceListItemId} AND oi.order_id = ${orderId}`,
    )
    .leftJoin(materialCatalog, eq(recipeItem.materialCatalogId, materialCatalog.id))
    .leftJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .orderBy(asc(recipe.name), asc(recipeItem.id));

  // existující návrhy: snapshot idempotence + materiálový dedup (ne-obsolete)
  const existing = await db
    .select({
      snapshot: orderMaterialProposal.sourceRecipeItemIdSnapshot,
      materialCatalogId: orderMaterialProposal.materialCatalogId,
      status: orderMaterialProposal.status,
    })
    .from(orderMaterialProposal)
    .where(eq(orderMaterialProposal.orderId, orderId));
  const existingSnapshots = new Set(existing.map((e) => e.snapshot));
  const answeredMaterials = new Set(
    existing.filter((e) => e.status !== "obsolete" && e.materialCatalogId).map((e) => e.materialCatalogId!),
  );

  const seenInBatch = new Set<string>(); // dedup materiálu v rámci dávky
  const seenItems = new Set<string>(); // DISTINCT přes junction join
  const toInsert: (typeof candidates)[number][] = [];
  for (const cand of candidates) {
    if (seenItems.has(cand.recipeItemId)) continue;
    seenItems.add(cand.recipeItemId);
    if (existingSnapshots.has(cand.recipeItemId)) continue;
    if (cand.lineType === "catalog_item" && cand.materialCatalogId) {
      if (answeredMaterials.has(cand.materialCatalogId)) continue;
      if (seenInBatch.has(cand.materialCatalogId)) continue;
      seenInBatch.add(cand.materialCatalogId);
    }
    toInsert.push(cand);
  }

  let inserted = 0;
  if (toInsert.length) {
    // FEFO návrh šarže pro každý materiál v dávce
    const materialIds = [...new Set(toInsert.map((t) => t.materialCatalogId).filter(Boolean))] as string[];
    const today = todayPrague();
    const lots = materialIds.length
      ? await db
          .select({
            id: stockItem.id,
            materialCatalogId: stockItem.materialCatalogId,
            status: stockItem.status,
            expirationDate: stockItem.expirationDate,
          })
          .from(stockItem)
          .where(
            and(
              inArray(stockItem.materialCatalogId, materialIds),
              inArray(stockItem.status, ["active", "used"]),
              sql`${stockItem.expirationDate} >= ${today}`,
              eq(stockItem.consumptionMode, "reusable_lot"),
            ),
          )
          .orderBy(
            sql`CASE ${stockItem.status} WHEN 'active' THEN 0 ELSE 1 END`,
            asc(stockItem.expirationDate),
          )
      : [];
    const suggestedByMaterial = new Map<string, string>();
    for (const lot of lots) {
      if (!suggestedByMaterial.has(lot.materialCatalogId)) {
        suggestedByMaterial.set(lot.materialCatalogId, lot.id);
      }
    }

    const ts = now();
    const statements = toInsert.map((t) =>
      db.insert(orderMaterialProposal).values({
        id: uuid(),
        orderId,
        sourceRecipeId: t.recipeId,
        sourceRecipeItemIdSnapshot: t.recipeItemId,
        sourceRecipeNameSnapshot: t.recipeName,
        lineType: t.lineType,
        materialCatalogId: t.materialCatalogId,
        materialCodeSnapshot: t.materialCode,
        materialNameSnapshot: t.materialName,
        manufacturerNameSnapshot: t.manufacturerName,
        placeholderText: t.placeholderText,
        suggestedStockItemId: t.materialCatalogId
          ? suggestedByMaterial.get(t.materialCatalogId) ?? null
          : null,
        status: "pending",
        createdBy: meId,
        createdAt: ts,
      }),
    );
    try {
      await db.batch(statements as [typeof statements[0], ...typeof statements]);
      inserted = toInsert.length;
    } catch (e) {
      // souběžný sync — idempotence přes UNIQUE; opakovaný sync se srovná
      if (!(e instanceof Error && e.message.includes("UNIQUE"))) throw e;
    }
  }

  return { inserted, obsoleted: obs.meta.changes, reactivated: react.meta.changes };
}

/** Počet pending návrhů (hard gate v přechodu na done). */
export async function countPendingProposals(db: Db, orderId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(orderMaterialProposal)
    .where(and(eq(orderMaterialProposal.orderId, orderId), eq(orderMaterialProposal.status, "pending")));
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                              */
/* ------------------------------------------------------------------ */

const app = new Hono<AppContext>();

app.get("/orders/:orderId/material-usages", async (c) => {
  const db = drizzle(c.env.DB);
  const orderId = c.req.param("orderId");
  const ord = await loadOrderLock(db, orderId);
  if (ord && !canAccessOrder(c.get("me"), ord.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  const rows = await db
    .select({
      id: orderMaterialUsage.id,
      displayName: orderMaterialUsage.displayName,
      manufacturerName: orderMaterialUsage.manufacturerName,
      lotNumber: orderMaterialUsage.lotNumber,
      expirationDate: orderMaterialUsage.expirationDate,
      sourceType: orderMaterialUsage.sourceType,
      usedAt: orderMaterialUsage.usedAt,
      shortCode: stockItem.shortCode,
      consumptionMode: stockItem.consumptionMode,
      usedByFirstName: technician.firstName,
      usedByLastName: technician.lastName,
    })
    .from(orderMaterialUsage)
    .leftJoin(stockItem, eq(orderMaterialUsage.stockItemId, stockItem.id))
    .leftJoin(technician, eq(orderMaterialUsage.usedBy, technician.id))
    .where(eq(orderMaterialUsage.orderId, orderId))
    .orderBy(desc(orderMaterialUsage.usedAt), desc(orderMaterialUsage.id));
  return c.json(rows);
});

app.post("/orders/:orderId/material-usages", async (c) => {
  const body = await parseBody(c, z.object({ stockItemId: z.string().min(1) }));
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const orderId = c.req.param("orderId");

  const order = await loadOrderLock(db, orderId);
  if (!order) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);

  const usageId = uuid();
  const res = await prepareStockUsage(db, orderId, body.stockItemId, c.get("me").id, usageId);
  if ("error" in res) {
    return apiError(
      c,
      409,
      res.error,
      res.error === "MATERIAL_NOT_ELIGIBLE"
        ? "Materiál není způsobilý pro použití na zakázce."
        : "Šarže není dostupná (expirovaná, spotřebovaná nebo vyřazená).",
    );
  }
  await db.batch(res.statements);
  return c.json({ id: usageId }, 201);
});

/** Jednorázová cesta: šarže mimo sklad → vznikne consumed stock item + usage. */
app.post("/orders/:orderId/material-usages/one-time", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      materialCatalogId: z.string().min(1),
      lotNumber: z.string().trim().min(1, "Šarže (LOT) je povinná"),
      expirationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isValidISODate, "Neplatné datum expirace"),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const orderId = c.req.param("orderId");
  const me = c.get("me");

  const order = await loadOrderLock(db, orderId);
  if (!order) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);

  const cat = await db
    .select({
      id: materialCatalog.id,
      canonicalName: materialCatalog.canonicalName,
      isOrderUsageEligible: materialCatalog.isOrderUsageEligible,
      manufacturerName: manufacturer.name,
    })
    .from(materialCatalog)
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .where(eq(materialCatalog.id, body.materialCatalogId))
    .limit(1);
  if (!cat[0]) return apiError(c, 400, "VALIDATION", "Materiál v katalogu neexistuje.");
  if (!cat[0].isOrderUsageEligible) {
    return apiError(c, 409, "MATERIAL_NOT_ELIGIBLE", "Materiál není způsobilý pro použití na zakázce.");
  }

  // Atomicky: stock item (consumed sentinel) + usage v jednom batchi —
  // jinak by pád mezi zápisy nechal spotřebovanou šarži bez použití.
  const ts = now();
  const usageId = uuid();
  const statements = buildOneTimeStatements(db, {
    orderId,
    materialCatalogId: cat[0].id,
    canonicalName: cat[0].canonicalName,
    manufacturerName: cat[0].manufacturerName,
    lotNumber: body.lotNumber,
    expirationDate: body.expirationDate,
    usedBy: me.id,
    usageId,
    ts,
  });
  await db.batch(statements);
  return c.json({ id: usageId }, 201);
});

app.delete("/material-usages/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const rows = await db
    .select({ orderId: orderMaterialUsage.orderId })
    .from(orderMaterialUsage)
    .where(eq(orderMaterialUsage.id, id))
    .limit(1);
  if (!rows[0]) return apiError(c, 404, "NOT_FOUND", "Záznam nenalezen.");
  const order = await loadOrderLock(db, rows[0].orderId);
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);
  await db.delete(orderMaterialUsage).where(eq(orderMaterialUsage.id, id));
  return c.body(null, 204);
});

/* ---------------- Návrhy z receptů --------------------------------- */

app.post("/orders/:orderId/material-proposals/sync", async (c) => {
  const db = drizzle(c.env.DB);
  const ord = await loadOrderLock(db, c.req.param("orderId"));
  if (ord && !canAccessOrder(c.get("me"), ord.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  try {
    const result = await syncProposalsForOrder(db, c.req.param("orderId"), c.get("me").id);
    return c.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === "ORDER_NOT_FOUND") {
      return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
    }
    throw e;
  }
});

app.get("/orders/:orderId/material-proposals", async (c) => {
  const db = drizzle(c.env.DB);
  const orderId = c.req.param("orderId");
  const ord = await loadOrderLock(db, orderId);
  if (ord && !canAccessOrder(c.get("me"), ord.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  const rows = await db
    .select({
      id: orderMaterialProposal.id,
      sourceRecipeNameSnapshot: orderMaterialProposal.sourceRecipeNameSnapshot,
      lineType: orderMaterialProposal.lineType,
      materialCatalogId: orderMaterialProposal.materialCatalogId,
      materialCodeSnapshot: orderMaterialProposal.materialCodeSnapshot,
      materialNameSnapshot: orderMaterialProposal.materialNameSnapshot,
      manufacturerNameSnapshot: orderMaterialProposal.manufacturerNameSnapshot,
      placeholderText: orderMaterialProposal.placeholderText,
      status: orderMaterialProposal.status,
      suggestedStockItemId: orderMaterialProposal.suggestedStockItemId,
      suggestedShortCode: stockItem.shortCode,
      suggestedLotNumber: stockItem.lotNumber,
      suggestedExpirationDate: stockItem.expirationDate,
      suggestedStatus: stockItem.status,
      createdAt: orderMaterialProposal.createdAt,
    })
    .from(orderMaterialProposal)
    .leftJoin(stockItem, eq(orderMaterialProposal.suggestedStockItemId, stockItem.id))
    .where(eq(orderMaterialProposal.orderId, orderId))
    .orderBy(
      sql`CASE ${orderMaterialProposal.status} WHEN 'pending' THEN 0 WHEN 'resolved' THEN 1 ELSE 2 END`,
      asc(orderMaterialProposal.sourceRecipeNameSnapshot),
      asc(orderMaterialProposal.createdAt),
    );
  const today = todayPrague();
  return c.json(
    rows.map((r) => ({
      ...r,
      isSuggestedLotAvailable:
        r.suggestedStatus != null &&
        r.suggestedExpirationDate != null &&
        isStockAvailable({ status: r.suggestedStatus, expirationDate: r.suggestedExpirationDate }) &&
        r.suggestedExpirationDate >= today,
    })),
  );
});

/** Guard společný pro confirm/discard: proposal musí být pending, order odemčený. */
async function loadPendingProposal(db: Db, proposalId: string) {
  const rows = await db
    .select()
    .from(orderMaterialProposal)
    .where(eq(orderMaterialProposal.id, proposalId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * CLAIM návrhu: podmíněný přepis pending→resolved (WHERE status='pending').
 * meta.changes === 0 → souběžné potvrzení už vyhrálo (dvojklik, druhý tab) —
 * bez claimu by vznikly DVA auditní záznamy použití.
 */
async function claimProposal(
  db: Db,
  proposalId: string,
  usageId: string,
  meId: string,
  ts: number,
): Promise<boolean> {
  const res = await db
    .update(orderMaterialProposal)
    .set({ status: "resolved", resolvedUsageId: usageId, resolvedAt: ts, resolvedBy: meId })
    .where(and(eq(orderMaterialProposal.id, proposalId), eq(orderMaterialProposal.status, "pending")));
  return res.meta.changes > 0;
}

/** Rollback claimu, když navazující zápis selhal (šarže mezitím nedostupná…). */
async function unclaimProposal(db: Db, proposalId: string): Promise<void> {
  await db
    .update(orderMaterialProposal)
    .set({ status: "pending", resolvedUsageId: null, resolvedAt: null, resolvedBy: null })
    .where(eq(orderMaterialProposal.id, proposalId));
}

app.post("/material-proposals/:id/confirm", async (c) => {
  const body = await parseBody(c, z.object({ stockItemId: z.string().min(1) }));
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const me = c.get("me");

  const p = await loadPendingProposal(db, c.req.param("id"));
  if (!p) return apiError(c, 404, "PROPOSAL_NOT_FOUND", "Návrh nenalezen.");
  if (p.status !== "pending") return apiError(c, 409, "PROPOSAL_NOT_PENDING", "Návrh už není ve stavu pending.");
  const order = await loadOrderLock(db, p.orderId);
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);

  // Materiál fixovaný návrhem: šarže musí patřit ke stejnému materiálu.
  if (p.lineType === "catalog_item" && p.materialCatalogId) {
    const s = await db
      .select({ materialCatalogId: stockItem.materialCatalogId })
      .from(stockItem)
      .where(eq(stockItem.id, body.stockItemId))
      .limit(1);
    if (s[0] && s[0].materialCatalogId !== p.materialCatalogId) {
      return apiError(c, 409, "MATERIAL_MISMATCH", "Vybraný materiál neodpovídá materiálu návrhu.");
    }
  }

  // Validace šarže PŘED claimem (ať se claim zbytečně nerollbackuje).
  const usageId = uuid();
  const prep = await prepareStockUsage(db, p.orderId, body.stockItemId, me.id, usageId);
  if ("error" in prep) {
    return apiError(c, 409, prep.error, "Skladová položka není dostupná — vyber jinou.");
  }
  const ts = now();
  if (!(await claimProposal(db, p.id, usageId, me.id, ts))) {
    return apiError(c, 409, "PROPOSAL_NOT_PENDING", "Návrh mezitím vyřešil někdo jiný.");
  }
  try {
    await db.batch(prep.statements);
  } catch (e) {
    await unclaimProposal(db, p.id);
    throw e;
  }
  return c.json({ id: p.id });
});

app.post("/material-proposals/:id/confirm-one-time", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      materialCatalogId: z.string().min(1),
      lotNumber: z.string().trim().min(1, "Šarže (LOT) je povinná"),
      expirationDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isValidISODate, "Neplatné datum expirace"),
    }),
  );
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const me = c.get("me");

  const p = await loadPendingProposal(db, c.req.param("id"));
  if (!p) return apiError(c, 404, "PROPOSAL_NOT_FOUND", "Návrh nenalezen.");
  if (p.status !== "pending") return apiError(c, 409, "PROPOSAL_NOT_PENDING", "Návrh už není ve stavu pending.");
  const order = await loadOrderLock(db, p.orderId);
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);
  if (p.lineType === "catalog_item" && p.materialCatalogId && p.materialCatalogId !== body.materialCatalogId) {
    return apiError(c, 409, "MATERIAL_MISMATCH", "Vybraný materiál neodpovídá materiálu návrhu.");
  }

  const cat = await db
    .select({
      canonicalName: materialCatalog.canonicalName,
      isOrderUsageEligible: materialCatalog.isOrderUsageEligible,
      manufacturerName: manufacturer.name,
    })
    .from(materialCatalog)
    .innerJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
    .where(eq(materialCatalog.id, body.materialCatalogId))
    .limit(1);
  if (!cat[0]) return apiError(c, 400, "VALIDATION", "Materiál v katalogu neexistuje.");
  if (!cat[0].isOrderUsageEligible) {
    return apiError(c, 409, "MATERIAL_NOT_ELIGIBLE", "Materiál není způsobilý pro použití na zakázce.");
  }

  // Claim → atomický zápis (sentinel stock + usage) → rollback při pádu.
  const ts = now();
  const usageId = uuid();
  if (!(await claimProposal(db, p.id, usageId, me.id, ts))) {
    return apiError(c, 409, "PROPOSAL_NOT_PENDING", "Návrh mezitím vyřešil někdo jiný.");
  }
  const statements = buildOneTimeStatements(db, {
    orderId: p.orderId,
    materialCatalogId: body.materialCatalogId,
    canonicalName: cat[0].canonicalName,
    manufacturerName: cat[0].manufacturerName,
    lotNumber: body.lotNumber,
    expirationDate: body.expirationDate,
    usedBy: me.id,
    usageId,
    ts,
  });
  try {
    await db.batch(statements);
  } catch (e) {
    await unclaimProposal(db, p.id);
    throw e;
  }
  return c.json({ id: p.id });
});

app.post("/material-proposals/:id/discard", async (c) => {
  const db = drizzle(c.env.DB);
  const p = await loadPendingProposal(db, c.req.param("id"));
  if (!p) return apiError(c, 404, "PROPOSAL_NOT_FOUND", "Návrh nenalezen.");
  if (p.status !== "pending") return apiError(c, 409, "PROPOSAL_NOT_PENDING", "Návrh už není ve stavu pending.");
  const order = await loadOrderLock(db, p.orderId);
  const lock = materialLockError(order, c.get("me"));
  if (lock) return apiError(c, 409, lock.code, lock.message);
  await db
    .update(orderMaterialProposal)
    .set({ status: "discarded", resolvedAt: now(), resolvedBy: c.get("me").id })
    .where(eq(orderMaterialProposal.id, p.id));
  return c.json({ id: p.id });
});

export default app;
