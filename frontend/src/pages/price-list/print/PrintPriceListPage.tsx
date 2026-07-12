import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import dayjs from "dayjs";
import { api } from "../../../api/client";
import { doctorDisplayName, type PriceListItemKind } from "../../../api/types";
import PrintButton from "../../orders/print/PrintButton";
import { makePrintT } from "../../orders/print/printShared";

// Tisk ceníku pro doktora — bez app layoutu (pravidlo projektu), PDF přes
// window.print(). Formát: hlavička laboratoře, komu ceník patří, položky
// po kategoriích; můstky rozepsané na členské ceny.

interface PrintData {
  doctor: {
    titlePrefix: string | null;
    firstName: string;
    lastName: string;
    clinicName: string;
  };
  lab: Record<string, string | null> | null;
  items: {
    id: string;
    code: string;
    name: string;
    kind: PriceListItemKind | null;
    price: number;
    bridgeStumpPrice: number | null;
    bridgePonticPrice: number | null;
    bridgeImplantPrice: number | null;
    categoryName: string;
  }[];
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html,body{background:#fff}
body{font-family:Arial,sans-serif;font-size:9pt;color:#111;line-height:1.5}
.page{width:210mm;min-height:297mm;padding:16mm 18mm;background:#fff;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #161616;padding-bottom:8px;margin-bottom:4px}
.lab-name{font-size:15pt;font-weight:800;color:#161616;letter-spacing:.3px}
.lab-contact{font-size:7.5pt;color:#555;text-align:right;line-height:1.6}
.doc-title{font-size:12pt;font-weight:700;margin:10px 0 2px}
.for-whom{font-size:9.5pt;color:#333;margin-bottom:2px}
.valid{font-size:7.5pt;color:#777;margin-bottom:12px}
.cat{margin-bottom:12px;break-inside:avoid}
.cat-title{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#161616;border-bottom:1px solid #161616;padding-bottom:2px;margin-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:9pt;table-layout:fixed}
tbody tr{border-bottom:.3px solid #e5e5e5}
td{padding:3.5px 6px;vertical-align:top}
td.code{font-family:'Courier New',monospace;font-size:8pt;color:#555}
td.price{text-align:right;font-weight:700;white-space:nowrap}
td.sub{padding-left:16px;color:#444;font-size:8.5pt}
.foot{margin-top:14px;padding-top:6px;border-top:.5px solid #ccc;font-size:7pt;color:#888;display:flex;justify-content:space-between}
@media print{body{margin:0}.page{margin:0;padding:14mm 16mm}}
`;

function kc(halere: number): string {
  const whole = halere % 100 === 0;
  return `${(halere / 100).toLocaleString("cs-CZ", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })} Kč`;
}

export default function PrintPriceListPage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!doctorId) return;
    void api
      .get<PrintData>(`/price-list-items/print/for-doctor?doctorId=${doctorId}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Načtení selhalo"));
  }, [doctorId]);

  if (error) return <div style={{ padding: 32 }}>{error}</div>;
  if (!data) return null;

  const byCategory = new Map<string, PrintData["items"]>();
  for (const i of data.items) {
    if (!byCategory.has(i.categoryName)) byCategory.set(i.categoryName, []);
    byCategory.get(i.categoryName)!.push(i);
  }
  const lab = data.lab;
  // Jazyk tisku dle nastavení laboratoře (Admin → Laboratoř), jako ostatní tisky.
  const pt = makePrintT(Boolean((lab as { printInAppLanguage?: unknown } | null)?.printInAppLanguage ?? true));
  const contact = [lab?.phone, lab?.email].filter(Boolean).join(" · ");
  const address = [lab?.street, [lab?.zip, lab?.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <style>{CSS}</style>
      <PrintButton />
      <div className="page">
        <div className="head">
          <div className="lab-name">{lab?.name ?? "—"}</div>
          <div className="lab-contact">
            {address && <div>{address}</div>}
            {lab?.ico && <div>{pt("IČO")}: {lab.ico}</div>}
            {contact && <div>{contact}</div>}
          </div>
        </div>

        <div className="doc-title">{pt("Ceník protetických prací")}</div>
        <div className="for-whom">
          {pt("Platný pro")}: <strong>{doctorDisplayName(data.doctor)}</strong> — {data.doctor.clinicName}
        </div>
        <div className="valid">{pt("Vystaveno")} {dayjs().format("D. M. YYYY")}</div>

        {data.items.length === 0 ? (
          <div>{pt("Ceník neobsahuje žádné položky.")}</div>
        ) : (
          [...byCategory.entries()].map(([categoryName, items]) => (
            <div className="cat" key={categoryName}>
              <div className="cat-title">{categoryName}</div>
              <table>
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "62%" }} />
                  <col style={{ width: "24%" }} />
                </colgroup>
                <tbody>
                  {items.map((i) =>
                    i.kind === "bridge" ? (
                      // Můstek: rozdělený na subpoložky (cena za člen).
                      <React.Fragment key={i.id}>
                        <tr>
                          <td className="code">{i.code}</td>
                          <td colSpan={2}>{i.name}</td>
                        </tr>
                        <tr>
                          <td />
                          <td className="sub">{pt("člen na pahýl")}</td>
                          <td className="price">{kc(i.bridgeStumpPrice ?? 0)}</td>
                        </tr>
                        <tr>
                          <td />
                          <td className="sub">{pt("mezičlen / pendens")}</td>
                          <td className="price">{kc(i.bridgePonticPrice ?? 0)}</td>
                        </tr>
                        <tr>
                          <td />
                          <td className="sub">{pt("člen na implantát")}</td>
                          <td className="price">{kc(i.bridgeImplantPrice ?? 0)}</td>
                        </tr>
                      </React.Fragment>
                    ) : (
                      <tr key={i.id}>
                        <td className="code">{i.code}</td>
                        <td>{i.name}</td>
                        <td className="price">{kc(i.price)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ))
        )}

        <div className="foot">
          <span>{lab?.name ?? ""}</span>
          <span>{pt("Ceník je informativní; změny vyhrazeny.")}</span>
        </div>
      </div>
    </>
  );
}
