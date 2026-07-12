import { Hono } from "hono";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import {
  clinic,
  clinicCustomerGroup,
  customerGroup,
  doctor,
  labProfile,
  priceListCategory,
  priceListItem,
} from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { requireLead, requirePerm, type AppContext } from "../auth";

const itemBody = z.object({
  code: z.string().trim().min(1, "Kód je povinný"),
  name: z.string().trim().min(1, "Název je povinný"),
  shortName: z.string().trim().min(1, "Zkrácený název je povinný"),
  categoryId: z.string().min(1, "Kategorie je povinná"),
  groupId: z.string().nullish(),
  /** Zdravotnický prostředek dle MDR (jde na štítek/prohlášení). */
  mdrDevice: z.boolean().default(true),
  /** null = běžná položka / single = na člen / bridge = můstek / arch = čelist. */
  kind: z.enum(["single", "bridge", "arch"]).nullish(),
  singleIndications: z.array(z.enum(["STUMP", "PONTIC", "IMPLANT"])).default([]),
  bridgeStumpPrice: z.number().int().min(0).nullish(),
  bridgePonticPrice: z.number().int().min(0).nullish(),
  bridgeImplantPrice: z.number().int().min(0).nullish(),
  /** Haléře. */
  price: z.number().int().min(0, "Cena musí být >= 0"),
  technicianFee: z.number().int().min(0, "Odměna musí být >= 0").default(0),
  productionDays: z.number().int().min(0).nullish(),
});

/** Konzistence typu položky (zod .extend() nejde kombinovat s .refine()). */
function kindError(body: z.infer<typeof itemBody>): string | null {
  if (body.kind === "single" && body.singleIndications.length === 0) {
    return "Položka na člen musí mít aspoň jednu indikaci.";
  }
  if (
    body.kind === "bridge" &&
    (body.bridgeStumpPrice == null ||
      body.bridgePonticPrice == null ||
      body.bridgeImplantPrice == null)
  ) {
    return "Můstek musí mít všechny tři členské ceny (pahýl, mezičlen, implantát).";
  }
  return null;
}

/** Doménové pravidlo: pomocná položka (bez vazby na zuby) není ZP. */
function coerceMdr<T extends { kind?: string | null; mdrDevice: boolean }>(body: T): T {
  if (!body.kind) body.mdrDevice = false;
  return body;
}

/** Kolize kódu mezi NEarchivovanými položkami (archivace uvolňuje namespace). */
async function codeConflict(
  db: ReturnType<typeof drizzle>,
  code: string,
  excludeId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: priceListItem.id })
    .from(priceListItem)
    .where(
      and(
        eq(priceListItem.code, code),
        eq(priceListItem.archived, false),
        excludeId ? ne(priceListItem.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

const app = new Hono<AppContext>();

// Mutace jen s oprávněním (GET zůstává pro všechny).
app.use("*", async (c, next) => {
  if (c.req.method !== "GET") {
    const err = requirePerm(c.get("me"), "priceListEdit", "úpravy ceníku");
    if (err) return apiError(c, 403, err.code, err.message);
  }
  await next();
});

/** LIST — s názvy kategorie/skupiny; default jen nearchivované. */
app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const includeArchived = c.req.query("includeArchived") === "1";

  const rows = await db
    .select({
      id: priceListItem.id,
      code: priceListItem.code,
      name: priceListItem.name,
      shortName: priceListItem.shortName,
      categoryId: priceListItem.categoryId,
      categoryName: priceListCategory.name,
      groupId: priceListItem.groupId,
      groupName: customerGroup.name,
      mdrDevice: priceListItem.mdrDevice,
      kind: priceListItem.kind,
      price: priceListItem.price,
      technicianFee: priceListItem.technicianFee,
      productionDays: priceListItem.productionDays,
      archived: priceListItem.archived,
    })
    .from(priceListItem)
    .innerJoin(priceListCategory, eq(priceListItem.categoryId, priceListCategory.id))
    .leftJoin(customerGroup, eq(priceListItem.groupId, customerGroup.id))
    .where(includeArchived ? undefined : eq(priceListItem.archived, false))
    .orderBy(asc(priceListItem.code));

  return c.json(rows);
});

/**
 * Ceník pro doktora (tisk/předání): položky viditelné jeho klinice
 * (skupiny kliniky, stejné pravidlo jako picker v zakázce) + hlavičkové
 * údaje laboratoře a doktora.
 */
app.get("/print/for-doctor", async (c) => {
  const doctorId = c.req.query("doctorId");
  if (!doctorId) return apiError(c, 400, "VALIDATION", "Chybí doctorId.");
  const db = drizzle(c.env.DB);

  const doc = await db
    .select({
      id: doctor.id,
      titlePrefix: doctor.titlePrefix,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      clinicId: doctor.clinicId,
      clinicName: clinic.companyName,
    })
    .from(doctor)
    .innerJoin(clinic, eq(doctor.clinicId, clinic.id))
    .where(eq(doctor.id, doctorId))
    .limit(1);
  if (!doc[0]) return apiError(c, 404, "NOT_FOUND", "Doktor nenalezen.");

  const groups = await db
    .select({ groupId: clinicCustomerGroup.groupId })
    .from(clinicCustomerGroup)
    .where(eq(clinicCustomerGroup.clinicId, doc[0].clinicId));
  const groupIds = groups.map((g) => g.groupId);

  const items = groupIds.length
    ? await db
        .select({
          id: priceListItem.id,
          code: priceListItem.code,
          name: priceListItem.name,
          kind: priceListItem.kind,
          price: priceListItem.price,
          bridgeStumpPrice: priceListItem.bridgeStumpPrice,
          bridgePonticPrice: priceListItem.bridgePonticPrice,
          bridgeImplantPrice: priceListItem.bridgeImplantPrice,
          categoryName: priceListCategory.name,
        })
        .from(priceListItem)
        .innerJoin(priceListCategory, eq(priceListItem.categoryId, priceListCategory.id))
        .where(
          and(
            eq(priceListItem.archived, false),
            inArray(priceListItem.groupId, groupIds),
          ),
        )
        .orderBy(asc(priceListCategory.name), asc(priceListItem.code))
    : [];

  const lab = await db.select().from(labProfile).limit(1);
  return c.json({ doctor: doc[0], lab: lab[0] ?? null, items });
});

app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(priceListItem)
    .where(eq(priceListItem.id, c.req.param("id")))
    .limit(1);
  if (!rows[0]) return apiError(c, 404, "NOT_FOUND", "Položka nenalezena.");
  return c.json(rows[0]);
});

app.post("/", async (c) => {
  const body = await parseBody(c, itemBody);
  if (body instanceof Response) return body;

  coerceMdr(body);
  const ke = kindError(body);
  if (ke) return apiError(c, 400, "VALIDATION", ke);

  const db = drizzle(c.env.DB);
  if (await codeConflict(db, body.code)) {
    return apiError(c, 409, "CODE_TAKEN", `Kód „${body.code}" už používá jiná aktivní položka.`);
  }

  const id = uuid();
  const ts = now();
  try {
    await db.insert(priceListItem).values({ id, ...body, createdAt: ts, updatedAt: ts });
  } catch (e) {
    // Check-then-act okno: souběžný zápis stejného kódu chytí unique index.
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "CODE_TAKEN", `Kód „${body.code}" už používá jiná aktivní položka.`);
    }
    throw e;
  }
  return c.json({ id }, 201);
});

app.put("/:id", async (c) => {
  const body = await parseBody(c, itemBody.extend({ archived: z.boolean().default(false) }));
  if (body instanceof Response) return body;

  coerceMdr(body);
  const ke = kindError(body);
  if (ke) return apiError(c, 400, "VALIDATION", ke);

  const db = drizzle(c.env.DB);
  const id = c.req.param("id");
  if (!body.archived && (await codeConflict(db, body.code, id))) {
    return apiError(c, 409, "CODE_TAKEN", `Kód „${body.code}" už používá jiná aktivní položka.`);
  }

  try {
    const res = await db
      .update(priceListItem)
      .set({ ...body, updatedAt: now() })
      .where(eq(priceListItem.id, id));
    if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Položka nenalezena.");
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "CODE_TAKEN", `Kód „${body.code}" už používá jiná aktivní položka.`);
    }
    throw e;
  }
  return c.json({ id });
});

/* ------------------------------------------------------------------ */
/*  XLSX import (payload = už naparsované řádky z FE)                   */
/* ------------------------------------------------------------------ */

const importRow = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  /** Název kategorie — neexistující se založí (komfort prvotního importu). */
  category: z.string().trim().min(1),
  /** Název skupiny — prázdné = bez skupiny (položka mimo picker). */
  group: z.string().trim().nullish(),
  price: z.number().int().min(0),
  technicianFee: z.number().int().min(0).default(0),
  productionDays: z.number().int().min(0).nullish(),
});

const importBody = z.object({
  rows: z.array(importRow).min(1, "Import je prázdný").max(2000, "Max 2000 řádků"),
});

app.post("/import", async (c) => {
  // Import sedí v Admin sekci → jen vedoucí.
  const leadErr = requireLead(c.get("me"));
  if (leadErr) return apiError(c, 403, leadErr.code, leadErr.message);
  const body = await parseBody(c, importBody);
  if (body instanceof Response) return body;
  const db = drizzle(c.env.DB);

  // Duplicitní kódy v souboru
  const seen = new Set<string>();
  for (const r of body.rows) {
    if (seen.has(r.code)) {
      return apiError(c, 409, "DUPLICATE_CODE", `Soubor obsahuje duplicitní kód „${r.code}".`);
    }
    seen.add(r.code);
  }

  // Kolize s existujícími aktivními kódy
  const codes = [...seen];
  const existing = await db
    .select({ code: priceListItem.code })
    .from(priceListItem)
    .where(and(eq(priceListItem.archived, false), inArray(priceListItem.code, codes)));
  if (existing.length > 0) {
    return apiError(
      c,
      409,
      "CODE_TAKEN",
      `Tyto kódy už v ceníku existují: ${existing.map((e) => e.code).join(", ")}`,
    );
  }

  // Auto-založení kategorií a skupin podle názvu (case-insensitive match)
  const cats = await db.select().from(priceListCategory);
  const groups = await db.select().from(customerGroup);
  const catByName = new Map(cats.map((x) => [x.name.toLowerCase(), x.id]));
  const groupByName = new Map(groups.map((x) => [x.name.toLowerCase(), x.id]));

  const newCats: { id: string; name: string }[] = [];
  const newGroups: { id: string; name: string }[] = [];
  for (const r of body.rows) {
    const catKey = r.category.toLowerCase();
    if (!catByName.has(catKey)) {
      const nc = { id: uuid(), name: r.category };
      catByName.set(catKey, nc.id);
      newCats.push(nc);
    }
    if (r.group) {
      const grpKey = r.group.toLowerCase();
      if (!groupByName.has(grpKey)) {
        const ng = { id: uuid(), name: r.group };
        groupByName.set(grpKey, ng.id);
        newGroups.push(ng);
      }
    }
  }

  const ts = now();
  const statements = [
    ...newCats.map((x) => db.insert(priceListCategory).values(x)),
    ...newGroups.map((x) => db.insert(customerGroup).values(x)),
    ...body.rows.map((r) =>
      db.insert(priceListItem).values({
        id: uuid(),
        code: r.code,
        name: r.name,
        shortName: r.shortName,
        categoryId: catByName.get(r.category.toLowerCase())!,
        groupId: r.group ? groupByName.get(r.group.toLowerCase())! : null,
        // Import zakládá položky bez vazby na zuby (pomocné) → nejsou ZP;
        // typ + MDR se nastaví při doplnění vazby v editaci.
        mdrDevice: false,
        price: r.price,
        technicianFee: r.technicianFee,
        productionDays: r.productionDays ?? null,
        createdAt: ts,
        updatedAt: ts,
      }),
    ),
  ];
  // All-or-nothing: db.batch je v D1 atomický.
  try {
    await db.batch(statements as [typeof statements[0], ...typeof statements]);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return apiError(c, 409, "CODE_TAKEN", "Některý kód mezitím obsadila jiná položka — obnov stránku a zkus znovu.");
    }
    throw e;
  }

  return c.json({
    insertedItems: body.rows.length,
    createdCategories: newCats.length,
    createdGroups: newGroups.length,
  });
});

export default app;
