// =============================================================================
// PrintDeclarationPage — prohlášení o zdravotnickém prostředku na zakázku (MDR).
// Šablona 1:1 z crm-mvp DeclarationDocV1. Sekce použitých materiálů se vykreslí,
// jakmile zakázka ponese záznamy šarží (materiálový modul — fáze 2).
// =============================================================================

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import DOMPurify from "dompurify";
import {
  doctorDisplayName,
  type OrderInstruction,
} from "../../../api/types";
import { api } from "../../../api/client";
import PrintButton from "./PrintButton";
import {
  formatDateCS,
  labAddress,
  makePrintT,
  manufactureDate,
  useOrderPrintData,
} from "./printShared";

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html,body{background:#fff}
body{font-family:Arial,sans-serif;font-size:8pt;color:#111;background:#fff;line-height:1.45}
.page{width:210mm;min-height:297mm;padding:14mm 16mm 12mm;background:#fff;margin:0 auto;font-family:Arial,sans-serif}
.doc-title{font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:10px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;margin-bottom:10px;border:.5px solid #999}
.meta-col{padding:6px 8px}
.meta-col + .meta-col{border-left:.5px solid #999}
.meta-label{font-size:6.5pt;color:#666;margin-bottom:2px}
.meta-value{font-size:8pt;font-weight:700;line-height:1.5}
.meta-value.light{font-weight:400;color:#333}
.meta-row{display:flex;gap:4px;padding:2.5px 0;border-bottom:.3px solid #e0e0e0;font-size:8pt}
.meta-row:last-child{border-bottom:none}
.meta-row .lbl{color:#666;font-size:7pt;min-width:95px;flex-shrink:0;padding-top:1px}
.meta-row .val{font-weight:700}
.sec{margin-bottom:8px}
.sec-title{font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;border-bottom:.5px solid #000;padding-bottom:2px;margin-bottom:5px;color:#000}
table{width:100%;border-collapse:collapse;font-size:8pt;table-layout:fixed}
thead tr{background:#000 !important;color:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
thead th{padding:3.5px 6px;text-align:left;font-size:6.5pt;font-weight:700;letter-spacing:.3px}
tbody tr{border-bottom:.3px solid #ccc}
tbody tr:nth-child(even){background:#f7f7f7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:3px 6px;vertical-align:top}
td.mono{font-family:'Courier New',monospace;font-size:7.5pt}
.declaration-box{border:.5px solid #ccc;padding:8px 10px;margin-bottom:8px;background:#fafafa;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.declaration-box p{font-size:8pt;line-height:1.6;margin-bottom:5px;text-align:justify;color:#111}
.declaration-box p:last-child{margin-bottom:0}
.sign{margin-top:14mm;display:flex;justify-content:space-between;font-size:8pt}
/* Návody začínají na nové stránce — prohlášení je samostatný dokument. */
/* Po zlomu se horní padding .page neopakuje — bez vlastního odsazení by tisk lepil na hranu papíru. */
.navod-page{break-before:page;page-break-before:always;padding-top:14mm}
.navod-page > .instruction-block:first-child{margin-top:0}
.instruction-block{break-inside:avoid;page-break-inside:avoid;margin-top:10px}
.instruction-block + .instruction-block{margin-top:14px}
.instruction-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:5px;color:#000}
.instruction-content{font-size:8pt;line-height:1.5;color:#111}
.instruction-content h1,.instruction-content h2,.instruction-content h3,.instruction-content h4{font-size:8.5pt;font-weight:700;margin:6px 0 3px;color:#000}
.instruction-content p{margin-bottom:4px}
.instruction-content ul,.instruction-content ol{margin:3px 0 5px 18px}
.instruction-content li{margin-bottom:1px}
.instruction-content a{color:#000;text-decoration:underline}
.instruction-content strong,.instruction-content b{font-weight:700}
.instruction-content em,.instruction-content i{font-style:italic}
.load-error{color:#b91c1c;font-weight:700}
@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}body{margin:0}.page{margin:0;padding:12mm 14mm 10mm}.load-error{display:none}}
`;

/**
 * Sanitizace HTML návodu — úzký whitelist odpovídající Tiptap editoru
 * (StarterKit + Link). Defense-in-depth: sanitizuje se při každém renderu.
 */
function sanitizeInstructionHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s",
      "h1", "h2", "h3", "h4",
      "ul", "ol", "li",
      "a", "blockquote", "code", "pre",
    ],
    ALLOWED_ATTR: ["href", "title", "rel", "target"],
    ALLOW_DATA_ATTR: false,
  });
}

export default function PrintDeclarationPage() {
  const { id } = useParams<{ id: string }>();
  const { order, lab, error } = useOrderPrintData(id);
  const [instructions, setInstructions] = useState<OrderInstruction[] | null>(null);
  const [instructionsError, setInstructionsError] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .get<OrderInstruction[]>(`/orders/${id}/instructions`)
      .then(setInstructions)
      .catch(() => {
        setInstructions([]);
        setInstructionsError(true);
      });
  }, [id]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!order || !lab || instructions === null) return null;

  // order_item.id → SN (číslo zakázky/lokalizace) pro titulky návodů.
  const itemIdToSN = new Map<string, string>();
  for (const i of order.items) {
    if (!i.mdrDevice) continue;
    itemIdToSN.set(
      i.id,
      i.localization ? `${order.orderNumber}/${i.localization}` : order.orderNumber,
    );
  }

  const doctorName = doctorDisplayName({
    titlePrefix: order.doctorTitlePrefix,
    firstName: order.doctorFirstName,
    lastName: order.doctorLastName,
  });

  const loadFailed = instructionsError;
  const pt = makePrintT(lab.printInAppLanguage);

  // Bez ZP se prohlášení nevydává (menu položku detail zakázky šedí,
  // tohle kryje přímý odkaz).
  if (!order.items.some((i) => i.mdrDevice)) {
    return (
      <div style={{ padding: 32, fontFamily: "Arial, sans-serif", fontSize: 14 }}>
        {pt("V zakázce není žádný zdravotnický prostředek — prohlášení o shodě se nevydává.")}
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      {/* Neúplný MDR dokument se nesmí pohodlně vytisknout — bez tlačítka. */}
      {!loadFailed && <PrintButton />}
      <div className="page">
        <div className="doc-title">{pt("Prohlášení o zdravotnickém prostředku na zakázku")}</div>

        <div className="meta-grid">
          <div className="meta-col">
            <div className="meta-label">{pt("Výrobce")}</div>
            <div className="meta-value">{lab.name || "—"}</div>
            <div className="meta-value light">{labAddress(lab) || "—"}</div>
            <div className="meta-value light">
              {pt("IČ")}: {lab.ico || "—"}&nbsp;|&nbsp;E-mail: {lab.email || "—"}
            </div>
          </div>
          <div className="meta-col">
            <div className="meta-row"><span className="lbl">{pt("Datum výroby")}</span><span className="val">{manufactureDate(order)}</span></div>
            <div className="meta-row"><span className="lbl">{pt("Vygenerováno")}</span><span className="val">{formatDateCS(Date.now())}</span></div>
            <div className="meta-row"><span className="lbl">{pt("Pacient")}</span><span className="val">{order.patientName}</span></div>
            <div className="meta-row"><span className="lbl">{pt("Předepisující lékař")}</span><span className="val">{doctorName}</span></div>
          </div>
        </div>

        <div className="sec">
          <div className="sec-title">{pt("Toto prohlášení se vydává pro tyto zdravotnické prostředky na zakázku")}</div>
          <table>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "60%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>{pt("Sériové číslo (SN)")}</th>
                <th>{pt("Kód")}</th>
                <th>{pt("Popis")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items
                .filter((i) => i.mdrDevice)
                .map((i) => (
                  <tr key={i.id}>
                    <td className="mono">
                      {i.localization
                        ? `${order.orderNumber}/${i.localization}`
                        : order.orderNumber}
                    </td>
                    <td>{i.code}</td>
                    <td>
                      {i.name}
                      {i.quantity > 1 ? ` (${i.quantity} ${pt("ks")})` : ""}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="sec">
          <div className="sec-title">{pt("Prohlášení výrobce")}</div>
          <div className="declaration-box">
            <p>
              {pt("Zdravotnické prostředky uvedené výše jsou")}{" "}
              <strong>{pt("zdravotnické prostředky vyrobené na zakázku")}</strong>
              {pt(", určené výlučně pro konkrétního pacienta uvedeného v tomto dokumentu.")}
            </p>
            <p>
              {pt("Byly vyrobeny na základě předpisu kvalifikovaného lékaře, který stanovil jejich specifické vlastnosti nezbytné pro použití u tohoto pacienta.")}
            </p>
            <p>
              {pt("Tyto prostředky splňují příslušné požadavky na bezpečnost a účinnost dle")}{" "}
              <strong>{pt("přílohy I")}</strong> {pt("a jsou ve shodě s")}{" "}
              <strong>{pt("přílohou XIII Nařízení (EU) 2017/745")}</strong>{" "}
              {pt("(MDR). Je zabezpečena shoda těchto výrobků se stanovenými pracovními postupy a interní dokumentací výrobce.")}
            </p>
          </div>
        </div>

        <div className="sign">
          <span>{pt("V")} __________________ {pt("dne")} {formatDateCS(Date.now())}</span>
          <span>{pt("Podpis a razítko výrobce")}: ______________________</span>
        </div>

        {instructionsError && (
          <div className="sec load-error" style={{ marginTop: 12 }}>
            {pt("Návody k použití se nepodařilo načíst — obnov stránku před tiskem.")}
          </div>
        )}
        {instructions.length > 0 && (
          <div className="navod-page">
            {instructions.map((ins) => {
              const seen = new Set<string>();
              const sns: string[] = [];
              for (const itemId of ins.itemIds) {
                const sn = itemIdToSN.get(itemId);
                if (sn && !seen.has(sn)) {
                  seen.add(sn);
                  sns.push(sn);
                }
              }
              const snSuffix = sns.length > 0 ? ` - SN: ${sns.join(", ")}` : "";
              return (
                <div key={ins.id} className="instruction-block">
                  <div className="instruction-title">{pt("Návod k použití")} - {ins.name}{snSuffix}</div>
                  <div
                    className="instruction-content"
                    // Bezpečné: sanitizováno DOMPurify při každém renderu.
                    dangerouslySetInnerHTML={{ __html: sanitizeInstructionHtml(ins.htmlContent) }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
