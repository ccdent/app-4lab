import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import {
  manufacturer,
  materialCatalog,
  recipe,
  recipeItem,
  recipePriceListItem,
} from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requirePerm, type AppContext } from "../auth";

// =============================================================================
// Recepty — šablony materiálového složení (NE-audit; auditní pravda je
// order_material_usage). Řádky se ukládají diff-save se zachováním ID:
// návrhy v zakázkách drží source_recipe_item_id_snapshot, změna typu nebo
// materiálu řádku záměrně mění identitu (delete+insert).
// =============================================================================

const lineBody = z
  .object({
    id: z.string().nullish(),
    lineType: z.enum(["catalog_item", "placeholder"]),
    materialCatalogId: z.string().nullish(),
    placeholderText: z.string().trim().nullish(),
    note: z.string().trim().nullish(),
    sortOrder: z.number().int().default(0),
  })
  .refine(
    (l) =>
      l.lineType === "catalog_item"
        ? Boolean(l.materialCatalogId) && !l.placeholderText
        : Boolean(l.placeholderText?.trim()) && !l.materialCatalogId,
    { message: "Řádek: catalog_item musí mít materiál, placeholder text." },
  );

const recipeBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  description: z.string().trim().nullish(),
  archived: z.boolean().default(false),
  items: z.array(lineBody).min(1, "Recept musí mít aspoň jeden řádek"),
  priceListItemIds: z.array(z.string()).default([]),
});

const app = new Hono<AppContext>();

// Mutace jen s oprávněním (GET zůstává pro všechny).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requirePerm(c.get("me"), "materialsEdit", "úpravy materiálů");
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const includeArchived = c.req.query("includeArchived") === "1";
  const priceListItemId = c.req.query("priceListItemId");

  const rows = await db
    .select({
      id: recipe.id,
      name: recipe.name,
      description: recipe.description,
      archived: recipe.archived,
      itemCount: sql<number>`(SELECT COUNT(*) FROM recipe_item WHERE recipe_item.recipe_id = recipe.id)`,
      assignedCount: sql<number>`(SELECT COUNT(*) FROM recipe_price_list_item WHERE recipe_price_list_item.recipe_id = recipe.id)`,
    })
    .from(recipe)
    .where(
      and(
        includeArchived ? undefined : eq(recipe.archived, false),
        priceListItemId
          ? sql`EXISTS (SELECT 1 FROM recipe_price_list_item rpli WHERE rpli.recipe_id = recipe.id AND rpli.price_list_item_id = ${priceListItemId})`
          : undefined,
      ),
    )
    .orderBy(asc(recipe.name));
  return c.json(rows);
});

app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const head = await db.select().from(recipe).where(eq(recipe.id, id)).limit(1);
  if (!head[0]) return apiError(c, 404, "NOT_FOUND", "Recept nenalezen.");

  const [items, links] = await Promise.all([
    db
      .select({
        id: recipeItem.id,
        lineType: recipeItem.lineType,
        materialCatalogId: recipeItem.materialCatalogId,
        placeholderText: recipeItem.placeholderText,
        note: recipeItem.note,
        sortOrder: recipeItem.sortOrder,
        materialCode: materialCatalog.code,
        materialName: materialCatalog.canonicalName,
        manufacturerName: manufacturer.name,
      })
      .from(recipeItem)
      .leftJoin(materialCatalog, eq(recipeItem.materialCatalogId, materialCatalog.id))
      .leftJoin(manufacturer, eq(materialCatalog.manufacturerId, manufacturer.id))
      .where(eq(recipeItem.recipeId, id))
      .orderBy(asc(recipeItem.sortOrder)),
    db
      .select({ priceListItemId: recipePriceListItem.priceListItemId })
      .from(recipePriceListItem)
      .where(eq(recipePriceListItem.recipeId, id)),
  ]);

  return c.json({ ...head[0], items, priceListItemIds: links.map((l) => l.priceListItemId) });
});

app.post("/", async (c) => {
  const body = await parseBody(c, recipeBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = uuid();
  const ts = now();

  const statements = [
    db.insert(recipe).values({
      id,
      name: body.name,
      description: body.description ?? null,
      archived: body.archived,
      createdAt: ts,
      updatedAt: ts,
    }),
    ...body.items.map((l, idx) =>
      db.insert(recipeItem).values({
        id: uuid(),
        recipeId: id,
        lineType: l.lineType,
        materialCatalogId: l.materialCatalogId ?? null,
        placeholderText: l.placeholderText ?? null,
        note: l.note ?? null,
        sortOrder: idx,
      }),
    ),
    ...body.priceListItemIds.map((pli) =>
      db.insert(recipePriceListItem).values({ recipeId: id, priceListItemId: pli }),
    ),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, recipeBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const existing = await db.select({ id: recipe.id }).from(recipe).where(eq(recipe.id, id)).limit(1);
  if (!existing[0]) return apiError(c, 404, "NOT_FOUND", "Recept nenalezen.");

  const current = await db
    .select({
      id: recipeItem.id,
      lineType: recipeItem.lineType,
      materialCatalogId: recipeItem.materialCatalogId,
    })
    .from(recipeItem)
    .where(eq(recipeItem.recipeId, id));
  const currentById = new Map(current.map((r) => [r.id, r]));

  // Diff-save: řádek si drží ID jen když nezměnil typ ani materiál —
  // jinak nová identita (návrhy v zakázkách snapshotují staré ID).
  const keptIds = new Set<string>();
  const updates: typeof body.items = [];
  const inserts: typeof body.items = [];
  for (const l of body.items) {
    const cur = l.id ? currentById.get(l.id) : undefined;
    if (
      cur &&
      cur.lineType === l.lineType &&
      (cur.materialCatalogId ?? null) === (l.materialCatalogId ?? null)
    ) {
      keptIds.add(cur.id);
      updates.push(l);
    } else {
      inserts.push(l);
    }
  }
  const toDelete = current.filter((r) => !keptIds.has(r.id)).map((r) => r.id);

  const ts = now();
  const orderOf = new Map(body.items.map((l, idx) => [l, idx]));
  const statements = [
    db
      .update(recipe)
      .set({
        name: body.name,
        description: body.description ?? null,
        archived: body.archived,
        updatedAt: ts,
      })
      .where(eq(recipe.id, id)),
    ...toDelete.map((rid) => db.delete(recipeItem).where(eq(recipeItem.id, rid))),
    ...updates.map((l) =>
      db
        .update(recipeItem)
        .set({
          placeholderText: l.placeholderText ?? null,
          note: l.note ?? null,
          sortOrder: orderOf.get(l) ?? 0,
        })
        .where(eq(recipeItem.id, l.id!)),
    ),
    ...inserts.map((l) =>
      db.insert(recipeItem).values({
        id: uuid(),
        recipeId: id,
        lineType: l.lineType,
        materialCatalogId: l.materialCatalogId ?? null,
        placeholderText: l.placeholderText ?? null,
        note: l.note ?? null,
        sortOrder: orderOf.get(l) ?? 0,
      }),
    ),
    // M:N vazby: delete-all + insert (bez identity, bez závislostí).
    db.delete(recipePriceListItem).where(eq(recipePriceListItem.recipeId, id)),
    ...body.priceListItemIds.map((pli) =>
      db.insert(recipePriceListItem).values({ recipeId: id, priceListItemId: pli }),
    ),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);
  return c.json({ id });
});

/** Hard delete — návrhy v zakázkách přežijí díky snapshotům (bez FK). */
app.delete("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const res = await db.delete(recipe).where(eq(recipe.id, id));
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Recept nenalezen.");
  return c.body(null, 204);
});

export default app;
