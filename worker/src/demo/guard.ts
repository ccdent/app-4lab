// =============================================================================
// Demo guard — vynucuje omezení veřejného dema (demo.4lab.cz) na serveru.
// Frontend jen schovává tlačítka; skutečná pojistka je tady. Demo běží nad
// vlastní D1 a vlastním R2 (jen ukázkové fotky; mutace blokuje tento guard),
// takže i případný průnik nemá co poškodit.
// =============================================================================

import type { Context, Next } from "hono";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { apiError } from "../lib/http";
import type { AppContext } from "../auth";

/** Prefixy, kde jsou v demu zakázané VŠECHNY mutace. */
const BLOCKED_PREFIXES = ["/technicians", "/lab-profile", "/attachments", "/payroll/password"];

/** Limity počtu řádků — přes limit se nový záznam nezaloží (noční reset čistí). */
const CAPS: { method: string; pattern: RegExp; table: string; max: number }[] = [
  { method: "POST", pattern: /^\/orders$/, table: "orders", max: 30 },
  { method: "POST", pattern: /^\/stock-items$/, table: "stock_item", max: 40 },
  { method: "POST", pattern: /^\/manufacturers$/, table: "manufacturer", max: 15 },
  { method: "POST", pattern: /^\/material-catalog$/, table: "material_catalog", max: 40 },
  { method: "POST", pattern: /^\/recipes$/, table: "recipe", max: 15 },
  { method: "POST", pattern: /^\/orders\/[^/]+\/notes$/, table: "order_note", max: 100 },
  // One-time šarže zakládají stock_item mimo /stock-items (běžné použití
  // existující šarže se necapuje na stock_item):
  { method: "POST", pattern: /material-usages\/one-time$/, table: "stock_item", max: 40 },
  { method: "POST", pattern: /confirm-one-time$/, table: "stock_item", max: 40 },
  // Ochrana proti zaplavení přes diff-save položek a spam stavů/usages:
  { method: "PUT", pattern: /^\/orders\/[^/]+$/, table: "order_item", max: 400 },
  { method: "POST", pattern: /^\/orders\/[^/]+\/state$/, table: "order_state_log", max: 600 },
  { method: "POST", pattern: /material-usages/, table: "order_material_usage", max: 300 },
];

export async function demoGuard(c: Context<AppContext>, next: Next) {
  if (c.env.DEMO_MODE !== "1") return next();
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const path = c.req.path.replace(/^\/api/, "");

  if (BLOCKED_PREFIXES.some((p) => path.startsWith(p)) || path.includes("/attachments")) {
    return apiError(c, 403, "DEMO", "V demoverzi není tato akce dostupná.");
  }

  for (const cap of CAPS) {
    if (method !== cap.method || !cap.pattern.test(path)) continue;
    const db = drizzle(c.env.DB);
    const rows = await db.get<{ n: number }>(
      sql.raw(`SELECT COUNT(*) AS n FROM ${cap.table}`),
    );
    if ((rows?.n ?? 0) >= cap.max) {
      return apiError(
        c,
        403,
        "DEMO_LIMIT",
        "Demo limit dosažen — data se každou noc automaticky resetují.",
      );
    }
    break;
  }

  await next();
}
