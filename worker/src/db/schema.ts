// =============================================================================
// D1 (SQLite) schéma — app.4lab.cz
// =============================================================================
// Doménový model přenesený z referenčního repa crm-mvp a zjednodušený dle
// docs/kontext-handoff.md + docs/molarlabliterozsah.xlsx:
//   - jedna role (technik), žádné RLS ekvivalenty
//   - snapshot princip: order_item a order_material_usage nesou kopii dat
//     z ceníku/katalogu v okamžiku použití — změna číselníku nemění historii
//   - picker_state (mapa zubů) ve formátu v2 1:1 z crm-mvp oral-cavity-model.md
//
// Konvence:
//   - id = uuid text, generuje Worker (crypto.randomUUID())
//   - peníze = INTEGER v haléřích (SQLite nemá NUMERIC)
//   - kalendářní datum = text ISO "YYYY-MM-DD"; timestamp = INTEGER unix ms
//   - boolean = INTEGER {mode: boolean}
// =============================================================================

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ */
/*  Lidé a adresář                                                     */
/* ------------------------------------------------------------------ */

/** Laboratorní účet — identita přichází z Cloudflare Access (e-mail). */
export const technician = sqliteTable("technician", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  /** technician = vidí ve Vyúčtování jen sebe; lead = vidí všechny + správa rolí/hesel. */
  role: text("role").$type<"technician" | "lead">().notNull().default("technician"),
  /** Zámek Vyúčtování (salt:sha256) — NENÍ security, jen proti pohledu přes rameno. */
  payrollPasswordHash: text("payroll_password_hash"),
  // Granulární oprávnění (jen pro roli technician; lead má vždy vše):
  permOrdersViewAll: integer("perm_orders_view_all", { mode: "boolean" }).notNull().default(true),
  permOrdersCreateForOthers: integer("perm_orders_create_for_others", { mode: "boolean" }).notNull().default(true),
  permDoctorsEdit: integer("perm_doctors_edit", { mode: "boolean" }).notNull().default(true),
  permPriceListEdit: integer("perm_price_list_edit", { mode: "boolean" }).notNull().default(true),
  permMaterialsEdit: integer("perm_materials_edit", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Singleton (1 řádek, id='lab') — údaje laborky pro hlavičky tisků. */
export const labProfile = sqliteTable("lab_profile", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  street: text("street").notNull().default(""),
  city: text("city").notNull().default(""),
  zip: text("zip").notNull().default(""),
  ico: text("ico").notNull().default(""),
  dic: text("dic"),
  phone: text("phone"),
  email: text("email"),
  /** Číslování zakázek: 'year' = prefix dle roku (auto), 'custom' = vlastní. */
  orderPrefixMode: text("order_prefix_mode").$type<"year" | "custom">().notNull().default("year"),
  orderPrefix: text("order_prefix").notNull().default(""),
  /** Vlastní logo v hlavičce aplikace (R2 klíč) — NULL = výchozí 4lab. */
  logoR2Key: text("logo_r2_key"),
  logoContentType: text("logo_content_type"),
  logoUpdatedAt: integer("logo_updated_at"),
  /** Tisky (prohlášení, štítek, DL) v jazyce aplikace; vypnuto = vždy česky. */
  printInAppLanguage: integer("print_in_app_language", { mode: "boolean" })
    .notNull()
    .default(true),
  /** Hard gate: Dokončeno vyžaduje vyřešené návrhy materiálů z receptů. */
  enforceMaterialProposalsOnDone: integer("enforce_material_proposals_on_done", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at").notNull(),
});

export const clinic = sqliteTable("clinic", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  street: text("street").notNull().default(""),
  city: text("city").notNull().default(""),
  zip: text("zip").notNull().default(""),
  ico: text("ico").notNull().default(""),
  dic: text("dic"),
  phone: text("phone"),
  email: text("email"),
  contactPersonName: text("contact_person_name"),
  /** UI barva kliniky (hex) — vizuální rozlišení v seznamech. */
  color: text("color").notNull().default("#4FB6B2"),
  note: text("note"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const doctor = sqliteTable(
  "doctor",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id),
    titlePrefix: text("title_prefix"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    note: text("note"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_doctor_clinic").on(t.clinicId)],
);

/** Číselník preferenčních možností (chips) — „co má doktor rád/nerad". */
export const preferenceOption = sqliteTable("preference_option", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const doctorPreference = sqliteTable(
  "doctor_preference",
  {
    doctorId: text("doctor_id")
      .notNull()
      .references(() => doctor.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => preferenceOption.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.doctorId, t.optionId] })],
);

/* ------------------------------------------------------------------ */
/*  Ceník                                                              */
/* ------------------------------------------------------------------ */

/** Návod k použití ZP pro pacienta — HTML obsah, tiskne se v prohlášení. */
export const instruction = sqliteTable("instruction", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  htmlContent: text("html_content").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const priceListCategory = sqliteTable("price_list_category", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** 0..1 návod na kategorii; víc kategorií může sdílet jeden návod. */
  instructionId: text("instruction_id").references(() => instruction.id),
});

/** Skupiny řídí viditelnost položek v pickeru podle kliniky. */
export const customerGroup = sqliteTable("customer_group", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  note: text("note"),
  /** Výchozí skupina — předvyplní se u nové položky ceníku a nové kliniky. */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const clinicCustomerGroup = sqliteTable(
  "clinic_customer_group",
  {
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => customerGroup.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.groupId] })],
);

/**
 * Typ položky vůči mapě zubů:
 *   null     = běžná položka bez lokalizace
 *   "single" = na samostatný člen (multiselect indikací v singleIndications)
 *   "bridge" = na můstek — cena se skládá z členských částek dle stavů zubů
 *   "arch"   = na celou čelist (cena = price za jednu čelist)
 */
export type PriceListItemKind = "single" | "bridge" | "arch";

/** Indikace členové položky — mapují se na stavy zubů v pickeru. */
export type SingleIndication = "STUMP" | "PONTIC" | "IMPLANT";

export const priceListItem = sqliteTable(
  "price_list_item",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => priceListCategory.id),
    /** NULL = položka se nikdy nezobrazuje v pickeru (interní/dummy). */
    groupId: text("group_id").references(() => customerGroup.id),
    /** Zdravotnický prostředek dle MDR — jen tyto jdou na štítek/prohlášení. */
    mdrDevice: integer("mdr_device", { mode: "boolean" }).notNull().default(true),
    kind: text("kind").$type<PriceListItemKind>(),
    /** Jen kind=single: pro které stavy zubu se položka nabízí. */
    singleIndications: text("single_indications", { mode: "json" })
      .$type<SingleIndication[]>()
      .notNull()
      .default(sql`'[]'`),
    /** Jen kind=bridge: částka za člen dle stavu zubu (haléře). */
    bridgeStumpPrice: integer("bridge_stump_price"),
    bridgePonticPrice: integer("bridge_pontic_price"),
    bridgeImplantPrice: integer("bridge_implant_price"),
    /** Cena v haléřích. */
    price: integer("price").notNull(),
    /** Odměna technika (podíl z obratu) v haléřích — snapshotuje se do položek. */
    technicianFee: integer("technician_fee").notNull().default(0),
    productionDays: integer("production_days"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    // Archivace uvolňuje code namespace (vzor crm-mvp migrace 00092).
    uniqueIndex("uq_price_list_item_code_active")
      .on(t.code)
      .where(sql`archived = 0`),
    index("idx_price_list_item_category").on(t.categoryId),
    index("idx_price_list_item_group").on(t.groupId),
  ],
);

/* ------------------------------------------------------------------ */
/*  Zakázky                                                            */
/* ------------------------------------------------------------------ */

export type OrderState =
  | "new"
  | "accepted"
  | "in_progress"
  | "try_in"
  | "done"
  | "storno";

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** Lidské číslo zakázky `RRRR-NNNN`, generuje Worker sekvenčně. */
    orderNumber: text("order_number").notNull().unique(),
    state: text("state").$type<OrderState>().notNull().default("new"),
    /** Fakturace: billed zakázka je zamčená (jen done ↔ storno). */
    isBilled: integer("is_billed", { mode: "boolean" }).notNull().default(false),
    billedAt: integer("billed_at"),
    clinicId: text("clinic_id")
      .notNull()
      .references(() => clinic.id),
    doctorId: text("doctor_id")
      .notNull()
      .references(() => doctor.id),
    patientName: text("patient_name").notNull(),
    /** Termín dokončení — ISO datum. */
    completionDueAt: text("completion_due_at").notNull(),
    /** Termíny zkoušek — JSON pole ISO datumů (informativní). */
    tryInDates: text("try_in_dates", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    assignedTechnicianId: text("assigned_technician_id").references(
      () => technician.id,
    ),
    /** Nastavuje/nuluje Worker při přechodu do/z done (unix ms). */
    doneAt: integer("done_at"),
    /** Sleva/příplatek pevnou částkou v haléřích (záporná = sleva). */
    priceAdjustmentAmount: integer("price_adjustment_amount").notNull().default(0),
    priceAdjustmentReason: text("price_adjustment_reason"),
    /** Doprava — jen evidenční pole + volitelná účtovaná cena do podkladů. */
    shippingMethodId: text("shipping_method_id").references(() => shippingMethod.id),
    /** Cena dopravy v haléřích. */
    shippingPrice: integer("shipping_price").notNull().default(0),
    /** Jen účtovaná doprava vstupuje do fakturovatelné částky. */
    shippingCharged: integer("shipping_charged", { mode: "boolean" })
      .notNull()
      .default(false),
    note: text("note"),
    createdBy: text("created_by")
      .notNull()
      .references(() => technician.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("idx_orders_state").on(t.state),
    index("idx_orders_clinic").on(t.clinicId),
    index("idx_orders_doctor").on(t.doctorId),
    index("idx_orders_technician").on(t.assignedTechnicianId),
    index("idx_orders_done_at").on(t.doneAt),
  ],
);

export const orderItem = sqliteTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Živý odkaz jen informativní — pravda je ve snapshot polích níže. */
    priceListItemId: text("price_list_item_id").references(() => priceListItem.id),
    // Snapshot z ceníku v okamžiku vložení (změna ceníku nemění historii):
    code: text("code").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    /** Jednotková cena v haléřích (snapshot). */
    unitPrice: integer("unit_price").notNull(),
    /** Odměna technika za kus v haléřích (snapshot) — čte Odmakáno. */
    technicianFee: integer("technician_fee").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    /** Snapshot MDR příznaku — jen ZP jdou na štítek a prohlášení. */
    mdrDevice: integer("mdr_device", { mode: "boolean" }).notNull().default(true),
    /**
     * Lokalizace výrobku = druhá část sériového čísla (číslo zakázky/lokalizace):
     * člen = číslo zubu ("21"), můstek = rozsah v pořadí oblouku ("13-23"),
     * čelist = "01" horní / "02" dolní. NULL = běžná položka bez lokalizace.
     */
    localization: text("localization"),
    /** Vazba na můstek — id z picker_state.bridges[].id (bez FK, aplikačně). */
    bridgeId: text("bridge_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_order_item_order").on(t.orderId)],
);

/** 1:1 se zakázkou — barva + mapa zubů (picker_state v2, formát z crm-mvp). */
export const orderOralCavity = sqliteTable("order_oral_cavity", {
  orderId: text("order_id")
    .primaryKey()
    .references(() => orders.id, { onDelete: "cascade" }),
  /** NO_COLOR_REQUIRED | LAB_TO_CHOOSE | SHADE */
  colorMode: text("color_mode").notNull().default("NO_COLOR_REQUIRED"),
  colorShade: text("color_shade"),
  /** OralCavityValue v2: {version, toothStates, bridges, archSelections}. */
  pickerState: text("picker_state", { mode: "json" }).notNull().default(sql`'{}'`),
});

/** Lehký log změn stavů (nahrazuje plný audit systém crm-mvp). */
export const orderStateLog = sqliteTable(
  "order_state_log",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    changedBy: text("changed_by")
      .notNull()
      .references(() => technician.id),
    changedAt: integer("changed_at").notNull(),
  },
  (t) => [index("idx_order_state_log_order").on(t.orderId)],
);

/** Interní poznámky k zakázce (nahrazuje komentářové vlákno lab↔doktor). */
export const orderNote = sqliteTable(
  "order_note",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => technician.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_order_note_order").on(t.orderId)],
);

/** Přílohy v R2 — bez draft→link modelu, váže se rovnou na zakázku. */
export const attachment = sqliteTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    /** Velikost v bajtech. */
    size: integer("size").notNull(),
    /** Velikost webp náhledu v bajtech (0 = bez náhledu) — kvůli přesnému
     *  ukazateli obsazení úložiště. */
    previewSize: integer("preview_size").notNull().default(0),
    r2Key: text("r2_key").notNull(),
    /** Náhled (webp downscale) — jen u obrázků. */
    previewR2Key: text("preview_r2_key"),
    createdBy: text("created_by")
      .notNull()
      .references(() => technician.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_attachment_order").on(t.orderId)],
);

/* ------------------------------------------------------------------ */
/*  Materiály (MDR dohledatelnost)                                     */
/* ------------------------------------------------------------------ */

export const manufacturer = sqliteTable("manufacturer", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Unikátní prefix pro generování katalogového kódu (AID, STR, IVO…). */
  codePrefix: text("code_prefix").notNull().unique(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

/** Povinný katalog standardizovaných typů materiálu. */
export const materialCatalog = sqliteTable("material_catalog", {
  id: text("id").primaryKey(),
  /** `PREFIX-NNNN`, stabilní a neměnný, generuje Worker. */
  code: text("code").notNull().unique(),
  manufacturerId: text("manufacturer_id")
    .notNull()
    .references(() => manufacturer.id),
  canonicalName: text("canonical_name").notNull(),
  /** true = hlavní materiál, smí do zakázky; false = jen skladová evidence. */
  isOrderUsageEligible: integer("is_order_usage_eligible", { mode: "boolean" })
    .notNull()
    .default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export type StockItemStatus = "active" | "used" | "consumed" | "discarded";
export type ConsumptionMode = "reusable_lot" | "one_time";

/** Konkrétní skladová položka (LOT) navázaná na katalog. */
export const stockItem = sqliteTable(
  "stock_item",
  {
    id: text("id").primaryKey(),
    materialCatalogId: text("material_catalog_id")
      .notNull()
      .references(() => materialCatalog.id),
    /** Human-readable identifikátor, 4-5 znaků, abeceda bez I/L/O/0/1. */
    shortCode: text("short_code").notNull().unique(),
    lotNumber: text("lot_number").notNull(),
    /** ISO datum expirace. */
    expirationDate: text("expiration_date").notNull(),
    receivedAt: integer("received_at").notNull(),
    openedAt: integer("opened_at"),
    purchaseReference: text("purchase_reference"),
    status: text("status").$type<StockItemStatus>().notNull().default("active"),
    consumptionMode: text("consumption_mode")
      .$type<ConsumptionMode>()
      .notNull()
      .default("reusable_lot"),
    firstUsedAt: integer("first_used_at"),
  },
  (t) => [
    index("idx_stock_item_catalog").on(t.materialCatalogId),
    index("idx_stock_item_status").on(t.status),
  ],
);

/** Auditní evidence hlavních materiálů použitých na zakázce (MDR). */
export const orderMaterialUsage = sqliteTable(
  "order_material_usage",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    materialCatalogId: text("material_catalog_id").references(() => materialCatalog.id),
    stockItemId: text("stock_item_id").references(() => stockItem.id),
    // Auditní pravda je ve snapshotech (přežijí archivaci katalogu):
    displayName: text("display_name").notNull(),
    manufacturerName: text("manufacturer_name").notNull(),
    lotNumber: text("lot_number").notNull(),
    expirationDate: text("expiration_date").notNull(),
    /** stock | one_time — kterou cestou záznam vznikl. */
    sourceType: text("source_type").notNull().default("stock"),
    usedAt: integer("used_at").notNull(),
    usedBy: text("used_by")
      .notNull()
      .references(() => technician.id),
  },
  (t) => [index("idx_omu_order").on(t.orderId)],
);

/* ------------------------------------------------------------------ */
/*  Recepty (šablony materiálového složení) + checklist návrhů         */
/* ------------------------------------------------------------------ */

export const recipe = sqliteTable("recipe", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type RecipeLineType = "catalog_item" | "placeholder";

export const recipeItem = sqliteTable(
  "recipe_item",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    lineType: text("line_type").$type<RecipeLineType>().notNull(),
    /** Jen u catalog_item. */
    materialCatalogId: text("material_catalog_id").references(() => materialCatalog.id),
    /** Jen u placeholder. */
    placeholderText: text("placeholder_text"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("idx_recipe_item_recipe").on(t.recipeId)],
);

export const recipePriceListItem = sqliteTable(
  "recipe_price_list_item",
  {
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    priceListItemId: text("price_list_item_id")
      .notNull()
      .references(() => priceListItem.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.priceListItemId] }),
    index("idx_rpli_price_list_item").on(t.priceListItemId),
  ],
);

export type ProposalStatus = "pending" | "resolved" | "discarded" | "obsolete";

/**
 * Staging checklist materiálového složení zakázky. Drží snapshoty — přežije
 * smazání šablony. Idempotence přes UNIQUE (order, source_recipe_item_id_snapshot).
 * Sémantika stavů (z crm-mvp material-recipes-mvp.md):
 *   obsolete  = systémový úklid (lazy sync), při návratu položky se reaktivuje
 *   discarded = lidské rozhodnutí, nikdy se neobnovuje
 */
export const orderMaterialProposal = sqliteTable(
  "order_material_proposal",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sourceRecipeId: text("source_recipe_id"),
    sourceRecipeItemIdSnapshot: text("source_recipe_item_id_snapshot").notNull(),
    sourceRecipeNameSnapshot: text("source_recipe_name_snapshot").notNull(),
    lineType: text("line_type").$type<RecipeLineType>().notNull(),
    materialCatalogId: text("material_catalog_id"),
    materialCodeSnapshot: text("material_code_snapshot"),
    materialNameSnapshot: text("material_name_snapshot"),
    manufacturerNameSnapshot: text("manufacturer_name_snapshot"),
    placeholderText: text("placeholder_text"),
    /** FEFO doporučení šarže (bez FK — jen hint, re-validuje se při čtení). */
    suggestedStockItemId: text("suggested_stock_item_id"),
    status: text("status").$type<ProposalStatus>().notNull().default("pending"),
    resolvedUsageId: text("resolved_usage_id"),
    createdBy: text("created_by"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
    resolvedBy: text("resolved_by"),
  },
  (t) => [
    uniqueIndex("uq_omp_order_recipe_item").on(t.orderId, t.sourceRecipeItemIdSnapshot),
    index("idx_omp_order").on(t.orderId),
  ],
);

/* ------------------------------------------------------------------ */
/*  Číselníky                                                          */
/* ------------------------------------------------------------------ */

export const shippingMethod = sqliteTable("shipping_method", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});
