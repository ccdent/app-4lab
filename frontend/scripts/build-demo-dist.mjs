// =============================================================================
// Demo build (demo.4lab.cz): kořen = statická marketingová landing page
// (landing/), aplikace = SPA pod /app (přejmenovaná na app.html).
// Spouštět PO `vite build`: `npm run build:demo` → výstup v dist-demo/.
// =============================================================================

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const out = join(root, "dist-demo");
const landing = join(root, "landing");

rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });

// SPA zůstává index.html (Pages by app.html kanonizovalo 308 na /app).
// landing/ je volitelná (ve veřejné distribuci není) — bez ní zůstane
// kořen dema na SPA a worker přesměruje "/" rovnou do /app.
if (existsSync(landing)) {
  cpSync(join(landing, "index.html"), join(out, "landing.html"));
  for (const f of readdirSync(landing)) {
    if (f.startsWith("landing-") && f.endsWith(".html")) cpSync(join(landing, f), join(out, f));
  }
  mkdirSync(join(out, "assets"), { recursive: true });
  for (const f of readdirSync(join(landing, "assets"))) {
    cpSync(join(landing, "assets", f), join(out, "assets", f));
  }
} else {
  console.log("landing/ nenalezena — demo build bez marketingové stránky");
}

// Kořen = landing (200 rewrite), vše ostatní = SPA fallback.
writeFileSync(
  join(out, "_redirects"),
  "/    /landing.html    200\n/*    /index.html    200\n",
);

console.log("dist-demo ready");
