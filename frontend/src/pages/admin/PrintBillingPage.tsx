import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../../api/client";
import { doctorDisplayName, type BillingRow } from "../../api/types";
import { monthLabel } from "../../shared/months";
import PrintButton from "../orders/print/PrintButton";

// Tisk fakturačního podkladu — bez app layoutu (pravidlo projektu),
// PDF = window.print().

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html,body{background:#fff}
body{font-family:Arial,sans-serif;font-size:9pt;color:#111;line-height:1.5}
.page{width:210mm;min-height:297mm;padding:14mm 16mm;background:#fff;margin:0 auto}
.doc-title{font-size:12pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:4px}
.subtitle{font-size:9pt;color:#444;margin-bottom:12px}
/* Každá klinika na samostatné stránce — podklad lze přiložit k faktuře. */
.clinic{margin-bottom:12px;break-after:page;page-break-after:always}
.clinic:last-of-type{break-after:auto;page-break-after:auto}
.order-block{break-inside:avoid;page-break-inside:avoid}
.items{color:#444;font-size:7.5pt;line-height:1.5}
.items div{padding-left:2px}
.clinic-name{font-size:10pt;font-weight:700;border-bottom:.5px solid #000;padding-bottom:2px;margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:8.5pt;table-layout:fixed}
thead th{text-align:left;font-size:7pt;font-weight:700;letter-spacing:.3px;border-bottom:.5px solid #999;padding:3px 6px}
tbody tr{border-bottom:.3px solid #ddd}
td{padding:3px 6px;vertical-align:top}
td.num,th.num{text-align:right}
td.mono{font-family:'Courier New',monospace;font-size:8pt}
.clinic-total{display:flex;justify-content:flex-end;gap:12px;padding:4px 6px;font-weight:700}
@media print{body{margin:0}.page{margin:0;padding:12mm 14mm}}
`;

function formatKc(halere: number): string {
  const whole = halere % 100 === 0;
  return `${(halere / 100).toLocaleString("cs-CZ", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })} Kč`;
}

export default function PrintBillingPage() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? dayjs().format("YYYY-MM");
  const [rows, setRows] = useState<BillingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<BillingRow[]>(`/billing?month=${month}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Načtení selhalo"));
  }, [month]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!rows) return null;

  // Skupiny podle clinicId — dvě kliniky se stejným názvem se nesmí slít.
  const byClinic = new Map<string, BillingRow[]>();
  for (const r of rows) {
    if (!byClinic.has(r.clinicId)) byClinic.set(r.clinicId, []);
    byClinic.get(r.clinicId)!.push(r);
  }

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <div className="page">
        <div className="doc-title">Fakturační podklad</div>
        <div className="subtitle">
          Období: {monthLabel(month)} · dokončené zakázky · vygenerováno{" "}
          {dayjs().format("D. M. YYYY")}
        </div>

        {rows.length === 0 ? (
          <div>V tomto měsíci nejsou žádné dokončené zakázky.</div>
        ) : (
          <>
            {[...byClinic.entries()].map(([clinicId, clinicRows]) => (
              <div className="clinic" key={clinicId}>
                <div className="clinic-name">{clinicRows[0].clinicName}</div>
                <table>
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "24%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Číslo</th>
                      <th>Pacient</th>
                      <th>Doktor</th>
                      <th>Dokončeno</th>
                      <th className="num">Částka</th>
                      <th>Fakturováno</th>
                    </tr>
                  </thead>
                  {/* Více <tbody> pod jednou tabulkou je validní — order-block
                      drží zakázku + její položky pohromadě přes zlom stránky. */}
                  {clinicRows.map((r) => (
                      <tbody className="order-block" key={r.id}>
                        <tr>
                          <td className="mono">{r.orderNumber}</td>
                          <td>{r.patientName}</td>
                          <td>
                            {doctorDisplayName({
                              titlePrefix: r.doctorTitlePrefix,
                              firstName: r.doctorFirstName,
                              lastName: r.doctorLastName,
                            })}
                          </td>
                          <td>{r.doneAt ? dayjs(r.doneAt).format("D. M. YYYY") : "—"}</td>
                          <td className="num">{formatKc(r.billableTotal)}</td>
                          <td>{r.isBilled ? "ano" : "ne"}</td>
                        </tr>
                        {r.items.length > 0 && (
                          <tr>
                            <td />
                            <td colSpan={5} className="items">
                              {r.items.map((it, idx) => (
                                <div key={idx}>
                                  {it.quantity > 1 ? `${it.quantity}× ` : ""}
                                  {it.name}
                                  {it.localization ? ` (${it.localization})` : ""}
                                  {" · "}
                                  {formatKc(it.unitPrice * it.quantity)}
                                </div>
                              ))}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    ))}
                </table>
                <div className="clinic-total">
                  <span>Celkem za kliniku</span>
                  <span>{formatKc(clinicRows.reduce((s, r) => s + r.billableTotal, 0))}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
