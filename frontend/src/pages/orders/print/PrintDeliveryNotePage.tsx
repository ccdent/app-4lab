// =============================================================================
// PrintDeliveryNotePage — dodací list + horní štítek zásilky.
// Šablona 1:1 z crm-mvp DeliveryNoteDocV1 (Temp/Dodaci_list.html), render
// z živých dat (bez snapshot modelu — vědomé zjednodušení CRM-LIGHT).
// =============================================================================

import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { doctorDisplayName, type MaterialUsageRow } from "../../../api/types";
import { api } from "../../../api/client";
import { formatDateDDMMYYYY } from "../../../shared/dates";
import PrintButton from "./PrintButton";
import {
  formatCZK,
  formatDateCS,
  labAddress,
  manufactureDate,
  makePrintT,
  useOrderPrintData,
} from "./printShared";

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html,body{background:#fff}
.page{width:210mm;min-height:297mm;padding:11mm 14mm 9mm;background:#fff;font-size:8pt;line-height:1.35;color:#000;font-family:'Times New Roman',Times,serif;margin:0 auto}
.doc-title{font-size:10.5pt;font-weight:700;letter-spacing:.5px;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:9px;font-family:Arial,sans-serif;text-transform:uppercase;white-space:nowrap}
.sec{margin-bottom:7px}
.sec-title{font-size:6.5pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;font-family:Arial,sans-serif;border-bottom:.5px solid #000;padding-bottom:2px;margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:7.5pt;font-family:Arial,sans-serif;table-layout:fixed}
thead tr{background:#000 !important;color:#fff !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
thead th{padding:3px 5px;text-align:left;font-size:6.5pt;letter-spacing:.3px;font-weight:700}
th.r,td.r{text-align:right}
tbody tr{border-bottom:.3px solid #ccc}
tbody tr:nth-child(even){background:#f7f7f7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:2.5px 5px;vertical-align:middle}
td.mono{font-family:'Courier New',monospace;font-size:7pt}
.total-row td{border-top:.5px solid #000;background:#fff;font-weight:700}
.total-final td{background:#000 !important;color:#fff !important;font-weight:700;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.info-text{font-size:6.5pt;font-family:Arial,sans-serif;line-height:1.5;color:#222;margin-top:3px}
.col2{padding-left:40px !important}
@media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important}}
.label-block{border:1.5px solid #000;padding:8px 10px;margin-bottom:0;font-family:Arial,sans-serif}
.top-zone{display:flex;flex-direction:column;min-height:88mm}
.label-block-title{font-size:7pt;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;border-bottom:.5px solid #000;padding-bottom:3px;margin-bottom:6px;color:#000;display:flex;justify-content:space-between;align-items:baseline}
.label-block-title .title-num{font-size:7pt;font-weight:700;letter-spacing:.5px;color:#000}
.label-header{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;margin-bottom:6px}
.label-field{display:flex;gap:4px;font-size:7.5pt;padding:1.5px 0;border-bottom:.3px solid #ddd;align-items:baseline}
.label-field .lf{color:#555;font-size:7pt;min-width:80px;flex-shrink:0}
.label-field .vf{font-weight:700}
.label-table thead tr{background:#000 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.label-table thead th{font-size:6.5pt;font-weight:700;color:#fff;padding:3px 5px;text-align:left}
.label-table tbody tr{border-bottom:.3px solid #ccc}
.label-table tbody td{font-size:7.5pt;padding:3px 5px;font-family:Arial,sans-serif}
.label-table tbody tr:nth-child(even){background:#f7f7f7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.label-table td.mono{font-family:'Courier New',monospace;font-size:7pt}
.page-break{border:none;border-top:1.5px dashed #bbb;margin:auto 0 8mm;font-family:Arial,sans-serif;font-size:6.5pt;color:#aaa;text-align:center;line-height:0}
.page-break span{background:#fff;padding:0 8px;position:relative;top:-0.5em}
`;

export default function PrintDeliveryNotePage() {
  const { id } = useParams<{ id: string }>();
  const { order, lab, error } = useOrderPrintData(id);
  const [usages, setUsages] = useState<MaterialUsageRow[] | null>(null);
  const [usagesError, setUsagesError] = useState(false);

  useEffect(() => {
    if (!id) return;
    void api
      .get<MaterialUsageRow[]>(`/orders/${id}/material-usages`)
      .then(setUsages)
      .catch(() => {
        // Chybu na MDR dokumentu NEschovávat — tisk bez šarží musí být vidět.
        setUsages([]);
        setUsagesError(true);
      });
  }, [id]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!order || !lab || usages === null) return null;

  const pt = makePrintT(lab.printInAppLanguage);

  const doctorName = doctorDisplayName({
    titlePrefix: order.doctorTitlePrefix,
    firstName: order.doctorFirstName,
    lastName: order.doctorLastName,
  });
  const subtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const shippingAmount = order.shippingCharged ? order.shippingPrice : 0;
  const grandTotal = subtotal + order.priceAdjustmentAmount + shippingAmount;
  const hasExtras = order.priceAdjustmentAmount !== 0 || shippingAmount > 0;
  const doneDate = manufactureDate(order);
  const mdrItems = order.items.filter((i) => i.mdrDevice);
  const todayDate = formatDateCS(Date.now());

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <div className="page">
        <div className="top-zone">
          <div className="label-block">
            <div className="label-block-title">
              <span>{mdrItems.length > 0 ? pt("Zdravotnický prostředek na zakázku — štítek zásilky") : pt("Štítek zásilky")}</span>
              <span className="title-num">{pt("Zakázka č.")} {order.orderNumber}</span>
            </div>
            <div className="label-header">
              <div>
                <div className="label-field"><span className="lf">{pt("Výrobce")}</span><span className="vf">{lab.name || "—"}</span></div>
                <div className="label-field"><span className="lf">{pt("Adresa")}</span><span className="vf">{labAddress(lab) || "—"}</span></div>
                <div className="label-field"><span className="lf">{pt("E-mail")}</span><span className="vf">{lab.email || "—"}</span></div>
              </div>
              <div>
                <div className="label-field"><span className="lf">{pt("Předepisující lékař")}</span><span className="vf">{doctorName}</span></div>
                <div className="label-field"><span className="lf">{pt("Klinika")}</span><span className="vf">{order.clinicName}</span></div>
                <div className="label-field"><span className="lf">{pt("Pacient")}</span><span className="vf">{order.patientName}</span></div>
                <div className="label-field"><span className="lf">{pt("Termín")}</span><span className="vf">{formatDateCS(order.completionDueAt)}</span></div>
              </div>
            </div>
            {mdrItems.length > 0 && (
            <table className="label-table">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>{pt("Název zdravotnického prostředku")}</th>
                  <th style={{ width: "20%" }}>{pt("Kód")}</th>
                  <th style={{ width: "22%" }}>{pt("Sériové číslo (SN)")}</th>
                  <th style={{ width: "18%" }}>{pt("Datum výroby")}</th>
                </tr>
              </thead>
              <tbody>
                {mdrItems.map((i) => (
                    <tr key={i.id}>
                      <td>{i.name}</td>
                      <td>{i.code}</td>
                      <td className="mono">
                        {i.localization
                          ? `${order.orderNumber}/${i.localization}`
                          : order.orderNumber}
                      </td>
                      <td>{doneDate}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            )}
          </div>
          <div className="page-break"><span>{pt("dodací list")}</span></div>
        </div>

        <div className="doc-title">{pt("DODACÍ LIST")}</div>

        <div className="sec">
          <div className="sec-title">
            {mdrItems.length > 0 ? pt("POLOŽKOVÉ VYÚČTOVÁNÍ ZP NA ZAKÁZKU") : pt("POLOŽKOVÉ VYÚČTOVÁNÍ")}
          </div>
          <table>
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "32%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "25%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>{pt("Kód")}</th>
                <th>{pt("Položka")}</th>
                <th className="r">{pt("Ks")}</th>
                <th className="r">{pt("Cena/ks (Kč)")}</th>
                <th className="r">{pt("Celkem (Kč)")}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td className="mono">{i.code}</td>
                  <td>{i.name}{i.localization ? ` (${i.localization})` : ""}</td>
                  <td className="r">{i.quantity}</td>
                  <td className="r">{formatCZK(i.unitPrice)}</td>
                  <td className="r">{formatCZK(i.unitPrice * i.quantity)}</td>
                </tr>
              ))}
              {hasExtras && (
                <tr className="total-row">
                  <td colSpan={4} className="r">{pt("Mezisoučet položek")}</td>
                  <td className="r">{formatCZK(subtotal)} Kč</td>
                </tr>
              )}
              {shippingAmount > 0 && (
                <tr style={{ background: "#fff" }}>
                  <td colSpan={4} className="r">
                    {pt("Doprava")}{order.shippingMethodName ? ` – ${order.shippingMethodName}` : ""}
                  </td>
                  <td className="r">{formatCZK(shippingAmount)} Kč</td>
                </tr>
              )}
              {order.priceAdjustmentAmount !== 0 && (
                <tr style={{ background: "#fff" }}>
                  <td colSpan={4} className="r">
                    {order.priceAdjustmentAmount < 0 ? pt("Sleva") : pt("Příplatek")}
                    {order.priceAdjustmentReason ? ` – ${order.priceAdjustmentReason}` : ""}
                  </td>
                  <td className="r">
                    {order.priceAdjustmentAmount < 0 ? "−" : "+"}
                    {formatCZK(Math.abs(order.priceAdjustmentAmount))} Kč
                  </td>
                </tr>
              )}
              <tr className="total-final">
                <td colSpan={4} className="r">{pt("Celkem")}</td>
                <td className="r">{formatCZK(grandTotal)} Kč</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: "6pt", fontFamily: "Arial, sans-serif", color: "#777", marginTop: "2px" }}>
            {pt("Tento dodací list není daňovým dokladem.")}
          </div>
        </div>

        {usagesError && (
          <div className="load-error">
            {pt("Použité materiály se nepodařilo načíst — obnov stránku před tiskem.")}
          </div>
        )}
        {usages.length > 0 && (
          <div className="sec">
            <div className="sec-title">{pt("Použité materiály (dohledatelnost šarží)")}</div>
            <table>
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "16%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{pt("Materiál")}</th>
                  <th>{pt("Výrobce")}</th>
                  <th>{pt("Šarže (LOT)")}</th>
                  <th>{pt("Expirace")}</th>
                </tr>
              </thead>
              <tbody>
                {usages.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName}</td>
                    <td>{u.manufacturerName}</td>
                    <td className="mono">{u.lotNumber}</td>
                    <td>{formatDateDDMMYYYY(u.expirationDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mdrItems.length > 0 && (
        <div className="sec">
          <div className="sec-title">{pt("Doplňující informace k dodacímu listu")}</div>
          <div className="info-text" style={{ fontSize: "10px" }}>
            {pt("Dodací list není prohlášením výrobce. Prohlášení výrobce zdravotnického prostředku je součástí balení, jako samostatný dokument.")}
          </div>
        </div>
        )}

        <div className="sec">
          <div className="sec-title">{pt("Potvrzení převzetí")}</div>
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: "7.5pt", marginBottom: "5px" }}>
            <span style={{ color: "#555", fontSize: "7pt" }}>{pt("Datum dodání")}:</span>{" "}
            <strong>{todayDate}</strong>
          </div>
          <div
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "7.5pt",
              marginTop: "10mm",
              display: "flex",
              gap: "30mm",
            }}
          >
            <span>{pt("Převzal (jméno)")}: ______________________</span>
            <span>{pt("Podpis")}: ______________________</span>
          </div>
        </div>
      </div>
    </>
  );
}
