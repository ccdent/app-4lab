// =============================================================================
// API Worker — app.4lab.cz (Hono + Drizzle → D1, R2)
// =============================================================================

import { Hono } from "hono";
import { requireTechnician, type AppContext, type Env } from "./auth";
import { demoGuard } from "./demo/guard";
import dbExport from "./routes/dbExport";
import { resetDemoData } from "./demo/seed";
import clinics from "./routes/clinics";
import doctors from "./routes/doctors";
import preferenceOptions from "./routes/preferenceOptions";
import customerGroups from "./routes/customerGroups";
import instructions from "./routes/instructions";
import priceListCategories from "./routes/priceListCategories";
import priceListItems from "./routes/priceListItems";
import ordersRoutes from "./routes/orders";
import technicians from "./routes/technicians";
import labProfile from "./routes/labProfile";
import attachments from "./routes/attachments";
import billing from "./routes/billing";
import materials from "./routes/materials";
import orderMaterials from "./routes/orderMaterials";
import recipes from "./routes/recipes";
import payroll from "./routes/payroll";
import shippingMethods from "./routes/shippingMethods";

const app = new Hono<AppContext>().basePath("/api");

/* ---- Veřejné (bez technika) --------------------------------------- */

app.get("/health", (c) => c.json({ ok: true }));

// Best-effort příjem klientských pádů (AppErrorBoundary) — jen do logu
// Workeru (viditelné v Cloudflare dashboardu / wrangler tail).
// Reset dema (seed) — jen v DEMO_MODE a se správným klíčem (worker secret).
// Používá ho noční cron i ruční spuštění po deployi.
app.post("/demo/reset", async (c) => {
  if (c.env.DEMO_MODE !== "1") return c.notFound();
  const provided = c.req.header("X-Demo-Reset-Key") ?? "";
  // Porovnání přes digest — délkově i časově nezávislé na obsahu klíče.
  const [h1, h2] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(provided)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(c.env.DEMO_RESET_KEY ?? "")),
  ]);
  const same =
    !!c.env.DEMO_RESET_KEY &&
    new Uint8Array(h1).every((b, idx) => b === new Uint8Array(h2)[idx]);
  if (!same) {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  await resetDemoData(c.env);
  return c.json({ ok: true });
});

app.post("/client-error", async (c) => {
  try {
    const body = await c.req.json();
    console.error("[client-error]", JSON.stringify(body).slice(0, 8000));
  } catch {
    // nevalidní payload ignorujeme
  }
  return c.body(null, 204);
});

/* ---- Chráněné (přihlášený aktivní technik) ------------------------- */

app.use("/*", requireTechnician);
// Demo omezení (mimo demo prostředí no-op) — až PO ověření identity.
app.use("/*", demoGuard);

app.get("/me", (c) => c.json(c.get("me")));

app.route("/clinics", clinics);
app.route("/doctors", doctors);
app.route("/preference-options", preferenceOptions);
app.route("/customer-groups", customerGroups);
app.route("/price-list-categories", priceListCategories);
app.route("/instructions", instructions);
app.route("/price-list-items", priceListItems);
app.route("/orders", ordersRoutes);
app.route("/technicians", technicians);
app.route("/lab-profile", labProfile);
app.route("/", dbExport);
app.route("/", attachments);
app.route("/", materials);
app.route("/", orderMaterials);
app.route("/recipes", recipes);
app.route("/billing", billing);
app.route("/shipping-methods", shippingMethods);
app.route("/payroll", payroll);

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Demo: kořen domény = statická landing page. Pages by ji na kořeni
    // 308-kanonizovalo na /landing, proto ji servíruje worker (route
    // "demo.4lab.cz/" v wrangler.toml) interním fetchem na Pages asset.
    const url = new URL(req.url);
    if (env.DEMO_MODE === "1" && url.pathname === "/") {
      // Jazyková varianta podle cookie (nastavuje přepínač na stránce);
      // bez cookie čeština. Volba se sdílí s aplikací přes localStorage.
      const cookie = req.headers.get("Cookie") ?? "";
      const m = cookie.match(/landing_lang=(sk|en|de)/);
      const asset = m ? `/landing-${m[1]}` : "/landing";
      const res = await fetch(new URL(asset, url.origin).toString(), req);
      // Bez nasazené landing page (veřejná distribuce) vede kořen do aplikace.
      if (res.status === 404) {
        return Response.redirect(new URL("/app", url.origin).toString(), 302);
      }
      // Cache jen v prohlížeči — obsah kořene závisí na cookie.
      const out = new Response(res.body, res);
      out.headers.set("Cache-Control", "private, max-age=300");
      out.headers.set("Vary", "Cookie");
      return out;
    }
    return app.fetch(req, env, ctx);
  },
  /** Noční reset dema (cron jen v env.demo). */
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    if (env.DEMO_MODE !== "1") return;
    await resetDemoData(env);
  },
};
