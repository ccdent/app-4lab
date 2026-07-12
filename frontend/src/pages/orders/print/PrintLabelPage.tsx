// =============================================================================
// PrintLabelPage — výrobní lístek zakázky (A4 landscape, lístek = levá A5).
// Vlastní design 4lab (2026-07): černý horní pruh s číslem zakázky a pacientem,
// termín jako orámovaný box (žádný vyplněný datumový blok), zaoblené buňky
// mapy zubů. Data: položky s lokalizací, preference doktora, interní poznámky.
// =============================================================================

import React from "react";
import { useParams } from "react-router-dom";
import { doctorDisplayName } from "../../../api/types";
import {
  LOWER_TEETH,
  MARK_MAP,
  UPPER_TEETH,
  normalizeOralCavityValue,
  type Bridge,
} from "../../../shared/oralCavity";
import PrintButton from "./PrintButton";
import { formatDateCS, makePrintT, useOrderPrintData } from "./printShared";

/* ─── helpers ─── */

// České zdrojové texty = překladové klíče (makePrintT).
const CZECH_DAYS = ["Neděle", "Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota"];

function buildBridgeSvg(bridges: Bridge[], teethRow: number[]): React.JSX.Element | null {
  const lines: React.JSX.Element[] = [];
  for (const bridge of bridges) {
    const teeth = Array.isArray(bridge.teeth) ? bridge.teeth : [];
    const indices = teeth.map((t) => teethRow.indexOf(t)).filter((i) => i >= 0);
    if (indices.length < 2) continue;
    const min = Math.min(...indices);
    const max = Math.max(...indices);
    const x1 = ((min + 0.5) / 16) * 100;
    const x2 = ((max + 0.5) / 16) * 100;
    lines.push(
      <line
        key={`${min}-${max}`}
        x1={x1}
        y1="5"
        x2={x2}
        y2="5"
        stroke="#000"
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  if (lines.length === 0) return null;
  return (
    <svg className="dc-bridge-svg" viewBox="0 0 100 9" preserveAspectRatio="none">
      {lines}
    </svg>
  );
}

const CSS = `
@page { size: A4 landscape; margin: 0.1in; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  /* Systémové fonty — externí @import by při tisku offline posunul mm layout. */
  font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.print-page-1 {
  width: 100%;
  max-width: 297mm;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr;
}
.ticket {
  grid-column: 1;
  grid-row: 1;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
  /* okraj pro tisk vlevo + bezpečnostní mezera od přehybu (střed A4) —
     obojí UVNITŘ levé poloviny, obsah nepřeteče přes přehyb. */
  padding-left: 6mm;
  padding-right: 10mm;
}

/* Horní pruh: číslo zakázky + pacient (bílá na černé) */
.head-band {
  background: #000;
  color: #fff;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
}
.head-band .hb-num {
  font-family: 'Courier New', monospace;
  font-size: 17px;
  font-weight: 700;
  white-space: nowrap;
}
.head-band .hb-patient {
  font-size: 20px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

/* Řádek: zadavatel vlevo, termín v orámovaném boxu vpravo */
.info-row { display: flex; gap: 8px; align-items: stretch; }
.who { flex: 1; display: flex; flex-direction: column; gap: 3px; padding: 2px 2px 2px 0; }
.who .w-line { display: flex; gap: 5px; align-items: baseline; }
.who .w-label { font-size: 8px; text-transform: uppercase; letter-spacing: .5px; color: #444; min-width: 52px; }
.who .w-value { font-size: 12px; font-weight: 700; color: #000; }
.who .w-value .w-sub { font-weight: 400; }
.who .w-unassigned { font-weight: 400; color: #777; font-style: italic; }
.who .w-value .w-clinic { display: block; font-size: 10px; font-weight: 400; color: #444; margin-top: 1px; }
.due-box {
  border: 2px solid #000;
  border-radius: 6px;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
  min-width: 130px;
}
.due-box .due-day { font-size: 10px; font-weight: 600; color: #000; }
.due-box .due-date { font-size: 19px; font-weight: 800; color: #000; white-space: nowrap; }
.due-box .due-tryin { font-size: 8.5px; color: #000; margin-top: 2px; }

/* Mapa zubů + preference */
.mid-section { display: flex; gap: 8px; border-top: 1.5px solid #000; padding-top: 6px; }
.dental-cross { flex: 2; display: flex; flex-direction: column; gap: 2px; }
.dc-bridge-row { height: 7px; }
.dc-bridge-svg { width: 100%; height: 7px; display: block; overflow: visible; }
.dc-grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; }
.dc-cell {
  border: 0.75px solid #bbb;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px 1px 1px;
  gap: 1px;
}
.dc-cell.active { border: 1.5px solid #000; background: #f2f2f2; }
.dc-num { font-size: 8px; line-height: 1; color: #000; font-weight: 400; }
.dc-cell.active .dc-num { font-weight: 800; }
.dc-mark { height: 13px; display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.dc-sep { height: 4px; }
.dc-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 3px; }
.dc-color { font-size: 15px; font-weight: 800; color: #000; white-space: nowrap; }
.dc-color span { font-size: 9px; font-weight: 400; color: #444; text-transform: uppercase; letter-spacing: .5px; margin-right: 3px; }
.dc-legend { display: flex; gap: 10px; align-items: center; }
.dc-leg { display: flex; align-items: center; gap: 3px; font-size: 8.5px; color: #000; }
.dc-leg-line { width: 12px; height: 2px; background: #000; border-radius: 2px; }
.preferences {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 1.5px solid #000;
  padding-left: 8px;
}
.section-title { font-size: 9px; font-weight: 800; color: #000; letter-spacing: .5px; text-transform: uppercase; }
.section-title::before { content: "■ "; font-size: 7px; vertical-align: 1px; }
.pref-item { font-size: 9px; color: #000; font-weight: 600; padding: 1px 0; border-bottom: 0.5px dotted #999; }
.pref-empty { font-size: 9px; color: #999; }

/* Položky */
.order-items { display: flex; flex-direction: column; gap: 3px; border-top: 1.5px solid #000; padding-top: 6px; }
.items-header, .item-row { display: flex; gap: 6px; padding: 2px 0; }
.items-header span { font-size: 8px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: .5px; }
.item-row { border-bottom: 0.5px dotted #999; }
.col-code { width: 70px; font-size: 10px; font-family: 'Courier New', monospace; color: #000; }
.col-name { flex: 1; font-size: 10px; font-weight: 600; color: #000; display: flex; flex-direction: column; line-height: 1.25; }
.col-name .item-sub { font-size: 8px; font-weight: 400; color: #555; margin-top: 1px; }
.col-qty { width: 24px; font-size: 10px; font-weight: 800; color: #000; text-align: right; }

/* Poznámky */
.notes-left { grid-column: 1; grid-row: 2; padding: 8px 10mm 8px 6mm; font-size: 11px; }
.notes-right { grid-column: 2; grid-row: 1 / -1; padding: 0 0 8px 8px; font-size: 11px; }
.note-block { display: flex; flex-direction: column; gap: 2px; padding-bottom: 5px; margin-bottom: 6px; border-bottom: 0.5px dotted #999; break-inside: avoid; }
.note-meta { font-size: 8px; font-weight: 600; color: #000; }
.note-text { font-size: 9px; color: #000; white-space: pre-wrap; }
.notes-empty { font-size: 9px; color: #999; }
`;

export default function PrintLabelPage() {
  const { id } = useParams<{ id: string }>();
  const { order, lab, error } = useOrderPrintData(id);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!order || !lab) return null;

  const pt = makePrintT(lab.printInAppLanguage);

  /* ─── derived ─── */

  const oralCavity = normalizeOralCavityValue(order.oralCavity?.pickerState);
  // new Date("YYYY-MM-DD") je UTC půlnoc a lokální gettery by na západ od
  // UTC ukázaly předchozí den — parsovat explicitně jako lokální půlnoc.
  const dueDate = new Date(`${order.completionDueAt}T00:00:00`);
  const dueDateValid = !isNaN(dueDate.getTime());
  const doctorName = doctorDisplayName({
    titlePrefix: order.doctorTitlePrefix,
    firstName: order.doctorFirstName,
    lastName: order.doctorLastName,
  });
  const technicianName = order.technicianFirstName
    ? `${order.technicianFirstName} ${order.technicianLastName}`
    : null;
  const tryInDates = [...order.tryInDates].sort();
  const shadeLabToChoose = order.oralCavity?.colorMode === "LAB_TO_CHOOSE";
  const shade =
    order.oralCavity?.colorMode === "SHADE" ? order.oralCavity.colorShade || null : null;

  const renderTeethRow = (teeth: number[]) =>
    teeth.map((num) => {
      const state = oralCavity.toothStates?.[String(num)];
      const isActive = !!state && state !== "EMPTY";
      const mark = state ? (MARK_MAP[state] ?? "") : "";
      return (
        <div key={num} className={`dc-cell${isActive ? " active" : ""}`}>
          <span className="dc-num">{num}</span>
          <div className="dc-mark">{mark}</div>
        </div>
      );
    });

  const upperBridges = oralCavity.bridges.filter(
    (b) => b.arch === "UPPER" || b.teeth.some((t) => UPPER_TEETH.includes(t)),
  );
  const lowerBridges = oralCavity.bridges.filter(
    (b) => b.arch === "LOWER" || b.teeth.some((t) => LOWER_TEETH.includes(t)),
  );

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <div className="print-page-1">
        <div className="ticket">
          {/* Horní pruh: číslo + pacient */}
          <div className="head-band">
            <span className="hb-num">{order.orderNumber}</span>
            <span className="hb-patient">{order.patientName || "—"}</span>
          </div>

          {/* Zadavatel + termín */}
          <div className="info-row">
            <div className="who">
              <div className="w-line">
                <span className="w-label">{pt("Doktor")}</span>
                {/* Klinika na vlastním řádku — dlouhá jména se jinak lámou nečitelně. */}
                <span className="w-value">
                  {doctorName}
                  {order.clinicName && <span className="w-clinic">{order.clinicName}</span>}
                </span>
              </div>
              <div className="w-line">
                <span className="w-label">{pt("Technik")}</span>
                {technicianName ? (
                  <span className="w-value">{technicianName}</span>
                ) : (
                  <span className="w-value w-unassigned">{pt("Nepřiřazen")}</span>
                )}
              </div>
            </div>

            {dueDateValid && (
              <div className="due-box">
                <span className="due-day">{pt(CZECH_DAYS[dueDate.getDay()])}</span>
                <span className="due-date">{formatDateCS(order.completionDueAt)}</span>
                {tryInDates.map((d, i) => (
                  <span key={d} className="due-tryin">
                    {pt("{n}. zkouška:", { n: i + 1 })} {formatDateCS(d)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Mapa zubů + preference */}
          <div className="mid-section">
            <div className="dental-cross">
              <div className="dc-bridge-row">{buildBridgeSvg(upperBridges, UPPER_TEETH)}</div>
              <div className="dc-grid">{renderTeethRow(UPPER_TEETH)}</div>
              <div className="dc-sep" />
              <div className="dc-grid">{renderTeethRow(LOWER_TEETH)}</div>
              <div className="dc-bridge-row">{buildBridgeSvg(lowerBridges, LOWER_TEETH)}</div>
              <div className="dc-footer">
                <div className="dc-legend">
                  <div className="dc-leg">● {pt("pahýl")}</div>
                  <div className="dc-leg">○ {pt("chybějící")}</div>
                  <div className="dc-leg">× {pt("implantát")}</div>
                  <div className="dc-leg"><div className="dc-leg-line" /> {pt("můstek")}</div>
                </div>
                <div className="dc-color">
                  <span>{pt("Barva")}:</span> {shade ?? (shadeLabToChoose ? pt("výběr v laboratoři") : "—")}
                </div>
              </div>
            </div>

            <div className="preferences">
              <div className="section-title">{pt("PREFERENCE LÉKAŘE")}</div>
              {order.doctorPreferences.length === 0 ? (
                <div className="pref-empty">{pt("Bez preferencí")}</div>
              ) : (
                order.doctorPreferences.map((p) => (
                  <div key={p} className="pref-item">{p}</div>
                ))
              )}
            </div>
          </div>

          {/* POLOŽKY */}
          <div className="order-items">
            <div className="section-title">{pt("POLOŽKY ZAKÁZKY")}</div>
            <div className="items-header">
              <span className="col-code">{pt("Kód")}</span>
              <span className="col-name">{pt("Název")}</span>
              <span className="col-qty">{pt("Ks")}</span>
            </div>
            {order.items.map((i) => (
              <div key={i.id} className="item-row">
                <span className="col-code">{i.code}</span>
                <span className="col-name">
                  {i.name}
                  {i.localization && (
                    <span className="item-sub">{pt("Lokalizace")} {i.localization}</span>
                  )}
                </span>
                <span className="col-qty">{i.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Poznámky — pod lístkem (levý sloupec) a v pravém sloupci */}
        <div className="notes-left">
          <div className="section-title">{pt("POZNÁMKY")}</div>
          {order.notes.length === 0 && <div className="notes-empty">{pt("Žádné poznámky")}</div>}
          {order.notes.slice(0, 4).map((n) => (
            <div key={n.id} className="note-block">
              <span className="note-meta">
                {formatDateCS(n.createdAt)} · {n.authorFirstName} {n.authorLastName}
              </span>
              <span className="note-text">{n.body}</span>
            </div>
          ))}
        </div>
        <div className="notes-right">
          {order.notes.slice(4).map((n) => (
            <div key={n.id} className="note-block">
              <span className="note-meta">
                {formatDateCS(n.createdAt)} · {n.authorFirstName} {n.authorLastName}
              </span>
              <span className="note-text">{n.body}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
