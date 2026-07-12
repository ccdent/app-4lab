import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { attachment, orders } from "../db/schema";
import { apiError, now, uuid } from "../lib/http";
import { canAccessOrder, type AppContext } from "../auth";

// Přílohy: R2 přes Worker, bez draft→link modelu — upload rovnou k zakázce
// (rozhodnutí z XLSX: „jen pro interní potřebu, velmi jednoduše, malý objem").

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Content-typy bezpečné pro `inline` zobrazení na doméně aplikace.
 * Cokoli jiného (hlavně text/html, image/svg+xml) by se vykreslilo jako
 * stránka pod Access session → stored XSS; servíruje se jako download.
 */
const SAFE_INLINE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
  "text/plain",
]);

const app = new Hono<AppContext>();

/** Live obsazení úložiště příloh (suma z DB = obsah bucketu, mažeme hard). */
app.get("/attachments-usage", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)`,
      bytes: sql<number>`COALESCE(SUM(size + preview_size), 0)`,
    })
    .from(attachment);
  return c.json(rows[0] ?? { count: 0, bytes: 0 });
});

/** Upload — multipart: `file` (povinné) + `preview` (volitelný webp náhled). */
app.post("/orders/:orderId/attachments", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 403, "DEMO", "V demu nejsou přílohy dostupné.");
  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const orderId = c.req.param("orderId");

  const order = await db
    .select({ id: orders.id, assignedTechnicianId: orders.assignedTechnicianId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order[0]) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  if (!canAccessOrder(me, order[0].assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return apiError(c, 400, "VALIDATION", "Chybí soubor (pole `file`).");
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    return apiError(c, 400, "VALIDATION", "Soubor je prázdný nebo větší než 25 MB.");
  }
  const preview = body["preview"];

  const id = uuid();
  const safeName = file.name.replace(/[^\w.\-()À-ſ ]+/g, "_").slice(0, 120) || "soubor";
  const r2Key = `orders/${orderId}/${id}/${safeName}`;
  const previewR2Key = preview instanceof File ? `orders/${orderId}/${id}/preview.webp` : null;

  // R2-first, DB-last: při pádu DB zbude jen orphan objekt (neškodný),
  // opačné pořadí by rozbilo download.
  // POZOR: File/Blob předávat přímo — .stream() nemá známou délku a
  // produkční R2 ho odmítne (lokální miniflare to toleruje).
  await bucket.put(r2Key, file, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  if (previewR2Key && preview instanceof File) {
    await bucket.put(previewR2Key, preview, {
      httpMetadata: { contentType: "image/webp" },
    });
  }

  await db.insert(attachment).values({
    id,
    orderId,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    previewSize: preview instanceof File ? preview.size : 0,
    r2Key,
    previewR2Key,
    createdBy: me.id,
    createdAt: now(),
  });

  return c.json({ id }, 201);
});

/** Download — stream z R2; `?preview=1` vrací náhled. */
app.get("/attachments/:id/download", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 403, "DEMO", "V demu nejsou přílohy dostupné.");
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  const wantPreview = c.req.query("preview") === "1";

  const rows = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  const row = rows[0];
  if (!row) return apiError(c, 404, "NOT_FOUND", "Příloha nenalezena.");
  // Přílohy cizí zakázky nesmí stáhnout technik bez „vidí vše".
  const ordRows = await db
    .select({ assignedTechnicianId: orders.assignedTechnicianId })
    .from(orders)
    .where(eq(orders.id, row.orderId))
    .limit(1);
  if (ordRows[0] && !canAccessOrder(c.get("me"), ordRows[0].assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }

  const key = wantPreview && row.previewR2Key ? row.previewR2Key : row.r2Key;
  const obj = await bucket.get(key);
  if (!obj) return apiError(c, 404, "NOT_FOUND", "Soubor v úložišti chybí.");

  const contentType =
    wantPreview && row.previewR2Key ? "image/webp" : row.contentType;
  const inline = SAFE_INLINE.has(contentType.split(";")[0].trim().toLowerCase());
  return new Response(obj.body, {
    headers: {
      "Content-Type": inline ? contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
});

/** Smazání — R2 objekty + řádek (interní evidence, hard delete stačí). */
app.delete("/attachments/:id", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 403, "DEMO", "V demu nejsou přílohy dostupné.");
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const rows = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  const row = rows[0];
  if (!row) return apiError(c, 404, "NOT_FOUND", "Příloha nenalezena.");
  const ord = await db
    .select({ assignedTechnicianId: orders.assignedTechnicianId })
    .from(orders)
    .where(eq(orders.id, row.orderId))
    .limit(1);
  if (ord[0] && !canAccessOrder(c.get("me"), ord[0].assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }

  // DB-first: když R2 delete selže, zbude jen orphan objekt (neškodný);
  // opačné pořadí by nechalo řádek s mrtvým downloadem.
  await db.delete(attachment).where(eq(attachment.id, id));
  await bucket.delete([row.r2Key, ...(row.previewR2Key ? [row.previewR2Key] : [])]);
  return c.body(null, 204);
});

export default app;
