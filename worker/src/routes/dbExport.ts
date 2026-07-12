// =============================================================================
// Kompletní záloha databáze — SQL dump (DDL + data) ke stažení. Jen vedoucí.
// Výstup jde obnovit do čisté D1/SQLite: `wrangler d1 execute DB --file dump.sql`
// (PRAGMA foreign_keys=OFF v hlavičce řeší pořadí tabulek). Přílohy žijí
// v R2 a součástí dumpu nejsou.
// =============================================================================

import { Hono } from "hono";
import { apiError } from "../lib/http";
import { requireLead, type AppContext } from "../auth";

const app = new Hono<AppContext>();

/** SQLite literál: NULL / číslo / '...' s escapovanými apostrofy. */
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

app.get("/admin/db-export", async (c) => {
  const err = requireLead(c.get("me"));
  if (err) return apiError(c, 403, err.code, err.message);

  const db = c.env.DB;
  const master = await db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '\\_cf%' ESCAPE '\\'
         AND name != 'd1_migrations'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
    )
    .all<{ type: string; name: string; sql: string }>();

  const today = new Date().toISOString().slice(0, 10);
  const out: string[] = [
    `-- app.4lab — kompletní záloha databáze (${today})`,
    `-- Obnova: sqlite3 novy.db < dump.sql  |  wrangler d1 execute DB --file dump.sql`,
    `-- Přílohy (R2) nejsou součástí dumpu.`,
    `PRAGMA foreign_keys=OFF;`,
    ``,
  ];

  const tables = master.results.filter((r) => r.type === "table");
  for (const t of tables) {
    out.push(`DROP TABLE IF EXISTS "${t.name}";`);
    out.push(`${t.sql.trim().replace(/;?$/, "")};`);

    const rows = await db.prepare(`SELECT * FROM "${t.name}"`).all<Record<string, unknown>>();
    if (rows.results.length > 0) {
      const cols = Object.keys(rows.results[0]);
      const colList = cols.map((cn) => `"${cn}"`).join(", ");
      // Po dávkách — jeden INSERT na 50 řádků drží soubor kompaktní.
      for (let i = 0; i < rows.results.length; i += 50) {
        const chunk = rows.results.slice(i, i + 50);
        const values = chunk
          .map((r) => `(${cols.map((cn) => sqlLiteral(r[cn])).join(", ")})`)
          .join(",\n  ");
        out.push(`INSERT INTO "${t.name}" (${colList}) VALUES\n  ${values};`);
      }
    }
    out.push("");
  }

  for (const idx of master.results.filter((r) => r.type !== "table")) {
    out.push(`${idx.sql.trim().replace(/;?$/, "")};`);
  }
  out.push(`PRAGMA foreign_keys=ON;`, ``);

  return new Response(out.join("\n"), {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="zaloha-4lab-${today}.sql"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export default app;
