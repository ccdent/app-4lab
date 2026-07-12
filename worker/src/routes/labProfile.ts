import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import { labProfile } from "../db/schema";
import { apiError, now, parseBody } from "../lib/http";
import { requireLead, type AppContext } from "../auth";

// Singleton — vždy id 'lab'.
const LAB_ID = "lab";

const labBody = z.object({
  name: z.string().trim().min(1, "Název je povinný"),
  street: z.string().trim().default(""),
  city: z.string().trim().default(""),
  zip: z.string().trim().default(""),
  ico: z.string().trim().default(""),
  dic: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  orderPrefixMode: z.enum(["year", "custom"]).default("year"),
  // Jen bezpečné znaky — prefix jde do LIKE vzoru ('%'/'_' by rozbily
  // hledání max. sekvence) a do čísla zakázky na tiskách.
  orderPrefix: z
    .string()
    .trim()
    .max(12, "Prefix max 12 znaků")
    .regex(/^[A-Za-z0-9./-]*$/, "Prefix smí obsahovat jen písmena, číslice a . / -")
    .default(""),
  enforceMaterialProposalsOnDone: z.boolean().default(false),
  printInAppLanguage: z.boolean().default(true),
}).refine((b) => b.orderPrefixMode !== "custom" || b.orderPrefix.length > 0, {
  message: "Vlastní prefix nesmí být prázdný",
  path: ["orderPrefix"],
});

const app = new Hono<AppContext>();

// Mutace jen pro vedoucí (admin sekce); GET zůstává (výběry ve formulářích).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requireLead(c.get("me"));
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(labProfile).where(eq(labProfile.id, LAB_ID)).limit(1);
  return c.json(
    rows[0] ?? {
      id: LAB_ID,
      name: "",
      street: "",
      city: "",
      zip: "",
      ico: "",
      dic: null,
      phone: null,
      email: null,
      orderPrefixMode: "year",
      orderPrefix: "",
      enforceMaterialProposalsOnDone: false,
      printInAppLanguage: true,
      logoR2Key: null,
      logoUpdatedAt: null,
    },
  );
});

/* ---- Vlastní logo (hlavička aplikace) ------------------------------ */

const LOGO_KEY = "branding/logo";
const LOGO_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 512 * 1024;

app.get("/logo", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 404, "NOT_FOUND", "Logo není nastaveno.");
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({ key: labProfile.logoR2Key, type: labProfile.logoContentType })
    .from(labProfile)
    .where(eq(labProfile.id, LAB_ID))
    .limit(1);
  if (!rows[0]?.key) return apiError(c, 404, "NOT_FOUND", "Logo není nastaveno.");
  const obj = await bucket.get(rows[0].key);
  if (!obj) return apiError(c, 404, "NOT_FOUND", "Logo není nastaveno.");
  return new Response(obj.body, {
    headers: {
      "Content-Type": rows[0].type ?? "image/png",
      // URL nese ?v=<logoUpdatedAt> — obsah pod danou verzí je neměnný.
      "Cache-Control": "private, max-age=86400, immutable",
      // SVG může nést skript — sandbox ho při přímé navigaci neutralizuje,
      // v <img> se skripty nespouští tak jako tak.
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

app.post("/logo", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 403, "DEMO", "V demu nelze měnit logo.");
  const db = drizzle(c.env.DB);
  const existing = await db.select({ id: labProfile.id }).from(labProfile).where(eq(labProfile.id, LAB_ID)).limit(1);
  if (!existing[0]) return apiError(c, 409, "NO_PROFILE", "Nejdřív ulož profil laboratoře.");

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file") as unknown;
  if (!(file instanceof File)) return apiError(c, 400, "VALIDATION", "Chybí soubor s logem.");
  if (!LOGO_TYPES.has(file.type)) {
    return apiError(c, 400, "VALIDATION", "Logo musí být SVG, PNG, JPEG nebo WebP.");
  }
  if (file.size > LOGO_MAX_BYTES) {
    return apiError(c, 400, "VALIDATION", "Logo je příliš velké (max 512 kB).");
  }

  await bucket.put(LOGO_KEY, file, { httpMetadata: { contentType: file.type } });
  const ts = now();
  await db
    .update(labProfile)
    .set({ logoR2Key: LOGO_KEY, logoContentType: file.type, logoUpdatedAt: ts, updatedAt: ts })
    .where(eq(labProfile.id, LAB_ID));
  return c.json({ logoUpdatedAt: ts });
});

app.delete("/logo", async (c) => {
  const bucket = c.env.ATTACHMENTS;
  if (!bucket) return apiError(c, 403, "DEMO", "V demu nelze měnit logo.");
  const db = drizzle(c.env.DB);
  await bucket.delete(LOGO_KEY).catch(() => {});
  await db
    .update(labProfile)
    .set({ logoR2Key: null, logoContentType: null, logoUpdatedAt: null, updatedAt: now() })
    .where(eq(labProfile.id, LAB_ID));
  return c.body(null, 204);
});

app.put("/", async (c) => {
  const body = await parseBody(c, labBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);
  await db
    .insert(labProfile)
    .values({ id: LAB_ID, ...body, updatedAt: now() })
    .onConflictDoUpdate({ target: labProfile.id, set: { ...body, updatedAt: now() } });
  return c.json({ id: LAB_ID });
});

export default app;
