import { defineConfig } from "drizzle-kit";

// Používá se jen na generování SQL migrací ze schema.ts:
//   npm run db:generate
// Aplikace migrací jde přes wrangler (db:migrate:local / db:migrate:remote),
// ne přes drizzle-kit push — D1 se řídí wrangler migrations.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
