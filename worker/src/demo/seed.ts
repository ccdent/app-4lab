// =============================================================================
// Demo seed — smaže vše a nahraje vzorová data. Volá noční cron (scheduled)
// a POST /demo/reset (s DEMO_RESET_KEY). Deterministická id `demo-*`,
// termíny relativní k dnešku, aby feed a fakturace vždy něco ukazovaly.
// =============================================================================

import type { Env } from "../auth";

const D = 24 * 60 * 60 * 1000;

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * D).toISOString().slice(0, 10);
}

/** Unix ms před `days` dny v 10:00 UTC (stabilní v rámci dne). */
function ts(daysAgo: number): number {
  const d = new Date(Date.now() - daysAgo * D);
  d.setUTCHours(10, 0, 0, 0);
  return d.getTime();
}

/** První den minulého měsíce + `day` (pro fakturační/výplatní demo). */
function lastMonthTs(day: number): number {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  d.setUTCDate(day);
  d.setUTCHours(12, 0, 0, 0);
  return d.getTime();
}

const EMPTY_PICKER = '{"version":2,"toothStates":{},"bridges":[],"archSelections":[]}';

/** Tabulky v pořadí mazání (children → parents; FK bez CASCADE všude). */
const WIPE_ORDER = [
  "order_material_usage",
  "order_material_proposal",
  "recipe_price_list_item",
  "recipe_item",
  "recipe",
  "stock_item",
  "material_catalog",
  "manufacturer",
  "attachment",
  "order_state_log",
  "order_note",
  "order_oral_cavity",
  "order_item",
  "orders",
  "price_list_item",
  "price_list_category",
  "instruction",
  "clinic_customer_group",
  "customer_group",
  "doctor_preference",
  "preference_option",
  "doctor",
  "clinic",
  "shipping_method",
  "technician",
  "lab_profile",
];

export async function resetDemoData(env: Env): Promise<void> {
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];
  const run = (sql: string, ...args: unknown[]) =>
    stmts.push(env.DB.prepare(sql).bind(...args));

  for (const table of WIPE_ORDER) run(`DELETE FROM ${table}`);

  /* ─── lidé + laboratoř ─── */
  run(
    `INSERT INTO technician (id, email, first_name, last_name, role, perm_orders_view_all, perm_orders_create_for_others, perm_doctors_edit, perm_price_list_edit, perm_materials_edit, is_active, created_at, updated_at)
     VALUES ('demo-tech-1','demo@4lab.cz','Demo','Technik','technician',1,0,0,0,0,1,?,?)`,
    now, now,
  );
  run(
    `INSERT INTO technician (id, email, first_name, last_name, role, is_active, created_at, updated_at)
     VALUES ('demo-tech-2','jana.novakova@demo.4lab.cz','Jana','Nováková','lead',1,?,?)`,
    now, now,
  );
  run(
    `INSERT INTO lab_profile (id, name, street, city, zip, ico, dic, phone, email, order_prefix_mode, order_prefix, print_in_app_language, enforce_material_proposals_on_done, updated_at)
     VALUES ('lab','Demo Dent Lab s.r.o.','Vzorová 12','Praha','110 00','12345678','CZ12345678','+420 777 000 111','lab@demo.4lab.cz','custom','DEMO-',1,0,?)`,
    now,
  );

  /* ─── adresář ─── */
  run(`INSERT INTO clinic (id, company_name, street, city, zip, ico, phone, email, color, is_active, created_at, updated_at) VALUES ('demo-clinic-1','Stomatologie Úsměv s.r.o.','Dlouhá 5','Praha','110 00','87654321','+420 222 111 333','recepce@usmev.cz','#4FB6B2',1,?,?)`, now, now);
  run(`INSERT INTO clinic (id, company_name, street, city, zip, ico, color, is_active, created_at, updated_at) VALUES ('demo-clinic-2','Dentální centrum Brno a.s.','Náměstí Svobody 8','Brno','602 00','11223344','#E8871E',1,?,?)`, now, now);
  run(`INSERT INTO doctor (id, clinic_id, title_prefix, first_name, last_name, email, is_active, created_at, updated_at) VALUES ('demo-doc-1','demo-clinic-1','MUDr.','Petra','Svobodová','svobodova@usmev.cz',1,?,?)`, now, now);
  run(`INSERT INTO doctor (id, clinic_id, title_prefix, first_name, last_name, is_active, created_at, updated_at) VALUES ('demo-doc-2','demo-clinic-1','MDDr.','Tomáš','Král',1,?,?)`, now, now);
  run(`INSERT INTO doctor (id, clinic_id, title_prefix, first_name, last_name, is_active, created_at, updated_at) VALUES ('demo-doc-3','demo-clinic-2','MUDr.','Eva','Marková',1,?,?)`, now, now);
  run(`INSERT INTO preference_option (id, label, is_active) VALUES ('demo-pref-1','Preferuje světlejší odstíny',1)`);
  run(`INSERT INTO preference_option (id, label, is_active) VALUES ('demo-pref-2','Nízký skus',1)`);
  run(`INSERT INTO doctor_preference (doctor_id, option_id) VALUES ('demo-doc-1','demo-pref-1')`);

  /* ─── ceník ─── */
  run(`INSERT INTO customer_group (id, name, is_default) VALUES ('demo-group-1','Standard',1)`);
  run(`INSERT INTO clinic_customer_group (clinic_id, group_id) VALUES ('demo-clinic-1','demo-group-1')`);
  run(`INSERT INTO clinic_customer_group (clinic_id, group_id) VALUES ('demo-clinic-2','demo-group-1')`);
  run(
    `INSERT INTO instruction (id, name, html_content, archived, created_at, updated_at)
     VALUES ('demo-instr-1','Péče o celokeramickou náhradu','<h2>Péče o náhradu</h2><p>Náhradu čistěte <strong>dvakrát denně</strong> měkkým kartáčkem.</p><ul><li>používejte mezizubní kartáčky</li><li>jednou ročně kontrola u lékaře</li></ul>',0,?,?)`,
    now, now,
  );
  run(`INSERT INTO price_list_category (id, name, instruction_id) VALUES ('demo-cat-1','Fixní protetika','demo-instr-1')`);
  run(`INSERT INTO price_list_category (id, name) VALUES ('demo-cat-2','Snímatelná protetika')`);
  run(`INSERT INTO price_list_category (id, name) VALUES ('demo-cat-3','Ostatní práce')`);

  const pli = (
    id: string, code: string, name: string, short: string, cat: string,
    price: number, fee: number, days: number, mdr: number, kind: string | null,
    indications: string | null, stump: number | null, pontic: number | null, implant: number | null,
  ) =>
    run(
      `INSERT INTO price_list_item (id, code, name, short_name, category_id, group_id, mdr_device, kind, single_indications, bridge_stump_price, bridge_pontic_price, bridge_implant_price, price, technician_fee, production_days, archived, created_at, updated_at)
       VALUES (?,?,?,?,?,'demo-group-1',?,?,?,?,?,?,?,?,?,0,?,?)`,
      id, code, name, short, cat, mdr, kind, indications ?? "[]", stump, pontic, implant, price, fee, days, now, now,
    );
  pli("demo-pli-1", "K01", "Korunka celokeramická (zirkon)", "Korunka CK", "demo-cat-1", 380000, 90000, 7, 1, "single", '["STUMP","IMPLANT"]', null, null, null);
  pli("demo-pli-2", "M01", "Můstek celokeramický", "Můstek CK", "demo-cat-1", 0, 70000, 10, 1, "bridge", null, 360000, 300000, 420000);
  pli("demo-pli-3", "S01", "Celková snímatelná náhrada", "CSN", "demo-cat-2", 950000, 250000, 14, 1, "arch", null, null, null, null);
  pli("demo-pli-4", "O01", "Oprava náhrady", "Oprava", "demo-cat-3", 80000, 20000, 3, 0, null, null, null, null, null);
  pli("demo-pli-5", "O02", "Studijní model", "Model", "demo-cat-3", 25000, 5000, 2, 0, null, null, null, null, null);

  run(`INSERT INTO shipping_method (id, name, is_active) VALUES ('demo-ship-1','Osobní odběr',1)`);
  run(`INSERT INTO shipping_method (id, name, is_active) VALUES ('demo-ship-2','Svoz laboratoří',1)`);

  /* ─── materiály ─── */
  run(`INSERT INTO manufacturer (id, name, code_prefix, is_active) VALUES ('demo-mfr-1','Ivoclar Vivadent','IVO',1)`);
  run(`INSERT INTO manufacturer (id, name, code_prefix, is_active) VALUES ('demo-mfr-2','AIDITE','AID',1)`);
  run(`INSERT INTO manufacturer (id, name, code_prefix, is_active) VALUES ('demo-mfr-3','VITA Zahnfabrik','VIT',1)`);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-1','IVO-0001','demo-mfr-1','IPS e.max Press',1,1,?)`, now);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-2','AID-0001','demo-mfr-2','Zirkonový disk 98×14 A2',1,1,?)`, now);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-3','IVO-0002','demo-mfr-1','IPS Ivocolor — glazovací pasta',1,1,?)`, now);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-4','VIT-0001','demo-mfr-3','VITA VM9 — fazetovací keramika A2',1,1,?)`, now);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-5','IVO-0003','demo-mfr-1','ProBase Hot — bazální pryskyřice',1,1,?)`, now);
  run(`INSERT INTO material_catalog (id, code, manufacturer_id, canonical_name, is_order_usage_eligible, is_active, created_at) VALUES ('demo-mat-6','VIT-0002','demo-mfr-3','VITAPAN — konfekční zuby A2',1,1,?)`, now);
  const stock = (id: string, mat: string, code: string, lot: string, expDays: number, status: string, mode: string) =>
    run(
      `INSERT INTO stock_item (id, material_catalog_id, short_code, lot_number, expiration_date, received_at, status, consumption_mode)
       VALUES (?,?,?,?,?,?,?,?)`,
      id, mat, code, lot, iso(expDays), ts(40), status, mode,
    );
  stock("demo-stock-1", "demo-mat-1", "A2C4", "LOT-2026-041", 320, "active", "reusable_lot");
  stock("demo-stock-2", "demo-mat-2", "B3D5", "ZD-88412", 540, "used", "reusable_lot");
  run(`UPDATE stock_item SET opened_at = ?, first_used_at = ? WHERE id = 'demo-stock-2'`, ts(15), ts(15));
  stock("demo-stock-3", "demo-mat-1", "C6E7", "LOT-2025-987", -10, "active", "reusable_lot");
  stock("demo-stock-4", "demo-mat-3", "D8F9", "IVC-33107", 400, "active", "reusable_lot");
  stock("demo-stock-5", "demo-mat-4", "E2G3", "VM9-77120", 620, "active", "reusable_lot");
  stock("demo-stock-6", "demo-mat-5", "F4H5", "PBH-55901", 280, "active", "reusable_lot");
  stock("demo-stock-7", "demo-mat-6", "G6J7", "VP-14402", 900, "active", "reusable_lot");

  run(`INSERT INTO recipe (id, name, description, archived, created_at, updated_at) VALUES ('demo-recipe-1','Zirkonová korunka — standard','Standardní složení pro korunku CK',0,?,?)`, now, now);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-1','demo-recipe-1','catalog_item','demo-mat-2',NULL,NULL,0)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-2','demo-recipe-1','placeholder',NULL,'glazovací pasta',NULL,1)`);
  run(`INSERT INTO recipe_price_list_item (recipe_id, price_list_item_id) VALUES ('demo-recipe-1','demo-pli-1')`);

  run(`INSERT INTO recipe (id, name, description, archived, created_at, updated_at) VALUES ('demo-recipe-2','Zirkonový můstek — standard','Disk + fazetovací keramika + glazura',0,?,?)`, now, now);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-3','demo-recipe-2','catalog_item','demo-mat-2',NULL,NULL,0)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-4','demo-recipe-2','catalog_item','demo-mat-4',NULL,'jen u fazetovaných členů',1)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-5','demo-recipe-2','catalog_item','demo-mat-3',NULL,NULL,2)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-6','demo-recipe-2','placeholder',NULL,'sintrovací barvicí tekutina',NULL,3)`);
  run(`INSERT INTO recipe_price_list_item (recipe_id, price_list_item_id) VALUES ('demo-recipe-2','demo-pli-2')`);

  run(`INSERT INTO recipe (id, name, description, archived, created_at, updated_at) VALUES ('demo-recipe-3','Celková snímatelná náhrada','Bazální pryskyřice + konfekční zuby',0,?,?)`, now, now);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-7','demo-recipe-3','catalog_item','demo-mat-5',NULL,NULL,0)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-8','demo-recipe-3','catalog_item','demo-mat-6',NULL,NULL,1)`);
  run(`INSERT INTO recipe_item (id, recipe_id, line_type, material_catalog_id, placeholder_text, note, sort_order) VALUES ('demo-ri-9','demo-recipe-3','placeholder',NULL,'izolační prostředek',NULL,2)`);
  run(`INSERT INTO recipe_price_list_item (recipe_id, price_list_item_id) VALUES ('demo-recipe-3','demo-pli-3')`);

  /* ─── zakázky ─── */
  const order = (
    id: string, num: string, state: string, billed: number, clinic: string, doc: string,
    patient: string, due: string, tech: string | null, doneAt: number | null,
    createdAt: number, extra: string, extraVals: unknown[],
  ) =>
    run(
      `INSERT INTO orders (id, order_number, state, is_billed, clinic_id, doctor_id, patient_name, completion_due_at, try_in_dates, assigned_technician_id, done_at, created_by, created_at, updated_at${extra ? "," + extra : ""})
       VALUES (?,?,?,?,?,?,?,?,'[]',?,?,?,?,?${extraVals.map(() => ",?").join("")})`,
      id, num, state, billed, clinic, doc, patient, due, tech, doneAt, "demo-tech-1", createdAt, doneAt ?? createdAt, ...extraVals,
    );
  const item = (id: string, ord: string, pli: string | null, code: string, name: string, short: string, price: number, fee: number, qty: number, mdr: number, loc: string | null, createdAt: number) =>
    run(
      `INSERT INTO order_item (id, order_id, price_list_item_id, code, name, short_name, unit_price, technician_fee, quantity, mdr_device, localization, bridge_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL,?)`,
      id, ord, pli, code, name, short, price, fee, qty, mdr, loc, createdAt,
    );
  const cavity = (ord: string, picker: string, mode = "SHADE", shade: string | null = "A2") =>
    run(`INSERT INTO order_oral_cavity (order_id, color_mode, color_shade, picker_state) VALUES (?,?,?,?)`, ord, mode, shade, picker);
  const log = (id: string, ord: string, from: string, to: string, at: number) =>
    run(`INSERT INTO order_state_log (id, order_id, from_state, to_state, changed_by, changed_at) VALUES (?,?,?,?,'demo-tech-1',?)`, id, ord, from, to, at);
  const note = (id: string, ord: string, body: string, at: number) =>
    run(`INSERT INTO order_note (id, order_id, body, created_by, created_at) VALUES (?,?,?,'demo-tech-1',?)`, id, ord, body, at);

  // 1: nová, termín za 5 dní
  order("demo-ord-1", "DEMO-0001", "new", 0, "demo-clinic-1", "demo-doc-1", "Jan Novák", iso(5), null, null, ts(1), "", []);
  item("demo-oi-1a", "demo-ord-1", "demo-pli-1", "K01", "Korunka celokeramická (zirkon)", "Korunka CK", 380000, 90000, 1, 1, "21", ts(1));
  cavity("demo-ord-1", '{"version":2,"toothStates":{"21":"STUMP"},"bridges":[],"archSelections":[]}');

  // 2: ve výrobě, termín zítra
  order("demo-ord-2", "DEMO-0002", "in_progress", 0, "demo-clinic-1", "demo-doc-2", "Marie Dvořáková", iso(1), "demo-tech-1", null, ts(4), "", []);
  item("demo-oi-2a", "demo-ord-2", "demo-pli-2", "M01", "Můstek celokeramický", "Můstek CK", 1020000, 70000, 1, 1, "13-11", ts(4));
  cavity("demo-ord-2", '{"version":2,"toothStates":{"13":"STUMP","12":"MISSING","11":"STUMP"},"bridges":[{"id":"b1","arch":"UPPER","teeth":[13,12,11]}],"archSelections":[]}');
  run(`UPDATE order_item SET bridge_id = 'b1' WHERE id = 'demo-oi-2a'`);
  log("demo-log-2a", "demo-ord-2", "new", "accepted", ts(4));
  log("demo-log-2b", "demo-ord-2", "accepted", "in_progress", ts(3));
  note("demo-note-2a", "demo-ord-2", "Doktor prosí o kontrolu skusu před glazurou.", ts(2));

  // Ukázkové fotky úsměvů (objekty žijí trvale v demo R2; guard nedovolí
  // je smazat ani přidávat nové — seed jen obnovuje DB řádky).
  const photo = (id: string, ord: string, name: string, key: string, size: number, previewSize: number, at: number) =>
    run(
      `INSERT INTO attachment (id, order_id, file_name, content_type, size, preview_size, r2_key, preview_r2_key, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,'demo-tech-1',?)`,
      id, ord, name, "image/jpeg", size, previewSize, key + ".jpg", key + "-preview.webp", at,
    );
  // 3: na zkoušce, termín za 8 dní
  order("demo-ord-3", "DEMO-0003", "try_in", 0, "demo-clinic-2", "demo-doc-3", "Karel Procházka", iso(8), "demo-tech-1", null, ts(7), "", []);
  run(`UPDATE orders SET try_in_dates = ? WHERE id = 'demo-ord-3'`, JSON.stringify([iso(2)]));
  item("demo-oi-3a", "demo-ord-3", "demo-pli-3", "S01", "Celková snímatelná náhrada", "CSN", 950000, 250000, 1, 1, "02", ts(7));
  cavity("demo-ord-3", '{"version":2,"toothStates":{},"bridges":[],"archSelections":["ARCH_LOWER"]}', "LAB_TO_CHOOSE", null);
  log("demo-log-3a", "demo-ord-3", "in_progress", "try_in", ts(2));

  // 4: po termínu (včera), přijatá
  order("demo-ord-4", "DEMO-0004", "accepted", 0, "demo-clinic-2", "demo-doc-3", "Alena Veselá", iso(-1), "demo-tech-1", null, ts(6), "", []);
  item("demo-oi-4a", "demo-ord-4", "demo-pli-4", "O01", "Oprava náhrady", "Oprava", 80000, 20000, 1, 0, null, ts(6));
  cavity("demo-ord-4", EMPTY_PICKER, "NO_COLOR_REQUIRED", null);

  // 5: dokončená minulý měsíc + vyfakturovaná (fakturace, vyúčtování, MDR usage)
  const done5 = lastMonthTs(12);
  order("demo-ord-5", "DEMO-0005", "done", 1, "demo-clinic-1", "demo-doc-1", "Josef Černý", new Date(done5).toISOString().slice(0, 10), "demo-tech-1", done5, done5 - 6 * D, "billed_at, shipping_method_id, shipping_price, shipping_charged", [done5 + 2 * D, "demo-ship-2", 15000, 1]);
  item("demo-oi-5a", "demo-ord-5", "demo-pli-1", "K01", "Korunka celokeramická (zirkon)", "Korunka CK", 380000, 90000, 1, 1, "16", done5 - 6 * D);
  cavity("demo-ord-5", '{"version":2,"toothStates":{"16":"STUMP"},"bridges":[],"archSelections":[]}');
  log("demo-log-5a", "demo-ord-5", "in_progress", "done", done5);
  run(
    `INSERT INTO order_material_usage (id, order_id, material_catalog_id, stock_item_id, display_name, manufacturer_name, lot_number, expiration_date, source_type, used_at, used_by)
     VALUES ('demo-use-5a','demo-ord-5','demo-mat-2','demo-stock-2','Zirkonový disk 98×14 A2','AIDITE','ZD-88412',?, 'stock', ?, 'demo-tech-1')`,
    iso(540), done5 - 3 * D,
  );

  // 6: dokončená tento měsíc, nevyfakturovaná
  const done6 = ts(2);
  order("demo-ord-6", "DEMO-0006", "done", 0, "demo-clinic-2", "demo-doc-3", "Lucie Horáková", iso(-2), "demo-tech-1", done6, ts(9), "", []);
  item("demo-oi-6a", "demo-ord-6", "demo-pli-5", "O02", "Studijní model", "Model", 25000, 5000, 2, 0, null, ts(9));
  cavity("demo-ord-6", EMPTY_PICKER, "NO_COLOR_REQUIRED", null);
  log("demo-log-6a", "demo-ord-6", "in_progress", "done", done6);

  // Přílohy až po vložení všech zakázek (FK na orders).
  photo("demo-att-1", "demo-ord-2", "usmev-vstupni.jpg", "demo/usmev-vstupni", 63088, 5820, ts(4));
  photo("demo-att-2", "demo-ord-2", "usmev-zkouska.jpg", "demo/usmev-zkouska", 65779, 5658, ts(2));
  photo("demo-att-3", "demo-ord-5", "usmev-final.jpg", "demo/usmev-final", 62387, 5520, lastMonthTs(11));

  await env.DB.batch(stmts);
}
