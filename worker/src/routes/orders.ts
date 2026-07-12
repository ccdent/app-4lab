import { Hono } from "hono";
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";
import {
  attachment,
  clinic,
  clinicCustomerGroup,
  doctor,
  doctorPreference,
  instruction,
  labProfile,
  orderItem,
  orderNote,
  orderOralCavity,
  orderStateLog,
  orders,
  preferenceOption,
  priceListCategory,
  priceListItem,
  shippingMethod,
  technician,
  type OrderState,
} from "../db/schema";
import { apiError, now, parseBody, uuid } from "../lib/http";
import { countPendingProposals, syncProposalsForOrder } from "./orderMaterials";
import { canAccessOrder, type AppContext } from "../auth";

/* ------------------------------------------------------------------ */
/*  Validace                                                            */
/* ------------------------------------------------------------------ */

const ORDER_STATES = ["new", "accepted", "in_progress", "try_in", "done", "storno"] as const;

const itemSnapshot = z.object({
  /** Při editaci: existující id řádku (diff save — zachovat identitu). */
  id: z.string().nullish(),
  priceListItemId: z.string().nullish(),
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  shortName: z.string().trim().min(1),
  unitPrice: z.number().int().min(0),
  technicianFee: z.number().int().min(0).default(0),
  quantity: z.number().int().min(1).default(1),
  /** Snapshot MDR příznaku (jen ZP jdou na štítek/prohlášení). */
  mdrDevice: z.boolean().default(true),
  /** Lokalizace = SN suffix: zub "21" / můstek "13-23" / čelist "01"|"02". */
  localization: z
    .string()
    .trim()
    .regex(/^\d{2}(-\d{2})?$/, "Lokalizace musí být zub (21), můstek (13-23) nebo čelist (01/02)")
    .nullish(),
  bridgeId: z.string().nullish(),
});

const oralCavityBody = z.object({
  colorMode: z.enum(["NO_COLOR_REQUIRED", "LAB_TO_CHOOSE", "SHADE"]).default("NO_COLOR_REQUIRED"),
  colorShade: z.string().trim().nullish(),
  /** OralCavityValue v2 — FE je jediný validátor obsahu (vzor crm-mvp). */
  pickerState: z.unknown().default({}),
});

const orderBody = z.object({
  clinicId: z.string().min(1, "Klinika je povinná"),
  doctorId: z.string().min(1, "Doktor je povinný"),
  patientName: z.string().trim().min(1, "Pacient je povinný"),
  completionDueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Termín musí být ISO datum"),
  tryInDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  assignedTechnicianId: z.string().nullish(),
  priceAdjustmentAmount: z.number().int().default(0),
  priceAdjustmentReason: z.string().trim().nullish(),
  shippingMethodId: z.string().nullish(),
  shippingPrice: z.number().int().min(0).default(0),
  shippingCharged: z.boolean().default(false),
  note: z.string().trim().nullish(),
  items: z.array(itemSnapshot).default([]),
  oralCavity: oralCavityBody.default(() => ({
    colorMode: "NO_COLOR_REQUIRED" as const,
    colorShade: null,
    pickerState: {},
  })),
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

type OrderBodyT = z.infer<typeof orderBody>;

/**
 * Server je zdroj pravdy pro identitu položky: code/name/shortName/mdrDevice
 * se přepíšou z ceníku (klientovi se věří jen cena — ta je na zakázce
 * záměrně editovatelná — množství, lokalizace a vazba na ceník).
 * Vrací text chyby, nebo null když je vše OK. Mutuje body.items.
 */
async function validateOrderRelations(
  db: ReturnType<typeof drizzle>,
  body: OrderBodyT,
): Promise<string | null> {
  const doc = await db
    .select({ clinicId: doctor.clinicId })
    .from(doctor)
    .where(eq(doctor.id, body.doctorId))
    .limit(1);
  if (!doc[0]) return "Doktor neexistuje.";
  if (doc[0].clinicId !== body.clinicId) return "Doktor nepatří k vybrané klinice.";

  const refIds = [...new Set(body.items.map((i) => i.priceListItemId).filter(Boolean))] as string[];
  const rows = refIds.length
    ? await db
        .select({
          id: priceListItem.id,
          code: priceListItem.code,
          name: priceListItem.name,
          shortName: priceListItem.shortName,
          mdrDevice: priceListItem.mdrDevice,
          technicianFee: priceListItem.technicianFee,
        })
        .from(priceListItem)
        .where(inArray(priceListItem.id, refIds))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const i of body.items) {
    const src = i.priceListItemId ? byId.get(i.priceListItemId) : undefined;
    if (i.priceListItemId && !src) return "Položka ceníku neexistuje.";
    if (src) {
      i.code = src.code;
      i.name = src.name;
      i.shortName = src.shortName;
      i.mdrDevice = src.mdrDevice;
      // Odměna technika živí Vyúčtování — NIKDY z klienta.
      i.technicianFee = src.technicianFee;
    } else {
      // Bez vazby na ceník nelze ZP status ověřit → nikdy ZP, nulová odměna.
      i.mdrDevice = false;
      i.technicianFee = 0;
    }
    if (i.mdrDevice && !i.localization) {
      return `Položka „${i.shortName}" je ZP a musí mít lokalizaci (SN).`;
    }
  }
  return null;
}

type Db = ReturnType<typeof drizzle>;

/**
 * Další volné číslo zakázky `<prefix>NNNN` — sekvence běží per prefix.
 * Prefix dle nastavení laboratoře: 'year' = `RRRR-` (na Nový rok se
 * automaticky přepne a sekvence začne od 0001), 'custom' = vlastní text.
 */
async function nextOrderNumber(db: Db): Promise<string> {
  const lab = await db
    .select({ mode: labProfile.orderPrefixMode, custom: labProfile.orderPrefix })
    .from(labProfile)
    .limit(1);
  const prefix =
    lab[0]?.mode === "custom" && lab[0].custom
      ? lab[0].custom
      : `${new Date().getFullYear()}-`;
  // MAX přes CAST — řetězcové řazení by po '9999' vracelo špatné maximum
  // ('10000' < '9999' lexikálně) a sekvence by se zasekla na kolizi.
  const last = await db
    .select({
      maxSeq: sql<number | null>`MAX(CAST(substr(order_number, ${prefix.length + 1}) AS INTEGER))`,
    })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`));
  const lastSeq = last[0]?.maxSeq ?? 0;
  return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

async function loadOrder(db: Db, id: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Routes                                                              */
/* ------------------------------------------------------------------ */

const app = new Hono<AppContext>();

/** LIST — join jmen; filtry řeší FE (malé objemy), stavy přes query. */
app.get("/", async (c) => {
  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const stateParam = c.req.query("state");
  const states = stateParam
    ? (stateParam.split(",").filter((s) => (ORDER_STATES as readonly string[]).includes(s)) as OrderState[])
    : null;

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      state: orders.state,
      isBilled: orders.isBilled,
      patientName: orders.patientName,
      completionDueAt: orders.completionDueAt,
      doneAt: orders.doneAt,
      clinicId: orders.clinicId,
      clinicName: clinic.companyName,
      clinicColor: clinic.color,
      doctorId: orders.doctorId,
      doctorTitlePrefix: doctor.titlePrefix,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      assignedTechnicianId: orders.assignedTechnicianId,
      technicianFirstName: technician.firstName,
      technicianLastName: technician.lastName,
      createdAt: orders.createdAt,
      itemsTotal: sql<number>`(SELECT COALESCE(SUM(unit_price * quantity), 0) FROM order_item WHERE order_item.order_id = orders.id)`,
      /** Náhled obsahu: „2× Korunka CK (21), Můstek CK (13-23)" (zkrácené názvy + lokalizace). */
      itemsSummary: sql<string | null>`(SELECT GROUP_CONCAT((CASE WHEN quantity > 1 THEN quantity || '× ' || short_name ELSE short_name END) || (CASE WHEN localization IS NOT NULL AND localization != '' THEN ' (' || localization || ')' ELSE '' END), ', ') FROM order_item WHERE order_item.order_id = orders.id)`,
    })
    .from(orders)
    .innerJoin(clinic, eq(orders.clinicId, clinic.id))
    .innerJoin(doctor, eq(orders.doctorId, doctor.id))
    .leftJoin(technician, eq(orders.assignedTechnicianId, technician.id))
    .where(
      and(
        states ? inArray(orders.state, states) : undefined,
        // Technik bez „vidí vše": jen vlastní + nepřiřazené zakázky.
        me.role !== "lead" && !me.perms.ordersViewAll
          ? sql`(${orders.assignedTechnicianId} IS NULL OR ${orders.assignedTechnicianId} = ${me.id})`
          : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt));

  return c.json(rows);
});

/** Picker položek ceníku pro zakázku dané kliniky (filtr podle skupin). */
app.get("/picker-items", async (c) => {
  const db = drizzle(c.env.DB);
  const clinicId = c.req.query("clinicId");
  if (!clinicId) return apiError(c, 400, "VALIDATION", "Chybí clinicId.");

  const groups = await db
    .select({ groupId: clinicCustomerGroup.groupId })
    .from(clinicCustomerGroup)
    .where(eq(clinicCustomerGroup.clinicId, clinicId));
  const groupIds = groups.map((g) => g.groupId);
  if (groupIds.length === 0) return c.json([]);

  const rows = await db
    .select({
      id: priceListItem.id,
      code: priceListItem.code,
      name: priceListItem.name,
      shortName: priceListItem.shortName,
      price: priceListItem.price,
      technicianFee: priceListItem.technicianFee,
      mdrDevice: priceListItem.mdrDevice,
      kind: priceListItem.kind,
      singleIndications: priceListItem.singleIndications,
      bridgeStumpPrice: priceListItem.bridgeStumpPrice,
      bridgePonticPrice: priceListItem.bridgePonticPrice,
      bridgeImplantPrice: priceListItem.bridgeImplantPrice,
    })
    .from(priceListItem)
    .where(and(eq(priceListItem.archived, false), inArray(priceListItem.groupId, groupIds)))
    .orderBy(asc(priceListItem.code));

  return c.json(rows);
});

/** DETAIL — komplet: položky, mapa zubů, můstky, poznámky, log, preference doktora. */
app.get("/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const order = await db
    .select({
      order: orders,
      clinicName: clinic.companyName,
      clinicColor: clinic.color,
      doctorTitlePrefix: doctor.titlePrefix,
      doctorFirstName: doctor.firstName,
      doctorLastName: doctor.lastName,
      technicianFirstName: technician.firstName,
      technicianLastName: technician.lastName,
      shippingMethodName: shippingMethod.name,
    })
    .from(orders)
    .innerJoin(clinic, eq(orders.clinicId, clinic.id))
    .innerJoin(doctor, eq(orders.doctorId, doctor.id))
    .leftJoin(technician, eq(orders.assignedTechnicianId, technician.id))
    .leftJoin(shippingMethod, eq(orders.shippingMethodId, shippingMethod.id))
    .where(eq(orders.id, id))
    .limit(1);
  const head = order[0];
  if (!head) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");

  const [items, cavity, notes, stateLog, prefs, attachments] = await Promise.all([
    db.select().from(orderItem).where(eq(orderItem.orderId, id)).orderBy(asc(orderItem.createdAt)),
    db.select().from(orderOralCavity).where(eq(orderOralCavity.orderId, id)),
    db
      .select({
        id: orderNote.id,
        body: orderNote.body,
        createdAt: orderNote.createdAt,
        authorFirstName: technician.firstName,
        authorLastName: technician.lastName,
      })
      .from(orderNote)
      .innerJoin(technician, eq(orderNote.createdBy, technician.id))
      .where(eq(orderNote.orderId, id))
      .orderBy(desc(orderNote.createdAt)),
    db
      .select({
        id: orderStateLog.id,
        fromState: orderStateLog.fromState,
        toState: orderStateLog.toState,
        changedAt: orderStateLog.changedAt,
        changedByFirstName: technician.firstName,
        changedByLastName: technician.lastName,
      })
      .from(orderStateLog)
      .innerJoin(technician, eq(orderStateLog.changedBy, technician.id))
      .where(eq(orderStateLog.orderId, id))
      .orderBy(desc(orderStateLog.changedAt)),
    db
      .select({ label: preferenceOption.label })
      .from(doctorPreference)
      .innerJoin(preferenceOption, eq(doctorPreference.optionId, preferenceOption.id))
      .where(eq(doctorPreference.doctorId, head.order.doctorId)),
    db
      .select({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        previewR2Key: attachment.previewR2Key,
        createdAt: attachment.createdAt,
      })
      .from(attachment)
      .where(eq(attachment.orderId, id))
      .orderBy(desc(attachment.createdAt)),
  ]);

  return c.json({
    ...head.order,
    clinicName: head.clinicName,
    clinicColor: head.clinicColor,
    doctorTitlePrefix: head.doctorTitlePrefix,
    doctorFirstName: head.doctorFirstName,
    doctorLastName: head.doctorLastName,
    technicianFirstName: head.technicianFirstName,
    technicianLastName: head.technicianLastName,
    shippingMethodName: head.shippingMethodName,
    items,
    oralCavity: cavity[0] ?? null,
    notes,
    stateLog,
    doctorPreferences: prefs.map((p) => p.label),
    attachments,
  });
});

/** CREATE — order + items + oral cavity v jednom batchi. */
app.post("/", async (c) => {
  const body = await parseBody(c, orderBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const me = c.get("me");

  // Bez oprávnění „zadávat za ostatní" jde zakázka vždy na autora.
  if (me.role !== "lead" && !me.perms.ordersCreateForOthers) {
    body.assignedTechnicianId = me.id;
  }

  const relErr = await validateOrderRelations(db, body);
  if (relErr) return apiError(c, 400, "VALIDATION", relErr);

  const id = uuid();
  const ts = now();
  const { items, oralCavity, ...fields } = body;

  // Přiřazený technik při založení = rovnou přijatá (auto-accept, vzor crm-mvp).
  const initialState: OrderState = fields.assignedTechnicianId ? "accepted" : "new";

  // Číslo zakázky: retry na kolizi UNIQUE (souběžné založení).
  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = await nextOrderNumber(db);
    const statements = [
      db.insert(orders).values({
        id,
        orderNumber,
        state: initialState,
        ...fields,
        createdBy: me.id,
        createdAt: ts,
        updatedAt: ts,
      }),
      db.insert(orderOralCavity).values({
        orderId: id,
        colorMode: oralCavity.colorMode,
        colorShade: oralCavity.colorShade ?? null,
        pickerState: oralCavity.pickerState ?? {},
      }),
      ...items.map((i) =>
        db.insert(orderItem).values({
          id: uuid(),
          orderId: id,
          priceListItemId: i.priceListItemId ?? null,
          code: i.code,
          name: i.name,
          shortName: i.shortName,
          unitPrice: i.unitPrice,
          technicianFee: i.technicianFee,
          quantity: i.quantity,
          mdrDevice: i.mdrDevice,
          localization: i.localization ?? null,
          bridgeId: i.bridgeId ?? null,
          createdAt: ts,
        }),
      ),
      ...(initialState !== "new"
        ? [
            db.insert(orderStateLog).values({
              id: uuid(),
              orderId: id,
              fromState: "new",
              toState: initialState,
              changedBy: me.id,
              changedAt: ts,
            }),
          ]
        : []),
    ];
    try {
      await db.batch(statements as [typeof statements[0], ...typeof statements]);
      return c.json({ id, orderNumber }, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (attempt < 2 && msg.includes("UNIQUE")) continue; // kolize čísla → nové
      throw e;
    }
  }
  return apiError(c, 409, "ORDER_NUMBER_RACE", "Nepodařilo se přidělit číslo zakázky, zkus znovu.");
});

/** UPDATE — hlavička + diff-save položek + mapa zubů. */
app.put("/:id", async (c) => {
  const body = await parseBody(c, orderBody);
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const id = c.req.param("id");

  const existing = await loadOrder(db, id);
  if (!existing) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  if (!canAccessOrder(me, existing.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  if (existing.isBilled) {
    return apiError(c, 409, "BILLED", "Vyfakturovaná zakázka je zamčená.");
  }
  // Bez oprávnění „zadávat za ostatní": změna přiřazení jen self-claim
  // nepřiřazené zakázky; cokoli jiného (vč. převzetí cizí) → 403.
  if (me.role !== "lead" && !me.perms.ordersCreateForOthers) {
    const cur = existing.assignedTechnicianId ?? null;
    const req = body.assignedTechnicianId ?? null;
    const selfClaim = cur === null && req === me.id;
    if (req !== cur && !selfClaim) {
      return apiError(
        c,
        403,
        "FORBIDDEN",
        "Bez oprávnění „zadávat za ostatní“ nemůžeš měnit přiřazení zakázky.",
      );
    }
  }

  const relErr = await validateOrderRelations(db, body);
  if (relErr) return apiError(c, 400, "VALIDATION", relErr);

  const { items, oralCavity, ...fields } = body;
  const ts = now();

  // Diff-save položek: zachovat identitu řádků (vazby materiálů/logu se netrhají).
  const currentItems = await db
    .select({ id: orderItem.id })
    .from(orderItem)
    .where(eq(orderItem.orderId, id));
  const currentIds = new Set(currentItems.map((i) => i.id));
  const keptIds = new Set(items.filter((i) => i.id && currentIds.has(i.id)).map((i) => i.id!));
  const toDelete = [...currentIds].filter((x) => !keptIds.has(x));

  // Auto-přijetí: první přiřazení technika na nové zakázce (jednosměrné).
  const autoAccept =
    existing.state === "new" &&
    !existing.assignedTechnicianId &&
    Boolean(fields.assignedTechnicianId);

  const statements = [
    db
      .update(orders)
      .set({ ...fields, ...(autoAccept ? { state: "accepted" as OrderState } : {}), updatedAt: ts })
      .where(eq(orders.id, id)),
    // Oral cavity: upsert (řádek existuje od create, ale pojistka).
    db
      .insert(orderOralCavity)
      .values({
        orderId: id,
        colorMode: oralCavity.colorMode,
        colorShade: oralCavity.colorShade ?? null,
        pickerState: oralCavity.pickerState ?? {},
      })
      .onConflictDoUpdate({
        target: orderOralCavity.orderId,
        set: {
          colorMode: oralCavity.colorMode,
          colorShade: oralCavity.colorShade ?? null,
          pickerState: oralCavity.pickerState ?? {},
        },
      }),
    ...(toDelete.length
      ? [db.delete(orderItem).where(inArray(orderItem.id, toDelete))]
      : []),
    ...items.map((i) => {
      if (i.id && currentIds.has(i.id)) {
        return db
          .update(orderItem)
          .set({
            priceListItemId: i.priceListItemId ?? null,
            code: i.code,
            name: i.name,
            shortName: i.shortName,
            unitPrice: i.unitPrice,
            technicianFee: i.technicianFee,
            quantity: i.quantity,
            mdrDevice: i.mdrDevice,
            localization: i.localization ?? null,
            bridgeId: i.bridgeId ?? null,
          })
          .where(eq(orderItem.id, i.id));
      }
      return db.insert(orderItem).values({
        id: uuid(),
        orderId: id,
        priceListItemId: i.priceListItemId ?? null,
        code: i.code,
        name: i.name,
        shortName: i.shortName,
        unitPrice: i.unitPrice,
        technicianFee: i.technicianFee,
        quantity: i.quantity,
        mdrDevice: i.mdrDevice,
        localization: i.localization ?? null,
        bridgeId: i.bridgeId ?? null,
        createdAt: ts,
      });
    }),
    ...(autoAccept
      ? [
          db.insert(orderStateLog).values({
            id: uuid(),
            orderId: id,
            fromState: "new",
            toState: "accepted",
            changedBy: me.id,
            changedAt: ts,
          }),
        ]
      : []),
  ];
  await db.batch(statements as [typeof statements[0], ...typeof statements]);

  return c.json({ id });
});

/** Přechod stavu: nebilled = volný, billed = jen done ↔ storno. */
app.post("/:id/state", async (c) => {
  const body = await parseBody(c, z.object({ state: z.enum(ORDER_STATES) }));
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const id = c.req.param("id");

  const existing = await loadOrder(db, id);
  if (!existing) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  if (!canAccessOrder(me, existing.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  if (existing.state === body.state) return c.json({ id, state: body.state });

  if (existing.isBilled) {
    const allowed =
      (existing.state === "done" && body.state === "storno") ||
      (existing.state === "storno" && body.state === "done");
    if (!allowed) {
      return apiError(c, 409, "BILLED", "U vyfakturované zakázky lze jen přepínat done ↔ storno.");
    }
  }

  // Hard gate (volitelný v profilu laboratoře): Dokončeno vyžaduje vyřešené
  // návrhy materiálů. Před kontrolou se spustí sync — pending nesmí proklouznout
  // přes neproběhlý FE sync. Billed přeskakuje (návrhy tam nejde řešit).
  if (body.state === "done" && !existing.isBilled) {
    const lab = await db
      .select({ enforce: labProfile.enforceMaterialProposalsOnDone })
      .from(labProfile)
      .limit(1);
    if (lab[0]?.enforce) {
      await syncProposalsForOrder(db, id, me.id);
      const pending = await countPendingProposals(db, id);
      if (pending > 0) {
        return apiError(
          c,
          409,
          "PENDING_MATERIAL_PROPOSALS",
          "Zakázku nelze dokončit — materiálové složení není kompletní (nevyřešené návrhy z receptů).",
        );
      }
    }
  }

  const ts = now();
  // done_at: nastavit při vstupu do done, vynulovat při odchodu (čte Odmakáno).
  const doneAt = body.state === "done" ? ts : existing.state === "done" ? null : existing.doneAt;

  await db.batch([
    db.update(orders).set({ state: body.state, doneAt, updatedAt: ts }).where(eq(orders.id, id)),
    db.insert(orderStateLog).values({
      id: uuid(),
      orderId: id,
      fromState: existing.state,
      toState: body.state,
      changedBy: me.id,
      changedAt: ts,
    }),
  ]);

  return c.json({ id, state: body.state });
});

/** Interní poznámka. */
app.post("/:id/notes", async (c) => {
  const body = await parseBody(c, z.object({ body: z.string().trim().min(1, "Poznámka je prázdná") }));
  if (body instanceof Response) return body;

  const db = drizzle(c.env.DB);
  const me = c.get("me");
  const id = c.req.param("id");

  const existing = await loadOrder(db, id);
  if (!existing) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  if (!canAccessOrder(me, existing.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }

  const noteId = uuid();
  await db.insert(orderNote).values({
    id: noteId,
    orderId: id,
    body: body.body,
    createdBy: me.id,
    createdAt: now(),
  });
  return c.json({ id: noteId }, 201);
});

/** Smazání interní poznámky (hard delete — interní evidence). */
app.delete("/:id/notes/:noteId", async (c) => {
  const db = drizzle(c.env.DB);
  const existing = await loadOrder(db, c.req.param("id"));
  if (existing && !canAccessOrder(c.get("me"), existing.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "Tahle zakázka patří jinému technikovi.");
  }
  const res = await db
    .delete(orderNote)
    .where(
      and(eq(orderNote.id, c.req.param("noteId")), eq(orderNote.orderId, c.req.param("id"))),
    );
  if (res.meta.changes === 0) return apiError(c, 404, "NOT_FOUND", "Poznámka nenalezena.");
  return c.body(null, 204);
});

/* ------------------------------------------------------------------ */
/*  Návody pro tisk prohlášení                                          */
/* ------------------------------------------------------------------ */

/**
 * Návody k použití pro zakázku: řetěz položka zakázky → ceník → kategorie →
 * návod. Jen MDR položky a nearchivované návody; dedup na návod, itemIds
 * slouží frontendu k doplnění SN (číslo zakázky/lokalizace).
 */
app.get("/:id/instructions", async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param("id");

  const existing = (
    await db
      .select({ assignedTechnicianId: orders.assignedTechnicianId })
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1)
  )[0];
  if (!existing) return apiError(c, 404, "NOT_FOUND", "Zakázka nenalezena.");
  if (!canAccessOrder(c.get("me"), existing.assignedTechnicianId)) {
    return apiError(c, 403, "FORBIDDEN", "K této zakázce nemáš přístup.");
  }

  const rows = await db
    .select({
      instructionId: instruction.id,
      name: instruction.name,
      htmlContent: instruction.htmlContent,
      itemId: orderItem.id,
      itemCreatedAt: orderItem.createdAt,
    })
    .from(orderItem)
    .innerJoin(priceListItem, eq(orderItem.priceListItemId, priceListItem.id))
    .innerJoin(priceListCategory, eq(priceListItem.categoryId, priceListCategory.id))
    .innerJoin(instruction, eq(priceListCategory.instructionId, instruction.id))
    .where(
      and(
        eq(orderItem.orderId, id),
        eq(orderItem.mdrDevice, true),
        eq(instruction.archived, false),
      ),
    )
    // Tiebreak id: položky z jednoho save sdílejí created_at — bez něj by SN
    // na prohlášení mohly mezi tisky měnit pořadí.
    .orderBy(asc(orderItem.createdAt), asc(orderItem.id), asc(instruction.name));

  // Dedup na návod, pořadí podle prvního výskytu položky (deterministické).
  const byId = new Map<string, { id: string; name: string; htmlContent: string; itemIds: string[] }>();
  for (const r of rows) {
    const entry = byId.get(r.instructionId);
    if (entry) entry.itemIds.push(r.itemId);
    else byId.set(r.instructionId, { id: r.instructionId, name: r.name, htmlContent: r.htmlContent, itemIds: [r.itemId] });
  }
  return c.json([...byId.values()]);
});

export default app;
